/**
 * Loads and compiles the bundled pattern file (`data/crisis.patterns.json`).
 *
 * All phrases live in the data file. This module only validates its shape,
 * expands `{{fragment}}` references and compiles the regexes once, at import
 * time.
 */

import patternData from '../data/crisis.patterns.json';
import { compilePattern } from './regex';
import type {
  BoundaryCue,
  CrisisCategory,
  CueScope,
  FragmentEntry,
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
  'threatened_by_other',
]);
const LEVELS: ReadonlySet<ScreenLevel> = new Set<ScreenLevel>(['none', 'concern', 'crisis']);
const SET_SCOPES: ReadonlySet<CueScope> = new Set<CueScope>(['forward', 'sentence', 'sentence-or-next', 'within', 'overlap']);
const BLOCK_SCOPES: ReadonlySet<CueScope> = new Set<CueScope>(['clause', 'sentence', 'sentence-or-next', 'between']);
const FRAGMENT_REF = /\{\{([A-Za-z_][A-Za-z0-9_]*)\}\}/g;

/**
 * Expand the `fragments` section into plain regex sources, in file order.
 * A fragment may reference only fragments listed before it, so there are no
 * cycles. Errors name the fragment id only.
 */
export function resolveFragments(fragments: readonly FragmentEntry[] | undefined): ReadonlyMap<string, string> {
  const out = new Map<string, string>();
  for (const f of fragments ?? []) {
    if (typeof f.id !== 'string' || typeof f.pattern !== 'string' || out.has(f.id)) {
      throw new Error(`crisis-signals: fragment ${String(f.id)} is malformed or duplicated`);
    }
    out.set(f.id, expandFragments(f.id, f.pattern, out));
  }
  return out;
}

/**
 * Replace every `{{id}}` in `source` with `(?:<fragment>)`. Throws (naming
 * `ownerId` only) when a reference is unknown.
 */
export function expandFragments(ownerId: string, source: string, fragments: ReadonlyMap<string, string>): string {
  return source.replace(FRAGMENT_REF, (_, name: string) => {
    const body = fragments.get(name);
    if (body === undefined) throw new Error(`crisis-signals: ${ownerId} references an unknown fragment`);
    return `(?:${body})`;
  });
}

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
  /** Categories the cue is restricted to; undefined means every category. */
  categories?: ReadonlySet<CrisisCategory>;
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
    throw new Error('crisis-signals: pattern file is malformed');
  }
  const fragments = resolveFragments(file.fragments);
  const source = (id: string, pattern: string): string => expandFragments(id, pattern, fragments);
  const detection: CompiledPattern[] = [];
  const immediacy: CompiledPattern[] = [];
  file.patterns.forEach((entry, order) => {
    if (!CATEGORIES.has(entry.category) || !LEVELS.has(entry.level)) {
      throw new Error(`crisis-signals: ${entry.id} has an unknown category or level`);
    }
    const compiled = { entry, re: compilePattern(entry.id, source(entry.id, entry.pattern), entry.flags, true), order };
    (entry.category === 'immediacy' ? immediacy : detection).push(compiled);
  });

  const cues = file.modifiers.map((entry): CompiledCue => {
    const modifier = entry.modifier;
    if (!(modifier in DEFAULT_SCOPE)) {
      throw new Error(`crisis-signals: ${entry.id} has an unknown modifier`);
    }
    const effect = entry.effect ?? 'set';
    const scope = entry.scope ?? DEFAULT_SCOPE[modifier];
    if (!(effect === 'set' ? SET_SCOPES : BLOCK_SCOPES).has(scope)) {
      throw new Error(`crisis-signals: ${entry.id} has a scope that does not fit its effect`);
    }
    if (entry.categories !== undefined && !entry.categories.every((c) => CATEGORIES.has(c))) {
      throw new Error(`crisis-signals: ${entry.id} names an unknown category`);
    }
    return {
      entry,
      re: compilePattern(entry.id, source(entry.id, entry.pattern), entry.flags),
      modifier,
      scope,
      effect,
      maxGap: entry.maxGap ?? DEFAULT_MAX_GAP,
      categories: entry.categories === undefined ? undefined : new Set(entry.categories),
    };
  });

  const boundaries = (file.boundaries ?? []).map((entry): CompiledBoundary => ({
    entry,
    re: compilePattern(entry.id, source(entry.id, entry.pattern), entry.flags),
    strong: entry.strength === 'strong',
  }));

  return { version: file.version, detection, immediacy, cues, boundaries };
}

/** The bundled, compiled pattern file. */
export const DATA: CompiledData = compileData(patternData as PatternFile);
