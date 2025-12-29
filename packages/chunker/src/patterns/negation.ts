/**
 * Negation Pattern Detection
 *
 * Identifies negated medical findings in clinical text.
 * Examples: "no chest pain", "denies fever", "ruled out MI"
 *
 * @packageDocumentation
 */

import type { NegationContext, NegationType } from '../types';

// ============================================================================
// Negation Patterns
// ============================================================================

/**
 * Patterns for detecting negated medical findings
 */
export const NEGATION_PATTERNS: Record<NegationType, RegExp[]> = {
  /**
   * Absent - "no X", "without X", "absence of X"
   */
  absent: [
    // "no chest pain", "no evidence of infection"
    /\bno\s+(?:evidence\s+of\s+|signs?\s+of\s+|symptoms?\s+of\s+)?([^.;,]{3,40})/gi,
    // "absence of edema"
    /\babsence\s+of\s+([^.;,]{3,40})/gi,
    // "free of disease"
    /\bfree\s+(?:of|from)\s+([^.;,]{3,40})/gi,
  ],

  /**
   * Denied - patient denies symptom
   */
  denied: [
    // "denies chest pain", "patient denies fever"
    /\b(?:patient\s+)?denies\s+([^.;,]{3,40})/gi,
    // "denied having headaches"
    /\bdenied\s+(?:having\s+|any\s+)?([^.;,]{3,40})/gi,
  ],

  /**
   * Ruled out - diagnostic exclusion
   */
  ruled_out: [
    // "rule out MI", "r/o PE"
    /\b(?:rule[ds]?\s+out|r\/o)\s+([^.;,]{3,40})/gi,
    // "MI has been ruled out"
    /\b([^.;,]{3,30})\s+(?:has\s+been\s+|was\s+)?ruled\s+out/gi,
    // "excluded MI"
    /\bexcluded?\s+([^.;,]{3,40})/gi,
  ],

  /**
   * Negative - test/finding is negative
   */
  negative: [
    // "negative for malignancy"
    /\bnegative\s+(?:for\s+)?([^.;,]{3,40})/gi,
    // "troponin negative"
    /\b([^.;,]{3,30})\s+(?:is\s+|was\s+)?negative/gi,
    // "unremarkable exam"
    /\b(?:unremarkable|normal)\s+([^.;,]{3,40})/gi,
  ],

  /**
   * Without - clinical context without finding
   */
  without: [
    // "without edema", "without fever"
    /\bwithout\s+(?:any\s+|evidence\s+of\s+)?([^.;,]{3,40})/gi,
    // "not associated with pain"
    /\bnot\s+associated\s+with\s+([^.;,]{3,40})/gi,
  ],
};

/**
 * Confidence scores for negation types
 */
export const NEGATION_CONFIDENCE: Record<NegationType, number> = {
  absent: 0.90,
  denied: 0.85,
  ruled_out: 0.95,
  negative: 0.90,
  without: 0.80,
};

// ============================================================================
// Detection Functions
// ============================================================================

/**
 * Detect negated findings in clinical text
 *
 * @param text - Clinical text to analyze
 * @returns Array of negation contexts with positions
 *
 * @example
 * ```typescript
 * const negations = detectNegations('Patient denies chest pain. No fever.');
 * // Returns [
 * //   { negatedText: 'chest pain', type: 'denied', ... },
 * //   { negatedText: 'fever', type: 'absent', ... }
 * // ]
 * ```
 */
export function detectNegations(text: string): NegationContext[] {
  const negations: NegationContext[] = [];

  for (const [type, patterns] of Object.entries(NEGATION_PATTERNS)) {
    for (const pattern of patterns) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;

      while ((match = regex.exec(text)) !== null) {
        const negatedText = cleanNegatedText(match[1] || match[0]);

        // Skip if negated text is too short or is just punctuation
        if (negatedText.length < 3 || !/[a-zA-Z]/.test(negatedText)) {
          continue;
        }

        negations.push({
          negatedText,
          type: type as NegationType,
          startOffset: match.index,
          endOffset: match.index + match[0].length,
          confidence: NEGATION_CONFIDENCE[type as NegationType],
        });
      }
    }
  }

  // Remove duplicates and sort by position
  return deduplicateNegations(negations).sort(
    (a, b) => a.startOffset - b.startOffset
  );
}

/**
 * Check if a specific term is negated in the text
 *
 * @param text - Clinical text
 * @param term - Term to check for negation
 * @returns True if the term appears in a negation context
 */
export function isTermNegated(text: string, term: string): boolean {
  const negations = detectNegations(text);
  const lowerTerm = term.toLowerCase();

  return negations.some(
    (n) => n.negatedText.toLowerCase().includes(lowerTerm)
  );
}

/**
 * Get all negated terms from text
 *
 * @param text - Clinical text
 * @returns Array of negated term strings
 */
export function getNegatedTerms(text: string): string[] {
  const negations = detectNegations(text);
  return [...new Set(negations.map((n) => n.negatedText))];
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Clean up the negated text (trim, normalize whitespace)
 */
function cleanNegatedText(text: string): string {
  return text
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[.;,]+$/, ''); // Remove trailing punctuation
}

/**
 * Remove overlapping negation detections
 */
function deduplicateNegations(negations: NegationContext[]): NegationContext[] {
  if (negations.length <= 1) return negations;

  // Sort by start position, then by confidence (descending)
  const sorted = [...negations].sort((a, b) => {
    if (a.startOffset !== b.startOffset) {
      return a.startOffset - b.startOffset;
    }
    return b.confidence - a.confidence;
  });

  const result: NegationContext[] = [];
  let lastEnd = -1;

  for (const negation of sorted) {
    if (negation.startOffset < lastEnd) {
      continue;
    }
    result.push(negation);
    lastEnd = negation.endOffset;
  }

  return result;
}

