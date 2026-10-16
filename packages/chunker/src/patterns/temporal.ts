/**
 * Temporal Pattern Detection
 *
 * Identifies temporal expressions in clinical text: symptom durations,
 * onset, relative time references, and clinical course descriptors.
 * Examples: "for 3 days", "started 2 days ago", "yesterday", "intermittent"
 *
 * Design choices:
 * - Overlapping matches are deduplicated, preferring the longer match and
 *   then the higher confidence ("since yesterday" wins over "yesterday").
 * - Future scheduling ("follow up in 2 weeks") is not a temporal finding
 *   and is not detected.
 * - Vague quantities ("several", "few") produce `value: undefined`;
 *   "a"/"an"/"one" parse as 1 and "a couple" as 2.
 * - Expressions never span a line break (separators are spaces/tabs).
 * - "acute" and "chronic" are usually part of a diagnosis name ("acute
 *   kidney injury", "chronic kidney disease"), so neither matches on its
 *   own. They count as course only in course-specific constructions:
 *   "acute/sudden/gradual onset", "chronic pain", and "chronically".
 *
 * OPEN SOURCE: Basic patterns for common temporal phrasing
 * PRIVATE (Cloud): Absolute date normalization, timeline reconstruction
 *
 * @packageDocumentation
 */

import type { TemporalExpression, TemporalType, TemporalUnit } from '../types';

// ============================================================================
// Pattern Components
// ============================================================================

/**
 * Quantity: digits, number words, or vague quantifiers
 */
const QTY =
  '(\\d+(?:\\.\\d+)?|an?|one|two|three|four|five|six|seven|eight|nine|ten|twelve|several|a[ \\t]+few|few|a[ \\t]+couple(?:[ \\t]+of)?|couple(?:[ \\t]+of)?)';

/**
 * Time unit (plural or abbreviated)
 */
const UNIT =
  '(minutes?|mins?|hours?|hrs?|days?|weeks?|wks?|months?|mos?|years?|yrs?)';

/**
 * Singular time unit used in hyphenated compounds ("3-day history")
 */
const UNIT_SINGULAR = '(minute|hour|day|week|month|year)';

/**
 * Relative anchors ("this morning", "last night", "yesterday")
 */
const ANCHOR =
  '(?:yesterday|overnight|today|this[ \\t]+(?:morning|afternoon|evening)|last[ \\t]+(?:night|week|month|year)|earlier[ \\t]+today)';

// ============================================================================
// Temporal Patterns
// ============================================================================

/**
 * Patterns for detecting temporal expressions.
 * Capture groups (when present): 1 = quantity, 2 = unit
 */
export const TEMPORAL_PATTERNS: Record<TemporalType, RegExp[]> = {
  /**
   * Duration - how long a finding has been present
   */
  duration: [
    // "for 3 days", "for the past 2 weeks", "for several days"
    new RegExp(`\\bfor[ \\t]+(?:the[ \\t]+)?(?:past[ \\t]+|last[ \\t]+)?${QTY}[ \\t]+${UNIT}\\b`, 'gi'),
    // "x 2 weeks", "x2 weeks", "x 10 days" (requires a number: never "x-ray")
    new RegExp(`\\bx[ \\t]?(\\d+)[ \\t]*${UNIT}\\b`, 'gi'),
    // "3-day history", "2 week course"
    new RegExp(`\\b(\\d+)[- \\t]${UNIT_SINGULAR}[ \\t]+(?:history|course|duration)\\b`, 'gi'),
    // "over the past 2 months", "within the last 24 hours"
    new RegExp(`\\b(?:over|during|within|in)[ \\t]+the[ \\t]+(?:past|last)[ \\t]+${QTY}[ \\t]+${UNIT}\\b`, 'gi'),
  ],

  /**
   * Onset - when a finding started
   */
  onset: [
    // "started 2 days ago", "onset 2 hours ago", "began about a week ago"
    new RegExp(
      `\\b(?:started|starting|began|begun|onset|developed|noticed)[ \\t]+(?:about[ \\t]+|approximately[ \\t]+|around[ \\t]+)?${QTY}[ \\t]+${UNIT}[ \\t]+ago\\b`,
      'gi'
    ),
    // "began this morning", "started yesterday", "onset last night"
    new RegExp(`\\b(?:started|starting|began|begun|onset|developed|noticed)[ \\t]+${ANCHOR}\\b`, 'gi'),
    // "since yesterday", "since last night", "since 3 days ago"
    new RegExp(
      `\\bsince[ \\t]+(?:${ANCHOR}|(?:mon|tues|wednes|thurs|fri|satur|sun)day|${QTY}[ \\t]+${UNIT}[ \\t]+ago)\\b`,
      'gi'
    ),
  ],

  /**
   * Relative - time reference relative to the encounter
   */
  relative: [
    // "2 weeks ago", "a few days ago"
    new RegExp(`\\b${QTY}[ \\t]+${UNIT}[ \\t]+ago\\b`, 'gi'),
    // "yesterday", "overnight", "earlier today"
    /\b(?:yesterday|overnight|(?:earlier|later)[ \t]+today)\b/gi,
    // "last night", "this morning", "past week"
    /\b(?:last|this|past)[ \t]+(?:night|morning|afternoon|evening|weekend|week|month|year)\b/gi,
  ],

  /**
   * Course - how a finding behaves over time
   */
  course: [
    // "intermittent", "constant", "episodic"
    /\b(?:intermittent(?:ly)?|constant(?:ly)?|continuous(?:ly)?|persistent|episodic|recurrent)\b/gi,
    // "worsening", "improving", "progressive", "waxing and waning"
    /\b(?:worsening|improving|progressive(?:ly)?|waxing[ \t]+and[ \t]+waning)\b/gi,
    // "acute onset", "sudden onset", "gradual onset", "chronic pain",
    // "chronically" (never bare "acute"/"chronic" - see module notes)
    /\b(?:(?:acute|sudden|gradual)[ \t]+onset|chronic[ \t]+pain|chronically)\b/gi,
  ],
};

