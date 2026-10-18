/**
 * Loads and compiles the bundled pattern file (`data/crisis.patterns.json`).
 *
 * All phrases live in the data file. This module only validates its shape
 * and compiles the regexes once, at import time.
 */

import patternData from '../data/crisis.patterns.json';
import { compilePattern } from './regex';
import type {
  BoundaryCue,
  CrisisCategory,
  CueScope,
  ModifierCue,
  ModifierCueName,
  PatternEntry,
  PatternFile,
  ScreenLevel,
} from './types';

/** Scope a cue gets when the data file does not name one. */
export const DEFAULT_SCOPE: Record<ModifierCueName, CueScope> = {
  negated: 'forward',
  third_party: 'forward',
  hypothetical: 'sentence',
  past: 'sentence',
  resolved: 'sentence-or-next',
  idiom: 'overlap',
  quoted: 'within',
};

/** Default `maxGap` for `forward` cues, in characters. */
export const DEFAULT_MAX_GAP = 50;

const CATEGORIES: ReadonlySet<CrisisCategory> = new Set<CrisisCategory>([
  'suicidal_ideation_passive',
  'suicidal_ideation_active',
  'self_harm',
  'unsafe_with_self',
  'acute_distress',
  'immediacy',
  'history',
]);
const LEVELS: ReadonlySet<ScreenLevel> = new Set<ScreenLevel>(['none', 'concern', 'crisis']);
const SET_SCOPES: ReadonlySet<CueScope> = new Set<CueScope>(['forward', 'sentence', 'sentence-or-next', 'within', 'overlap']);
const BLOCK_SCOPES: ReadonlySet<CueScope> = new Set<CueScope>(['clause', 'sentence', 'between']);

/** A compiled detection pattern. */
export interface CompiledPattern {
  entry: PatternEntry;
  re: RegExp;
  /** Position in the data file (stable tie-breaker). */
  order: number;
}

/** A compiled modifier cue with its defaults resolved. */
export interface CompiledCue {
  entry: ModifierCue;
  re: RegExp;
  modifier: ModifierCueName;
  scope: CueScope;
  effect: 'set' | 'block';
  maxGap: number;
}

/** A compiled clause boundary. */
export interface CompiledBoundary {
  entry: BoundaryCue;
  re: RegExp;
  strong: boolean;
}

/** The compiled pattern file. */
export interface CompiledData {
  version: string;
  detection: CompiledPattern[];
  immediacy: CompiledPattern[];
  cues: CompiledCue[];
  boundaries: CompiledBoundary[];
}

/**
 * Validate and compile a pattern file. Exported for tests; the package uses
 * the bundled file through {@link DATA}.
 */
export function compileData(file: PatternFile): CompiledData {
  if (typeof file.version !== 'string' || !Array.isArray(file.patterns) || !Array.isArray(file.modifiers)) {
    throw new Error('crisis-screen: pattern file is malformed');
  }
  const detection: CompiledPattern[] = [];
  const immediacy: CompiledPattern[] = [];
  file.patterns.forEach((entry, order) => {
    if (!CATEGORIES.has(entry.category) || !LEVELS.has(entry.level)) {
      throw new Error(`crisis-screen: ${entry.id} has an unknown category or level`);
    }
    const compiled = { entry, re: compilePattern(entry.id, entry.pattern, entry.flags), order };
    (entry.category === 'immediacy' ? immediacy : detection).push(compiled);
  });

  const cues = file.modifiers.map((entry): CompiledCue => {
    const modifier = entry.modifier;
    if (!(modifier in DEFAULT_SCOPE)) {
      throw new Error(`crisis-screen: ${entry.id} has an unknown modifier`);
    }
    const effect = entry.effect ?? 'set';
    const scope = entry.scope ?? DEFAULT_SCOPE[modifier];
    if (!(effect === 'set' ? SET_SCOPES : BLOCK_SCOPES).has(scope)) {
      throw new Error(`crisis-screen: ${entry.id} has a scope that does not fit its effect`);
    }
    return {
      entry,
      re: compilePattern(entry.id, entry.pattern, entry.flags),
      modifier,
      scope,
      effect,
      maxGap: entry.maxGap ?? DEFAULT_MAX_GAP,
    };
  });

  const boundaries = (file.boundaries ?? []).map((entry): CompiledBoundary => ({
    entry,
    re: compilePattern(entry.id, entry.pattern, entry.flags),
    strong: entry.strength === 'strong',
  }));

  return { version: file.version, detection, immediacy, cues, boundaries };
}

/** The bundled, compiled pattern file. */
export const DATA: CompiledData = compileData(patternData as PatternFile);
