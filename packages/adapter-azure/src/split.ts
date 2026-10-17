/**
 * Splitting long text into service-sized documents
 *
 * @packageDocumentation
 */

/**
 * A piece of the input text sent as one Azure document.
 */
export interface TextSegment {
  /** Segment text (`source.slice(offset, offset + text.length)`) */
  text: string;
  /** Offset of the segment in the source text (UTF-16 code units) */
  offset: number;
}

/** Separators tried, in order, when choosing where to cut */
const SEPARATORS = ['\n\n', '\n', '. '] as const;

/**
 * Split `text` into segments of at most `maxLength` UTF-16 code units.
 *
 * Each cut is placed just after the last paragraph break (`\n\n`) before
 * the limit, else the last line break, else the last `'. '`, else at the
 * limit itself (never between the two halves of a surrogate pair).
 * Segments are contiguous: concatenating them yields `text` exactly.
 *
 * Azure measures its document limit in text elements (graphemes); a
 * grapheme is at least one UTF-16 code unit, so a segment of at most
 * `maxLength` code units never exceeds `maxLength` graphemes.
 */
export function splitText(text: string, maxLength: number): TextSegment[] {
  if (!Number.isInteger(maxLength) || maxLength < 2) {
    throw new RangeError('maxLength must be an integer >= 2');
  }
  const segments: TextSegment[] = [];
  let start = 0;
  while (text.length - start > maxLength) {
    const limit = start + maxLength;
    const window = text.slice(start, limit);
    let cut = -1;
    for (const sep of SEPARATORS) {
      const idx = window.lastIndexOf(sep);
      if (idx > 0) {
        cut = start + idx + sep.length;
        break;
      }
    }
    if (cut <= start) {
      cut = limit;
      // Do not separate a surrogate pair
      const code = text.charCodeAt(cut - 1);
      if (code >= 0xd800 && code <= 0xdbff) cut -= 1;
    }
    segments.push({ text: text.slice(start, cut), offset: start });
    start = cut;
  }
  if (start < text.length || segments.length === 0) {
    segments.push({ text: text.slice(start), offset: start });
  }
  return segments;
}

/**
 * Group segments into jobs, each with at most `maxDocuments` documents
 * and at most `maxChars` code units in total.
 */
export function batchSegments(
  segments: TextSegment[],
  maxDocuments: number,
  maxChars: number
): TextSegment[][] {
  const batches: TextSegment[][] = [];
  let current: TextSegment[] = [];
  let chars = 0;
  for (const seg of segments) {
    if (current.length > 0 && (current.length >= maxDocuments || chars + seg.text.length > maxChars)) {
      batches.push(current);
      current = [];
      chars = 0;
    }
    current.push(seg);
    chars += seg.text.length;
  }
  if (current.length > 0) batches.push(current);
  return batches;
}
