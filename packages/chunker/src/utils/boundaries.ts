/**
 * Boundary Detection Utilities
 *
 * Utilities for finding optimal split points in text
 * while respecting protected ranges and sentence boundaries.
 *
 * @packageDocumentation
 */

import type { ProtectedRange, SplitPoint } from '../types';

// ============================================================================
// Boundary Detection
// ============================================================================

/**
 * Find the best split point in text
 *
 * @param text - Full text
 * @param startPosition - Start of the range to consider
 * @param idealEnd - Ideal end position (based on token limit)
 * @param protectedRanges - Ranges that should not be split
 * @param preserveSentences - Whether to preserve sentence boundaries
 * @returns Best split point with reason
 */
export function findBestSplitPoint(
  text: string,
  startPosition: number,
  idealEnd: number,
  protectedRanges: ProtectedRange[],
  preserveSentences: boolean = true
): SplitPoint {
  // Ensure we don't go past text end
  const maxEnd = Math.min(idealEnd, text.length);

  // Check if idealEnd is within a protected range
  const overlappingRange = protectedRanges.find(
    (r) => maxEnd > r.start && maxEnd < r.end
  );

  if (overlappingRange) {
    // Split before the protected range if possible
    if (overlappingRange.start > startPosition + 50) {
      return {
        position: overlappingRange.start,
        reason: 'max_tokens',
      };
    }
    // Otherwise, extend past the protected range
    return {
      position: Math.min(overlappingRange.end, text.length),
      reason: 'max_tokens',
    };
  }

  // If preserving sentences, find sentence boundary
  if (preserveSentences) {
    const sentenceBoundary = findSentenceBoundary(
      text,
      startPosition,
      maxEnd
    );
    if (sentenceBoundary !== null) {
      return {
        position: sentenceBoundary,
        reason: 'sentence',
      };
    }
  }

  // Find paragraph boundary
  const paragraphBoundary = findParagraphBoundary(
    text,
    startPosition,
    maxEnd
  );
  if (paragraphBoundary !== null) {
    return {
      position: paragraphBoundary,
      reason: 'paragraph',
    };
  }

  // Fall back to word boundary
  const wordBoundary = findWordBoundary(text, maxEnd);
  return {
    position: wordBoundary,
    reason: 'max_tokens',
  };
}

/**
 * Find a sentence boundary in a range
 *
 * @param text - Full text
 * @param start - Start of range
 * @param end - End of range
 * @returns Position after sentence end, or null if none found
 */
export function findSentenceBoundary(
  text: string,
  start: number,
  end: number
): number | null {
  const searchText = text.slice(start, end);

  // Look for sentence-ending punctuation followed by space or newline
  const sentenceEnds = [...searchText.matchAll(/[.!?]\s+/g)];

  if (sentenceEnds.length === 0) return null;

  // Find the last sentence end in the range
  const lastEnd = sentenceEnds[sentenceEnds.length - 1];
  const position = start + lastEnd.index! + lastEnd[0].length;

  // Ensure we're not too close to start (at least 50% of range)
  if (position < start + (end - start) * 0.5) {
    return null;
  }

  return position;
}

/**
 * Find a paragraph boundary in a range
 *
 * @param text - Full text
 * @param start - Start of range
 * @param end - End of range
 * @returns Position after paragraph end, or null if none found
 */
export function findParagraphBoundary(
  text: string,
  start: number,
  end: number
): number | null {
  const searchText = text.slice(start, end);

  // Look for double newlines
  const paragraphEnds = [...searchText.matchAll(/\n\s*\n/g)];

  if (paragraphEnds.length === 0) return null;

  // Find the last paragraph end in the range
  const lastEnd = paragraphEnds[paragraphEnds.length - 1];
  const position = start + lastEnd.index! + lastEnd[0].length;

  // Ensure we're not too close to start
  if (position < start + (end - start) * 0.3) {
    return null;
  }

  return position;
}

/**
 * Find a word boundary at or before a position
 *
 * @param text - Full text
 * @param position - Target position
 * @returns Position at word boundary
 */
export function findWordBoundary(text: string, position: number): number {
  if (position >= text.length) return text.length;

  // If we're already at a word boundary, return it
  if (/\s/.test(text[position])) {
    return position;
  }

  // Look backward for space
  const lastSpace = text.lastIndexOf(' ', position);
  if (lastSpace > position * 0.8) {
    return lastSpace + 1;
  }

  // Look backward for any whitespace
  for (let i = position; i >= position * 0.8; i--) {
    if (/\s/.test(text[i])) {
      return i + 1;
    }
  }

  // Fall back to the original position
  return position;
}

/**
 * Merge overlapping protected ranges
 *
 * @param ranges - Array of ranges
 * @returns Merged ranges
 */
export function mergeRanges(
  ranges: Array<{ start: number; end: number }>
): Array<{ start: number; end: number }> {
  if (ranges.length <= 1) return ranges;

  const sorted = [...ranges].sort((a, b) => a.start - b.start);
  const merged: Array<{ start: number; end: number }> = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const current = sorted[i];
    const last = merged[merged.length - 1];

    if (current.start <= last.end) {
      // Overlapping - merge
      last.end = Math.max(last.end, current.end);
    } else {
      // Non-overlapping - add
      merged.push(current);
    }
  }

  return merged;
}

/**
 * Check if a position is within any of the ranges
 *
 * @param position - Position to check
 * @param ranges - Ranges to check against
 * @returns True if position is inside a range
 */
export function isWithinRanges(
  position: number,
  ranges: Array<{ start: number; end: number }>
): boolean {
  return ranges.some((r) => position >= r.start && position <= r.end);
}

/**
 * Get the range containing a position
 *
 * @param position - Position to check
 * @param ranges - Ranges to check
 * @returns The containing range, or undefined
 */
export function getRangeAtPosition(
  position: number,
  ranges: Array<{ start: number; end: number }>
): { start: number; end: number } | undefined {
  return ranges.find((r) => position >= r.start && position <= r.end);
}
