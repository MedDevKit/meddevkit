/**
 * Basic PHI Detection Patterns
 *
 * IMPORTANT: This is BASIC detection for flagging potential PHI.
 * NOT suitable for HIPAA-compliant de-identification.
 * For production PHI handling, consider enterprise solutions.
 *
 * OPEN SOURCE: ~10 basic patterns for common PHI types
 * PRIVATE (Cloud): 50+ advanced patterns, contextual detection, redaction strategies
 *
 * @packageDocumentation
 */

import type { PhiMarker, PhiType } from '../types';

// ============================================================================
// PHI Detection Patterns
// ============================================================================

/**
 * Basic PHI detection patterns
 * These are demonstrative patterns - production systems need more comprehensive detection
 */
const BASIC_PHI_PATTERNS: Record<Exclude<PhiType, 'unknown'>, RegExp[]> = {
  /**
   * Date patterns - DOB, visit dates, procedure dates
   * Note: Many false positives in clinical text
   */
  date: [
    // MM/DD/YYYY or MM-DD-YYYY
    /\b(0?[1-9]|1[0-2])[\/\-](0?[1-9]|[12]\d|3[01])[\/\-](\d{4}|\d{2})\b/g,
    // Written dates: January 15, 2024
    /\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2}(?:st|nd|rd|th)?,?\s+\d{4}\b/gi,
    // DOB explicit mention
    /\b(?:DOB|Date\s+of\s+Birth|Birth\s*date)[:\s]*\S+/gi,
  ],

  /**
   * Medical Record Number patterns
   */
  mrn: [
    // Common MRN formats with label
    /\b(?:MRN|Medical\s+Record\s+(?:Number|#|No\.?)|Patient\s+ID|Acct\s*#?)[:\s#]*(\d{4,12})\b/gi,
    // Standalone MRN format (less confident)
    /\b(?:MRN)[:\s]*([A-Z0-9]{6,12})\b/gi,
  ],

  /**
   * Phone number patterns - US formats
   */
  phone: [
    // Standard US formats: (555) 123-4567, 555-123-4567, 555.123.4567
    /\b(?:\+?1[-.\s]?)?\(?([0-9]{3})\)?[-.\s]?([0-9]{3})[-.\s]?([0-9]{4})\b/g,
    // With labels
    /\b(?:phone|tel|telephone|cell|mobile|fax)[:\s]*[(\d\-.\s)]{10,}/gi,
  ],

  /**
   * Email address patterns
   */
  email: [
    /\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b/g,
  ],

  /**
   * Social Security Number patterns
   */
  ssn: [
    // With label
    /\b(?:SSN|Social\s+Security(?:\s+(?:Number|#|No\.?))?)[:\s#]*(\d{3}[-\s]?\d{2}[-\s]?\d{4})\b/gi,
    // Standard format XXX-XX-XXXX (more specific)
    /\b(\d{3}[-]\d{2}[-]\d{4})\b/g,
  ],

  /**
   * Age over 89 - HIPAA Safe Harbor requires redaction
   */
  age_over_89: [
    // Age explicitly stated
    /\b(9\d|[1-9]\d{2,})\s*[-]?\s*(?:year|yr|y\.?o\.?)[-\s]*old\b/gi,
    // Age with label
    /\bage[:\s]*(9\d|[1-9]\d{2,})\b/gi,
  ],

  /**
   * Name patterns - Very difficult to detect accurately
   * Basic patterns for labeled names only
   * Includes conversational patterns for voice transcription
   */
  name: [
    // Dr. followed by capitalized name
    /\bDr\.?\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/g,
    // Patient name with label
    /\b(?:Patient(?:\s+Name)?|Name)[:\s]+([A-Z][a-z]+(?:\s+[A-Z]\.?)?(?:\s+[A-Z][a-z]+))\b/g,
    // Conversational: "patient's name is Fred Winkle" or "patient name is John Smith"
    /\bpatient(?:'s)?\s+name\s+is\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/gi,
    // Conversational: "the name is Fred Winkle" or "name is John"
    /\b(?:the\s+)?name\s+is\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/gi,
    // Mr./Mrs./Ms./Miss followed by name
    /\b(?:Mr|Mrs|Ms|Miss)\.?\s+([A-Z][a-z]+)\b/g,
    // Attention or contact name
    /\b(?:Attn|Contact)[:\s]+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/gi,
  ],

  /**
   * Street address patterns
   */
  address: [
    // Street address: 123 Main St, 456 Oak Avenue
    /\b\d{1,5}\s+(?:[A-Z][a-z]+\s+){1,3}(?:St(?:reet)?|Ave(?:nue)?|Blvd|Boulevard|Rd|Road|Dr(?:ive)?|Ln|Lane|Way|Ct|Court|Pl(?:ace)?|Cir(?:cle)?)\.?\b/gi,
    // PO Box
    /\b(?:P\.?\s*O\.?\s*Box|Post\s+Office\s+Box)\s+\d+\b/gi,
    // Address with label
    /\b(?:Address|Location)[:\s]+\d+[^,\n]{5,50}\b/gi,
  ],
};

/**
 * Confidence scores for each PHI type
 * Based on pattern specificity and false positive rates
 */
const PHI_CONFIDENCE: Record<PhiType, number> = {
  ssn: 0.95, // Very specific pattern
  mrn: 0.90, // Usually labeled
  email: 0.95, // Very specific pattern
  phone: 0.80, // Can match other number sequences
  date: 0.60, // Many false positives in clinical text
  age_over_89: 0.85, // Fairly specific
  name: 0.50, // Names are notoriously difficult
  address: 0.70, // Can match business addresses
  unknown: 0.30, // Fallback
};

// ============================================================================
// Detection Functions
// ============================================================================

/**
 * Detect potential PHI in text
 *
 * @param text - Text to scan for PHI
 * @param mode - Detection mode: 'basic' for open source, 'enhanced' requires cloud
 * @returns Array of PHI markers with positions and confidence
 *
 * @example
 * ```typescript
 * const markers = detectPhi('Patient DOB: 01/15/1960, MRN: 12345678');
 * // Returns markers for date and MRN with positions
 * ```
 *
 * @remarks
 * This is basic PHI flagging only. For HIPAA-compliant de-identification,
 * use a certified solution or OpenMedRAG Cloud.
 */
export function detectPhi(
  text: string,
  mode: 'basic' | 'enhanced' = 'basic'
): PhiMarker[] {
  if (mode === 'enhanced') {
    console.warn(
      '[OpenMedRAG] Enhanced PHI detection requires OpenMedRAG Cloud. ' +
        'Falling back to basic detection. Visit https://openmedrag.com for enterprise features.'
    );
  }

  const markers: PhiMarker[] = [];

  for (const [type, patterns] of Object.entries(BASIC_PHI_PATTERNS)) {
    for (const pattern of patterns) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;

      while ((match = regex.exec(text)) !== null) {
        markers.push({
          type: type as PhiType,
          startOffset: match.index,
          endOffset: match.index + match[0].length,
          confidence: PHI_CONFIDENCE[type as PhiType],
        });
      }
    }
  }

  // Remove duplicates (overlapping markers) - keep highest confidence
  const deduplicated = deduplicateMarkers(markers);

  // Sort by position
  return deduplicated.sort((a, b) => a.startOffset - b.startOffset);
}

/**
 * Check if text contains any potential PHI
 *
 * @param text - Text to check
 * @returns True if any PHI patterns detected
 */
export function containsPhi(text: string): boolean {
  const markers = detectPhi(text);
  return markers.length > 0;
}

/**
 * Get PHI-free ranges in text
 * Useful for knowing which parts are safe
 *
 * @param text - Text to analyze
 * @returns Array of ranges without PHI
 */
export function getPhiFreeRanges(
  text: string
): Array<{ start: number; end: number }> {
  const markers = detectPhi(text);
  const ranges: Array<{ start: number; end: number }> = [];

  let lastEnd = 0;
  for (const marker of markers) {
    if (marker.startOffset > lastEnd) {
      ranges.push({ start: lastEnd, end: marker.startOffset });
    }
    lastEnd = Math.max(lastEnd, marker.endOffset);
  }

  // Add final range if there's text after last PHI
  if (lastEnd < text.length) {
    ranges.push({ start: lastEnd, end: text.length });
  }

  return ranges;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Remove overlapping markers, keeping highest confidence
 */
function deduplicateMarkers(markers: PhiMarker[]): PhiMarker[] {
  if (markers.length <= 1) return markers;

  // Sort by start position, then by confidence (descending)
  const sorted = [...markers].sort((a, b) => {
    if (a.startOffset !== b.startOffset) {
      return a.startOffset - b.startOffset;
    }
    return b.confidence - a.confidence;
  });

  const result: PhiMarker[] = [];
  let lastEnd = -1;

  for (const marker of sorted) {
    // Skip if this marker overlaps with a previous one
    if (marker.startOffset < lastEnd) {
      continue;
    }
    result.push(marker);
    lastEnd = marker.endOffset;
  }

  return result;
}

// ============================================================================
// Exports
// ============================================================================

export { BASIC_PHI_PATTERNS, PHI_CONFIDENCE };