/**
 * Confidence scores for temporal types
 */
export const TEMPORAL_CONFIDENCE: Record<TemporalType, number> = {
  duration: 0.9,
  onset: 0.9,
  relative: 0.8,
  course: 0.75,
};

/**
 * Number words recognized as quantities (vague quantifiers map to undefined)
 */
const NUMBER_WORDS: Record<string, number | undefined> = {
  a: 1,
  an: 1,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  twelve: 12,
  couple: 2,
  'couple of': 2,
  'a couple': 2,
  'a couple of': 2,
  several: undefined,
  few: undefined,
  'a few': undefined,
};

// ============================================================================
// Detection Functions
// ============================================================================

/**
 * Detect temporal expressions in clinical text
 *
 * @param text - Clinical text to analyze
 * @returns Array of temporal expressions with positions, sorted by position
 *
 * @example
 * ```typescript
 * const temporal = detectTemporal('Cough for 3 days, started yesterday. Intermittent.');
 * // Returns [
 * //   { type: 'duration', raw: 'for 3 days', value: 3, unit: 'day', ... },
 * //   { type: 'onset', raw: 'started yesterday', ... },
 * //   { type: 'course', raw: 'Intermittent', ... }
 * // ]
 * ```
 */
export function detectTemporal(text: string): TemporalExpression[] {
  const expressions: TemporalExpression[] = [];

  for (const [type, patterns] of Object.entries(TEMPORAL_PATTERNS)) {
    for (const pattern of patterns) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;

      while ((match = regex.exec(text)) !== null) {
        expressions.push({
          type: type as TemporalType,
          raw: match[0],
          value: match[1] !== undefined ? parseQuantity(match[1]) : undefined,
          unit: match[2] !== undefined ? normalizeUnit(match[2]) : undefined,
          startOffset: match.index,
          endOffset: match.index + match[0].length,
          confidence: TEMPORAL_CONFIDENCE[type as TemporalType],
        });
      }
    }
  }

  return deduplicateTemporal(expressions).sort(
    (a, b) => a.startOffset - b.startOffset
  );
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Parse a quantity (digits or number word); vague quantifiers -> undefined
 */
function parseQuantity(raw: string): number | undefined {
  if (/^\d/.test(raw)) {
    return parseFloat(raw);
  }
  return NUMBER_WORDS[raw.toLowerCase().replace(/\s+/g, ' ')];
}

/**
 * Normalize a time unit to a {@link TemporalUnit}
 */
function normalizeUnit(raw: string): TemporalUnit | undefined {
  const unit = raw.toLowerCase();
  if (unit.startsWith('min')) return 'minute';
  if (unit.startsWith('h')) return 'hour';
  if (unit.startsWith('d')) return 'day';
  if (unit.startsWith('w')) return 'week';
  if (unit.startsWith('mo')) return 'month';
  if (unit.startsWith('y')) return 'year';
  return undefined;
}

/**
 * Remove overlapping expressions, preferring longer matches and then
 * higher confidence
 */
function deduplicateTemporal(
  expressions: TemporalExpression[]
): TemporalExpression[] {
  if (expressions.length <= 1) return expressions;

  const ranked = [...expressions].sort((a, b) => {
    const lengthDiff =
      b.endOffset - b.startOffset - (a.endOffset - a.startOffset);
    if (lengthDiff !== 0) return lengthDiff;
    if (b.confidence !== a.confidence) return b.confidence - a.confidence;
    return a.startOffset - b.startOffset;
  });

  const result: TemporalExpression[] = [];
  for (const expr of ranked) {
    const overlaps = result.some(
      (r) => expr.startOffset < r.endOffset && r.startOffset < expr.endOffset
    );
    if (!overlaps) {
      result.push(expr);
    }
  }

  return result;
}
