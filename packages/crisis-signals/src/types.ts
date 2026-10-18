/**
 * Public types for @meddevkit/crisis-signals.
 * See docs/specs/crisis-signals/SPEC.md §4 (output model), §5 (API) and §6 (pattern data).
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
 * `threatened_by_other` flags a person threatening the writer (base level
 * `concern`, subject `other`); idiom cues suppress it only when the threat is
 * figurative ("my mom is going to kill me when she sees my grades").
 */
export type CrisisCategory =
  | 'suicidal_ideation_passive'
  | 'suicidal_ideation_active'
  | 'self_harm'
  | 'unsafe_with_self'
  | 'acute_distress'
  | 'immediacy'
  | 'history'
  | 'threatened_by_other';

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
  /**
   * Regex source in the portable ECMAScript/Python subset (SPEC §6). May use
   * `{{fragment}}` references (see {@link FragmentEntry}). When a capturing
   * group takes part in a match, the first such group is the finding's span
   * and the rest of the match is context that must be present (for example a
   * first-person frame "I've never" before the core "cut", so a negation in
   * the frame stays outside the span and scopes over it). Without a
   * participating group, the whole match is the span. An empty group is a
   * veto: the match consumes its text and yields no finding (for example
   * "reading about self-harm").
   */
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
 * A named, reusable piece of regex in `data/crisis.patterns.json`
 * (`fragments`), such as a first-person frame or a vocabulary slot. Patterns,
 * cues, boundaries and later fragments reference it as `{{id}}`; the loader
 * replaces each reference with `(?:<fragment>)` before compiling. A consumer
 * in another runtime must apply the same substitution.
 */
export interface FragmentEntry {
  /** Stable fragment id, upper case (`SELF`, `FILL`, `BODY`). */
  id: string;
  /** Regex source in the portable subset; may reference earlier fragments. */
  pattern: string;
  /** What the fragment covers. */
  note?: string;
  /** Source keys defined in NOTICE. */
  sources: string[];
  /** How the fragment relates to its sources. */
  relation: SourceRelation;
}

/**
 * Kind of context cue in the pattern file's `modifiers` list. Includes
 * `third_party`, which sets a finding's subject rather than a modifier flag.
 */
export type ModifierCueName = ModifierName | 'third_party';

/**
 * Where a cue looks for findings (README, "Pattern file format"):
 * - `forward`: the finding starts at or after the cue's end, within `maxGap`
 *   characters and the same clause (negation-style scope).
 * - `sentence`: anywhere in the same sentence, unless a `strong` boundary
 *   lies between the cue and the finding.
 * - `sentence-or-next`: the same sentence or the next one (`resolved`).
 * - `within`: the finding lies inside the cue's match (quotations).
 * - `overlap`: the cue's match overlaps the finding (idioms, reflexives).
 * - `clause` (block cues): the same clause as the finding.
 * - `between` (block cues): after a `forward` cue of the same modifier and
 *   before the end of the finding; cancels that cue only.
 * Block cues may also use `sentence` (same strong segment) and
 * `sentence-or-next` (the same or the previous sentence).
 */
export type CueScope = 'forward' | 'sentence' | 'sentence-or-next' | 'within' | 'overlap' | 'clause' | 'between';

/** One context-modifier cue in `data/crisis.patterns.json`. */
export interface ModifierCue {
  /** Stable cue id, `<modifier>.<name>`. */
  id: string;
  /** Which modifier this cue signals. */
  modifier: ModifierCueName;
  /** Where the cue applies. Defaults per modifier when omitted (see the engine's `DEFAULT_SCOPE`). */
  scope?: CueScope;
  /** `set` (default) turns the modifier on; `block` cancels it (pseudo-cue). */
  effect?: 'set' | 'block';
  /** `forward` scope only: maximum characters between the cue's end and the finding's start (default 50). */
  maxGap?: number;
  /** Subject the cue implies for findings it applies to (for example `unknown` for a generic "someone"). */
  subject?: 'unknown';
  /** When set, the cue applies only to findings of these categories. */
  categories?: CrisisCategory[];
  /** Regex source in the portable ECMAScript/Python subset (SPEC §6); may use `{{fragment}}` references. */
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

/**
 * Clause boundary in `data/crisis.patterns.json`. `clause` boundaries end
 * `forward` and `clause` scopes; `strong` boundaries also end `sentence` scopes.
 */
export interface BoundaryCue {
  /** Stable id, `boundary.<name>`. */
  id: string;
  /** How far the boundary cuts. */
  strength: 'clause' | 'strong';
  /** Regex source in the portable ECMAScript/Python subset (SPEC §6); may use `{{fragment}}` references. */
  pattern: string;
  /** Regex flags; only a whole-pattern `i` is allowed. */
  flags?: string;
  /** Why the boundary is shaped the way it is. */
  note?: string;
  /** Source keys defined in NOTICE. */
  sources: string[];
  /** How the boundary relates to its sources. */
  relation: SourceRelation;
}

/** Shape of `data/crisis.patterns.json`. */
export interface PatternFile {
  /** Semver version of the pattern data, reported as `patternsVersion`. */
  version: string;
  /** Named regex pieces referenced as `{{id}}`. Optional; expanded before compiling. */
  fragments?: FragmentEntry[];
  /** Detection patterns. */
  patterns: PatternEntry[];
  /** Context-modifier cues. */
  modifiers: ModifierCue[];
  /** Clause boundaries used for modifier scope. Optional for compatibility; none means sentence splitting only. */
  boundaries?: BoundaryCue[];
}
