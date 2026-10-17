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
 * Minimum distance (in characters) from the chunk start that a split moved
 * before a protected range must keep. Closer than this, the split moves past
 * the range instead, so a protected range never produces a near-empty chunk.
 */
const MIN_SPLIT_BEFORE_RANGE = 50;

/**
 * Find the best split point in text
 *
 * The returned position is never strictly inside a protected range,
 * whichever branch (protected range at the ideal end, sentence, paragraph
 * or word fallback) produced it. A position that would fall inside one is
 * moved to the range start when that leaves more than
 * MIN_SPLIT_BEFORE_RANGE characters after `startPosition`, and otherwise
 * to the range end (so the chunk may exceed `idealEnd`).
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
  const candidate = findCandidateSplitPoint(
    text,
    startPosition,
    idealEnd,
    protectedRanges,
    preserveSentences
  );
  return moveOutOfProtectedRanges(
    text,
    startPosition,
    candidate,
    protectedRanges
  );
}

/**
 * Pick a split point by preference (protected range at the ideal end,
 * sentence, paragraph, word). The result may still fall inside a protected
 * range; findBestSplitPoint corrects that.
 */
function findCandidateSplitPoint(
  text: string,
  startPosition: number,
  idealEnd: number,
  protectedRanges: ProtectedRange[],
  preserveSentences: boolean
): SplitPoint {
  // Ensure we don't go past text end
  const maxEnd = Math.min(idealEnd, text.length);

  // Check if idealEnd is within a protected range
  const overlappingRange = protectedRanges.find(
    (r) => maxEnd > r.start && maxEnd < r.end
  );

  if (overlappingRange) {
    // Split before the protected range if possible
    if (overlappingRange.start > startPosition + MIN_SPLIT_BEFORE_RANGE) {
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
 * Move a split point out of any protected range it falls strictly inside
 *
 * Ranges need not be merged: the walk repeats until the position is clear.
 * It first walks back to range starts; if that ends at or before
 * `startPosition + MIN_SPLIT_BEFORE_RANGE`, it walks forward from the
 * original position to range ends instead (capped at the text length).
 * A moved split is reported as 'max_tokens'.
 */
function moveOutOfProtectedRanges(
  text: string,
  startPosition: number,
  split: SplitPoint,
  protectedRanges: ProtectedRange[]
): SplitPoint {
  const containing = (pos: number): ProtectedRange | undefined =>
    protectedRanges.find((r) => pos > r.start && pos < r.end);

  if (!containing(split.position)) return split;

  // Walk back to the start of each containing range
  let back = split.position;
  for (let r = containing(back); r; r = containing(back)) {
    back = r.start;
  }
  if (back > startPosition + MIN_SPLIT_BEFORE_RANGE) {
    return { position: back, reason: 'max_tokens' };
  }

  // Too close to the chunk start: walk forward past each containing range
  let forward = split.position;
  for (
    let r = containing(forward);
    r && forward < text.length;
    r = containing(forward)
  ) {
    forward = Math.min(r.end, text.length);
  }
  return { position: forward, reason: 'max_tokens' };
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
 * Find where a chunk's overlap prefix should start
 *
 * Picks a start position in [windowStart, limit) such that the overlap
 * text begins cleanly:
 * 1. Prefer the earliest sentence or line start in the window (the
 *    position right after `.`, `!` or `?` plus whitespace, or after a
 *    newline) that is not inside a blocked range.
 * 2. Otherwise snap forward to the next word start (a non-whitespace
 *    character preceded by whitespace). If that lies strictly inside a
 *    blocked range, move to the range's end and snap again.
 *
 * @param text - Full (normalized) text
 * @param windowStart - Earliest allowed overlap start
 * @param limit - Start of the chunk's core range (exclusive bound)
 * @param blockedRanges - Ranges the overlap must not start inside
 *   (e.g. protected ranges and PHI spans)
 * @returns Overlap start position, or `limit` when no clean start exists
 */
export function findOverlapStart(
  text: string,
  windowStart: number,
  limit: number,
  blockedRanges: Array<{ start: number; end: number }>
): number {
  const start = Math.max(0, windowStart);
  if (start >= limit) return limit;

  const isBlocked = (pos: number): { start: number; end: number } | undefined =>
    blockedRanges.find((r) => pos > r.start && pos < r.end);

  // 1. Earliest sentence/line start inside the window. Look back a little
  // so a sentence end just before windowStart still counts.
  const lookBack = Math.max(0, start - 16);
  const sentenceEnds = text.slice(lookBack, limit).matchAll(/[.!?]\s+|\n\s*/g);
  for (const match of sentenceEnds) {
    const candidate = lookBack + match.index! + match[0].length;
    if (candidate < start) continue;
    if (candidate >= limit) break;
    if (!isBlocked(candidate)) return candidate;
  }

  // 2. Next clean word start
  let pos = start;
  while (pos < limit) {
    pos = nextWordStart(text, pos, limit);
    if (pos >= limit) return limit;
    const blocking = isBlocked(pos);
    if (!blocking) return pos;
    pos = blocking.end;
  }
  return limit;
}

/**
 * First position >= `from` and < `limit` where a word starts
 * (non-whitespace character at the start of text or after whitespace)
 */
function nextWordStart(text: string, from: number, limit: number): number {
  for (let i = from; i < limit; i++) {
    if (/\s/.test(text[i])) continue;
    if (i === 0 || /\s/.test(text[i - 1])) return i;
  }
  return limit;
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
