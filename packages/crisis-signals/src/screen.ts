/**
 * `screenText`: detection, modifier scoping, level resolution and immediacy.
 *
 * Privacy (SPEC §9): nothing here logs, stores or sends text, and errors
 * never include text. Findings carry offsets and spans of at most 120 chars.
 */

import { DATA, type CompiledData } from './data';
import { passingGates } from './gate';
import { LEVEL_RANK, collectMatches, dedupe, matchPatterns, type Match } from './match';
import { resolveFinding } from './resolve';
import { CueIndex, type ModifierState } from './scope';
import { indexText } from './text';
import type { ModifierName, ScreenFinding, ScreenLevel, ScreenOptions, ScreenResult } from './types';

/** Maximum length of `ScreenFinding.text`. */
export const MAX_SPAN_TEXT = 120;

function spanText(text: string, start: number, end: number): string {
  let stop = Math.min(end, start + MAX_SPAN_TEXT);
  // Do not cut a surrogate pair in half.
  const code = text.charCodeAt(stop - 1);
  if (stop < end && code >= 0xd800 && code <= 0xdbff) stop--;
  return text.slice(start, stop);
}

function modifierFlags(mods: ModifierState): Record<ModifierName, boolean> {
  return {
    negated: mods.negated,
    past: mods.past,
    resolved: mods.resolved,
    hypothetical: mods.hypothetical,
    quoted: mods.quoted,
    idiom: mods.idiom,
  };
}

/**
 * An immediacy cue counts only when it is the writer's own, present, literal
 * statement: not negated ("I don't have a plan"), past, hypothetical, quoted,
 * figurative or about someone else.
 */
function immediacyActive(mods: ModifierState, suppressIdioms: boolean): boolean {
  return (
    !mods.negated &&
    !mods.past &&
    !mods.hypothetical &&
    !mods.quoted &&
    !mods.thirdParty &&
    !(mods.idiom && suppressIdioms)
  );
}

/** Validate arguments (messages never include text) and return `suppressIdioms`. */
function readOptions(text: unknown, options: unknown): boolean {
  if (typeof text !== 'string') {
    throw new TypeError('crisis-signals: screenText expects a string');
  }
  if (options === undefined || options === null) return true;
  if (typeof options !== 'object') {
    throw new TypeError('crisis-signals: options must be an object');
  }
  const suppress = (options as ScreenOptions).suppressIdioms;
  if (suppress !== undefined && typeof suppress !== 'boolean') {
    throw new TypeError('crisis-signals: options.suppressIdioms must be a boolean');
  }
  return suppress ?? true;
}

/**
 * Screen `text` with a compiled pattern file. {@link screenText} uses the
 * bundled one; tests use this to exercise alternative data.
 */
export function screenWith(data: CompiledData, text: string, options?: ScreenOptions): ScreenResult {
  const suppressIdioms = readOptions(text, options);
  if (text.length === 0) {
    return { level: 'none', immediacy: false, findings: [], patternsVersion: data.version };
  }

  const index = indexText(text, data.boundaries);
  const ungatedRaw = collectMatches(text, data.detection);
  let detection = dedupe(ungatedRaw);
  const immediacy = matchPatterns(text, data.immediacy);
  let cues = new CueIndex(text, data.cues, index, detection);

  // Context-gated patterns: keep a match only when its context is nearby,
  // then resolve overlaps against the ungated matches and re-index the cues.
  const passing = passingGates(
    { text, index, cues, suppressIdioms, detection, immediacy },
    collectMatches(text, data.gated),
  );
  if (passing.length > 0) {
    detection = dedupe([...ungatedRaw, ...passing]);
    cues = new CueIndex(text, data.cues, index, detection);
  }

  const findings: ScreenFinding[] = [];
  let level: ScreenLevel = 'none';
  let crisisPresent = false;

  for (const m of detection) {
    const mods = cues.evaluate(m, m.pattern.entry.category);
    const r = resolveFinding(m.pattern.entry.category, m.pattern.entry.level, mods, suppressIdioms);
    if (r.level === 'crisis') crisisPresent = true;
    if (LEVEL_RANK[r.level] > LEVEL_RANK[level]) level = r.level;
    findings.push(toFinding(text, m, r.category, r.level, mods, r.subject));
  }

  let immediacyFlag = false;
  for (const m of immediacy) {
    const mods = cues.evaluate(m, 'immediacy');
    const active = crisisPresent && immediacyActive(mods, suppressIdioms);
    if (active) immediacyFlag = true;
    const subject = mods.thirdParty ? 'other' : mods.subjectUnknown ? 'unknown' : 'self';
    findings.push(toFinding(text, m, 'immediacy', active ? 'crisis' : 'none', mods, subject));
  }

  findings.sort((a, b) => a.startOffset - b.startOffset || a.endOffset - b.endOffset);
  return { level, immediacy: immediacyFlag, findings, patternsVersion: data.version };
}

function toFinding(
  text: string,
  m: Match,
  category: ScreenFinding['category'],
  level: ScreenLevel,
  mods: ModifierState,
  subject: ScreenFinding['subject'],
): ScreenFinding {
  return {
    ruleId: m.pattern.entry.id,
    category,
    baseLevel: m.pattern.entry.level,
    level,
    startOffset: m.start,
    endOffset: m.end,
    text: spanText(text, m.start, m.end),
    modifiers: modifierFlags(mods),
    subject,
  };
}

/**
 * Screen one text for first-person crisis language.
 *
 * Returns the highest level among the findings (`none`, `concern` or
 * `crisis`), an `immediacy` flag, and every finding in text order, including
 * findings that context softened to `none`. Does not log, store or send the
 * text. Throws a `TypeError` (without any text) for invalid arguments.
 *
 * @param text - Free text, for example one conversational turn
 * @param options - `suppressIdioms: false` reports idioms without suppressing them (audits)
 */
export function screenText(text: string, options?: ScreenOptions): ScreenResult {
  return screenWith(DATA, text, options);
}
