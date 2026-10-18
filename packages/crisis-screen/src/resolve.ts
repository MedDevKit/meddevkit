/**
 * Level resolution (SPEC §4, including the 2026-10-18 clarifications).
 *
 * Precedence picks the one modifier that sets a finding's level:
 *
 *   1. idiom (unless `suppressIdioms: false`)   -> none
 *   2. third_party                               -> none, subject "other"
 *   3. past + resolved                           -> acute distress: none;
 *                                                   crisis language: concern, category history;
 *                                                   history: concern
 *   4. negated / hypothetical / quoted / past    -> each gives a level; the higher wins.
 *        negated: acute distress -> none; anything else -> concern
 *        hypothetical, quoted: -> concern
 *        past (no resolved): crisis language -> concern, category history; else concern
 *      On a tie the first of quoted, hypothetical, negated, past decides, so
 *      past only re-labels a finding as history when it alone decides.
 *   5. no modifier                               -> the pattern's base level
 *
 * `resolved` on its own changes nothing.
 *
 * `threatened_by_other` findings are about another person by definition: their
 * subject is always "other" and the third-party rule does not apply to them
 * (the third party is the one making the threat). Idiom cues still suppress
 * figurative threats; the data file blocks them when the threat reads as
 * literal (SPEC §4 clarifications).
 */

import type { ModifierState } from './scope';
import type { CrisisCategory, ScreenLevel } from './types';
import { LEVEL_RANK } from './match';

/** Outcome of resolving one detection finding. */
export interface Resolution {
  level: ScreenLevel;
  category: CrisisCategory;
  subject: 'self' | 'other' | 'unknown';
}

type Rank4 = 'quoted' | 'hypothetical' | 'negated' | 'past';
const RANK4_ORDER: readonly Rank4[] = ['quoted', 'hypothetical', 'negated', 'past'];

/**
 * Resolve a detection finding's level, category and subject.
 *
 * @param category - Category of the pattern
 * @param base - Base level of the pattern
 * @param mods - Modifiers that apply
 * @param suppressIdioms - Whether idiom cues set the level to none
 */
export function resolveFinding(
  category: CrisisCategory,
  base: ScreenLevel,
  mods: ModifierState,
  suppressIdioms: boolean,
): Resolution {
  const threat = category === 'threatened_by_other';
  const subject: Resolution['subject'] =
    threat || mods.thirdParty ? 'other' : mods.subjectUnknown ? 'unknown' : 'self';
  // Past crisis language is reported as history (SPEC §4: "crisis -> concern + history").
  const history: CrisisCategory = base === 'crisis' ? 'history' : category;

  if (base === 'none') return { level: 'none', category, subject };
  if (mods.idiom && suppressIdioms) return { level: 'none', category, subject };
  if (mods.thirdParty && !threat) return { level: 'none', category, subject };
  if (mods.past && mods.resolved) {
    if (category === 'acute_distress') return { level: 'none', category, subject };
    return { level: 'concern', category: history, subject };
  }

  const outcomes: Partial<Record<Rank4, ScreenLevel>> = {};
  if (mods.quoted) outcomes.quoted = 'concern';
  if (mods.hypothetical) outcomes.hypothetical = 'concern';
  if (mods.negated) outcomes.negated = category === 'acute_distress' ? 'none' : 'concern';
  if (mods.past) outcomes.past = 'concern';

  let decider: Rank4 | undefined;
  for (const m of RANK4_ORDER) {
    const level = outcomes[m];
    if (level === undefined) continue;
    if (decider === undefined || LEVEL_RANK[level] > LEVEL_RANK[outcomes[decider] as ScreenLevel]) decider = m;
  }
  if (decider === undefined) return { level: base, category, subject };
  const level = minLevel(outcomes[decider] as ScreenLevel, base);
  return { level, category: decider === 'past' ? history : category, subject };
}

/** Modifiers never raise a level above the pattern's base level. */
function minLevel(a: ScreenLevel, b: ScreenLevel): ScreenLevel {
  return LEVEL_RANK[a] <= LEVEL_RANK[b] ? a : b;
}
