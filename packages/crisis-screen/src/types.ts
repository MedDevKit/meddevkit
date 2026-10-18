/**
 * Public types for @meddevkit/crisis-screen.
 * See docs/specs/crisis-screen/SPEC.md §4 (output model), §5 (API) and §6 (pattern data).
 */

/**
 * Screen level, per finding and per text.
 * - `crisis`: present, first-person thoughts of suicide or self-harm, or feeling unsafe with oneself.
 * - `concern`: acute distress without self-harm language, or crisis language softened by context.
 * - `none`: nothing found, or only idioms, third parties, or clearly resolved past distress.
 */
export type ScreenLevel = 'none' | 'concern' | 'crisis';

/**
 * Pattern family a finding belongs to (SPEC §4, Categories).
 * `immediacy` is a flag-only category: it never lowers a level.
 */
export type CrisisCategory =
  | 'suicidal_ideation_passive'
  | 'suicidal_ideation_active'
  | 'self_harm'
  | 'unsafe_with_self'
  | 'acute_distress'
  | 'immediacy'
  | 'history';

/**
 * Context modifier reported on every finding (SPEC §4, Context modifiers).
 * Third-party context is reported through {@link ScreenFinding.subject} instead.
 */
export type ModifierName = 'negated' | 'past' | 'resolved' | 'hypothetical' | 'quoted' | 'idiom';

/** Options for `screenText`. */
export interface ScreenOptions {
  /** Default true. False skips idiom suppression (for audits). */
  suppressIdioms?: boolean;
}

/** One matched pattern, with its context and resulting level. */
export interface ScreenFinding {
  /** Pattern id from the pattern file, for example `si_active.ending_it`. */
  ruleId: string;
  /** Pattern family of the rule. */
  category: CrisisCategory;
  /** Level before modifiers. */
  baseLevel: ScreenLevel;
  /** Level after modifiers. */
  level: ScreenLevel;
  /** Start offset of the match in the input (UTF-16 code units). */
  startOffset: number;
  /** End offset of the match in the input (exclusive, UTF-16 code units). */
  endOffset: number;
  /** The matched span only, max 120 chars. */
  text: string;
  /** Which context modifiers apply to this finding. */
  modifiers: Record<ModifierName, boolean>;
  /** Who the language is about: the writer, someone else, or unclear. */
  subject: 'self' | 'other' | 'unknown';
}

/** Result of screening one text. */
export interface ScreenResult {
  /** Highest level among the findings. */
  level: ScreenLevel;
  /** True when a crisis finding co-occurs with a plan, means, timing or preparation cue. */
  immediacy: boolean;
  /** In text order, including findings modified to 'none'. */
  findings: ScreenFinding[];
  /** `version` of the pattern file used. */
  patternsVersion: string;
}

/**
 * How a pattern relates to its sources (SPEC §6):
 * `informed-by` is our own wording; `adapted-from` is close to the source's
 * wording, so the source's licence terms apply.
 */
export type SourceRelation = 'informed-by' | 'adapted-from';

/** One detection pattern in `data/crisis.patterns.json`. */
export interface PatternEntry {
  /** Stable rule id, `<family>.<name>`. */
  id: string;
  /** Pattern family. */
  category: CrisisCategory;
  /** Base level before modifiers. */
  level: ScreenLevel;
  /** Regex source in the portable ECMAScript/Python subset (SPEC §6). */
  pattern: string;
  /** Regex flags; only a whole-pattern `i` is allowed. */
  flags?: string;
  /** Why the pattern is shaped the way it is. */
  note?: string;
  /** Source keys defined in NOTICE, for example `srl-v1.0` or `nimh-asq`. */
  sources: string[];
  /** How the pattern relates to its sources. */
  relation: SourceRelation;
}

/**
 * Kind of context cue in the pattern file's `modifiers` list. Includes
 * `third_party`, which sets a finding's subject rather than a modifier flag.
 */
export type ModifierCueName = ModifierName | 'third_party';

/** One context-modifier cue in `data/crisis.patterns.json`. */
export interface ModifierCue {
  /** Stable cue id, `<modifier>.<name>`. */
  id: string;
  /** Which modifier this cue signals. */
  modifier: ModifierCueName;
  /** Regex source in the portable ECMAScript/Python subset (SPEC §6). */
  pattern: string;
  /** Regex flags; only a whole-pattern `i` is allowed. */
  flags?: string;
  /** Why the cue is shaped the way it is. */
  note?: string;
  /** Source keys defined in NOTICE. */
  sources: string[];
  /** How the cue relates to its sources. */
  relation: SourceRelation;
}

/** Shape of `data/crisis.patterns.json`. */
export interface PatternFile {
  /** Semver version of the pattern data, reported as `patternsVersion`. */
  version: string;
  /** Detection patterns. */
  patterns: PatternEntry[];
  /** Context-modifier cues. */
  modifiers: ModifierCue[];
}
