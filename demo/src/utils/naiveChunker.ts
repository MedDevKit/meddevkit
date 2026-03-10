import { estimateTokens } from '@meddevkit/chunker';

export interface NaiveChunk {
  text: string;
  index: number;
  tokenCount: number;
  startOffset: number;
  endOffset: number;
}

export interface NaiveChunkerResult {
  chunks: NaiveChunk[];
  totalChunks: number;
}

/**
 * Simple word-boundary chunker with no medical context awareness.
 * Splits text at word boundaries to fit within maxTokens.
 */
export function naiveChunk(text: string, maxTokens: number): NaiveChunkerResult {
  if (!text.trim()) {
    return { chunks: [], totalChunks: 0 };
  }

  const chunks: NaiveChunk[] = [];
  let position = 0;
  let index = 0;

  while (position < text.length) {
    // Find end position for this chunk
    let end = text.length;
    let candidateText = text.slice(position, end);
    let tokens = estimateTokens(candidateText);

    if (tokens <= maxTokens) {
      // Remaining text fits in one chunk
      chunks.push({
        text: candidateText,
        index,
        tokenCount: tokens,
        startOffset: position,
        endOffset: end,
      });
      break;
    }

    // Binary search for the right word boundary
    // Start with a rough character estimate, then refine
    let lo = position;
    let hi = end;

    while (hi - lo > 10) {
      const mid = Math.floor((lo + hi) / 2);
      const midText = text.slice(position, mid);
      if (estimateTokens(midText) <= maxTokens) {
        lo = mid;
      } else {
        hi = mid;
      }
    }

    // Find the last word boundary at or before `lo`
    let splitAt = lo;
    // Search backward from `lo` for a space
    const lastSpace = text.lastIndexOf(' ', lo);
    if (lastSpace > position) {
      splitAt = lastSpace;
    } else {
      // No space found after position — look forward for one
      const nextSpace = text.indexOf(' ', position + 1);
      if (nextSpace !== -1) {
        splitAt = nextSpace;
      } else {
        // No spaces at all, take everything
        splitAt = text.length;
      }
    }

    candidateText = text.slice(position, splitAt);
    tokens = estimateTokens(candidateText);

    // If we overshot, step back word by word
    while (tokens > maxTokens && splitAt > position) {
      const prevSpace = text.lastIndexOf(' ', splitAt - 1);
      if (prevSpace <= position) break;
      splitAt = prevSpace;
      candidateText = text.slice(position, splitAt);
      tokens = estimateTokens(candidateText);
    }

    if (candidateText.trim()) {
      chunks.push({
        text: candidateText,
        index,
        tokenCount: tokens,
        startOffset: position,
        endOffset: splitAt,
      });
      index++;
    }

    // Skip whitespace between chunks
    position = splitAt;
    while (position < text.length && text[position] === ' ') {
      position++;
    }
  }

  return { chunks, totalChunks: chunks.length };
}
