import { detectVitals, detectSections } from '@meddevkit/chunker';
import type { NaiveChunk } from './naiveChunker';

export interface BrokenPattern {
  type: 'vital' | 'section';
  originalText: string;
  chunkIndex: number;
  fragmentInChunk: string;
  isStart: boolean;
  startOffset: number;
  endOffset: number;
}

/**
 * Detects where naive chunking has split medical patterns across chunk boundaries.
 */
export function detectBrokenPatterns(
  originalText: string,
  naiveChunks: NaiveChunk[],
): BrokenPattern[] {
  if (naiveChunks.length <= 1) return [];

  const broken: BrokenPattern[] = [];
  const vitals = detectVitals(originalText);
  const sections = detectSections(originalText);

  // Check vitals — these have both startOffset and endOffset
  for (const vital of vitals) {
    const spanning = findSpanningChunks(vital.startOffset, vital.endOffset, naiveChunks);
    if (spanning.length > 1) {
      for (const chunkIdx of spanning) {
        const chunk = naiveChunks[chunkIdx];
        const overlapStart = Math.max(vital.startOffset, chunk.startOffset);
        const overlapEnd = Math.min(vital.endOffset, chunk.endOffset);
        const fragment = originalText.slice(overlapStart, overlapEnd);
        if (!fragment.trim()) continue; // skip whitespace-only fragments

        broken.push({
          type: 'vital',
          originalText: vital.raw,
          chunkIndex: chunkIdx,
          fragmentInChunk: fragment,
          isStart: chunkIdx === spanning[0],
          startOffset: overlapStart - chunk.startOffset,
          endOffset: overlapEnd - chunk.startOffset,
        });
      }
    }
  }

  // Check sections — only have startOffset, so check if section header line is split
  for (const section of sections) {
    const headerEnd = findLineEnd(originalText, section.startOffset);
    const spanning = findSpanningChunks(section.startOffset, headerEnd, naiveChunks);
    if (spanning.length > 1) {
      const headerText = originalText.slice(section.startOffset, headerEnd);
      for (const chunkIdx of spanning) {
        const chunk = naiveChunks[chunkIdx];
        const overlapStart = Math.max(section.startOffset, chunk.startOffset);
        const overlapEnd = Math.min(headerEnd, chunk.endOffset);
        const fragment = originalText.slice(overlapStart, overlapEnd);
        if (!fragment.trim()) continue; // skip whitespace-only fragments

        broken.push({
          type: 'section',
          originalText: headerText,
          chunkIndex: chunkIdx,
          fragmentInChunk: fragment,
          isStart: chunkIdx === spanning[0],
          startOffset: overlapStart - chunk.startOffset,
          endOffset: overlapEnd - chunk.startOffset,
        });
      }
    }
  }

  return broken;
}

function findSpanningChunks(
  patternStart: number,
  patternEnd: number,
  chunks: NaiveChunk[],
): number[] {
  const indices: number[] = [];
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    // Check if pattern overlaps with this chunk
    if (patternStart < chunk.endOffset && patternEnd > chunk.startOffset) {
      indices.push(i);
    }
  }
  return indices;
}

function findLineEnd(text: string, offset: number): number {
  const newline = text.indexOf('\n', offset);
  return newline === -1 ? text.length : newline;
}
