/**
 * Severity Pattern Detection
 *
 * Identifies severity modifiers in clinical text and the finding they modify.
 * Examples: "mild edema", "severe chest pain", "life-threatening bleed"
 *
 * Design choices:
 * - A term directly preceded by a negator ("not", "no", "non-", "without")
 *   is skipped: "not significantly changed" and "no significant swelling"
 *   describe the absence of a finding, which negation detection covers.
 * - Word boundaries keep unrelated words out: "marker", "minority",
 *   "significance", "insignificant" never match.
 * - Non-severity collocations are excluded: "critical care", "critical
 *   access", "critical thinking/pathway/appraisal", "statistically/clinically
 *   significant", "significant for" ("PMH significant for HTN" means
 *   "notable for"), "significant other", and "marked with/as/by/for/on/in".
 * - Compound terms win over their parts: "mild-to-moderate" is one
 *   'moderate' modifier, "moderate-to-severe" is one 'severe' modifier.
 * - Generic uses such as "minor surgery" or "moderate-intensity exercise"
 *   are matched; the pattern does not judge clinical relevance.
 * - `modifiedText` is the text after the term up to punctuation, a line
 *   break, the next severity term, or 40 characters (trimmed to a whole
 *   word), mirroring negation detection. Offsets span term + modifiedText.
 *
 * OPEN SOURCE: Basic severity vocabulary
 * PRIVATE (Cloud): Specialty grading scales, tuned thresholds
 *
 * @packageDocumentation
 */

import type { SeverityLevel, SeverityModifier } from '../types';

// ============================================================================
// Severity Patterns
// ============================================================================

/**
 * Patterns for detecting severity terms.
 * A pattern with a capture group supplies its own modified finding
 * (e.g. "worst headache of my life" -> "headache").
 */
export const SEVERITY_PATTERNS: Record<SeverityLevel, RegExp[]> = {
  /**
   * Mild - "mild", "slight", "minimal", "minor"
   */
  mild: [
    // "mild", "mildly" (but not the start of "mild-to-moderate")
    /\bmild(?:ly)?\b(?![\s-]+to[\s-]+moderate)/gi,
    // "slight", "slightly", "minimal", "minimally", "minor"
    /\b(?:slight(?:ly)?|minimal(?:ly)?|minor)\b/gi,
  ],

  /**
   * Moderate - "moderate", "mild-to-moderate"
   */
  moderate: [
    // "mild-to-moderate", "mild to moderate"
    /\bmild[\s-]+to[\s-]+moderate(?:ly)?\b/gi,
    // "moderate", "moderately" (but not the start of "moderate-to-severe")
    /\bmoderate(?:ly)?\b(?![\s-]+to[\s-]+severe)/gi,
  ],

  /**
   * Severe - "severe", "marked", "significant", "extreme", "excruciating",
   * "worst ... of (my|his|her|their) life"
   */
  severe: [
    // "moderate-to-severe", "severe", "severely"
    /\b(?:moderate[\s-]+to[\s-]+)?severe(?:ly)?\b/gi,
    // "marked", "markedly", "significant", "significantly"
    // (not "marked with/as/...", "significant for", "significant other")
    /\b(?:marked(?:ly)?(?![\s-]+(?:with|as|by|for|on|in)\b)|significant(?:ly)?(?![\s-]+(?:for|others?)\b))\b/gi,
    // "extreme", "extremely", "excruciating"
    /\b(?:extreme(?:ly)?|excruciating)\b/gi,
    // "worst headache of my life" - captures the finding
    /\bworst[ \t]+((?:[a-z]+[ \t]+){0,2}?[a-z]+)[ \t]+(?:of|in)[ \t]+(?:my|his|her|their|the[ \t]+patient's)[ \t]+life\b/gi,
  ],

  /**
   * Critical - "critical", "life-threatening", "profound"
   */
  critical: [
    // "critical", "critically" (not "critical care", "critical access", ...)
    /\bcritical(?:ly)?\b(?![\s-]+(?:care|access|thinking|pathways?|appraisal)\b)/gi,
    // "life-threatening", "life threatening"
    /\blife[\s-]threatening\b/gi,
    // "profound", "profoundly"
    /\bprofound(?:ly)?\b/gi,
  ],
};

/**
 * Confidence scores for severity levels
 */
export const SEVERITY_CONFIDENCE: Record<SeverityLevel, number> = {
  mild: 0.8,
  moderate: 0.85,
  severe: 0.85,
  critical: 0.9,
};

/**
 * Maximum length of the captured modified finding (matches negation.ts)
 */
const MAX_MODIFIED_LENGTH = 40;

/**
 * Negators that, directly before a term, suppress it
 */
const PRECEDING_NEGATOR = /\b(?:not|no|non|without)[\s-]+$/i;

/**
 * Qualifiers that turn "significant" into a statistical/clinical-relevance
 * statement rather than a severity ("statistically significant")
 */
const PRECEDING_SIGNIFICANCE_QUALIFIER = /\b(?:statistically|clinically)\s+$/i;

/**
 * Connectives stripped from the end of a modified finding
 */
const TRAILING_CONNECTIVES =
  /(?:\s+(?:and|or|with|but|of|to|the|a|an|in|on|at|from))+$/i;

// ============================================================================
// Detection Functions
// ============================================================================

/**
 * Detect severity modifiers in clinical text
 *
 * @param text - Clinical text to analyze
 * @returns Array of severity modifiers with positions, sorted by position
 *
 * @example
 * ```typescript
 * const severity = detectSeverity('Severe chest pain with mild nausea.');
 * // Returns [
 * //   { level: 'severe', term: 'Severe', modifiedText: 'chest pain', ... },
 * //   { level: 'mild', term: 'mild', modifiedText: 'nausea', ... }
 * // ]
 * ```
 */
export function detectSeverity(text: string): SeverityModifier[] {
  interface TermMatch {
    level: SeverityLevel;
    term: string;
    start: number;
    end: number;
    finding?: string;
  }

  const terms: TermMatch[] = [];

  for (const [level, patterns] of Object.entries(SEVERITY_PATTERNS)) {
    for (const pattern of patterns) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;

      while ((match = regex.exec(text)) !== null) {
        const before = text.slice(Math.max(0, match.index - 16), match.index);
        if (PRECEDING_NEGATOR.test(before)) {
          continue;
        }
        if (
          /^significant/i.test(match[0]) &&
          PRECEDING_SIGNIFICANCE_QUALIFIER.test(before)
        ) {
          continue;
        }
        terms.push({
          level: level as SeverityLevel,
          term: match[0],
          start: match.index,
          end: match.index + match[0].length,
          finding: match[1],
        });
      }
    }
  }

  // Keep the longest term among overlaps ("mild-to-moderate" over "moderate")
  const kept: TermMatch[] = [];
  const ranked = [...terms].sort(
    (a, b) => b.end - b.start - (a.end - a.start) || a.start - b.start
  );
  for (const t of ranked) {
    if (!kept.some((k) => t.start < k.end && k.start < t.end)) {
      kept.push(t);
    }
  }
  kept.sort((a, b) => a.start - b.start);

  return kept.map((t, i) => {
    let modifiedText = t.finding;
    let endOffset = t.end;

    if (modifiedText === undefined) {
      const limit = i + 1 < kept.length ? kept[i + 1].start : text.length;
      const extracted = extractModifiedText(text, t.end, limit);
      if (extracted) {
        modifiedText = extracted.text;
        endOffset = extracted.end;
      }
    }

    return {
      level: t.level,
      term: t.term,
      modifiedText,
      startOffset: t.start,
      endOffset,
      confidence: SEVERITY_CONFIDENCE[t.level],
    };
  });
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Extract the finding following a severity term.
 * Stops at punctuation, a line break, `limit` (next term), or
 * MAX_MODIFIED_LENGTH characters, trimmed to a whole word.
 */
function extractModifiedText(
  text: string,
  from: number,
  limit: number
): { text: string; end: number } | null {
  // Must be separated from the term by whitespace or a hyphen
  const lead = /^[ \t-]+/.exec(text.slice(from, limit));
  if (!lead) return null;

  const start = from + lead[0].length;
  const maxEnd = Math.min(limit, start + MAX_MODIFIED_LENGTH);
  let segment = text.slice(start, maxEnd);

  const stop = segment.search(/[.;,:!?()\n\r]/);
  let cutByLength = false;
  if (stop >= 0) {
    segment = segment.slice(0, stop);
  } else if (maxEnd < limit && /[A-Za-z0-9]/.test(text.charAt(maxEnd))) {
    cutByLength = true;
  }

  if (cutByLength) {
    // Drop a partial trailing word
    segment = segment.replace(/\s*\S+$/, '');
  }

  // Drop trailing connectives left by a stop ("chest pain with" -> "chest pain")
  const trimmed = segment
    .replace(/\s+$/, '')
    .replace(TRAILING_CONNECTIVES, '');
  if (!/[A-Za-z]/.test(trimmed)) return null;

  return {
    text: trimmed.replace(/\s+/g, ' '),
    end: start + trimmed.length,
  };
}
