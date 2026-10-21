import {
  detectVitals,
  detectSections,
  detectMedications,
  normalizeText,
  type ChunkingResult,
} from '@meddevkit/chunker';

/**
 * Minimal chunk shape the detector needs: a [startOffset, endOffset) range
 * into the text being checked. Ranges may overlap (chunker overlap).
 */
export interface ChunkSpan {
  startOffset: number;
  endOffset: number;
}

export interface BrokenPattern {
  type: 'vital' | 'section' | 'medication';
  originalText: string;
  chunkIndex: number;
  fragmentInChunk: string;
  isStart: boolean;
  startOffset: number;
  endOffset: number;
}

/**
 * Detects where chunking has split medical patterns across chunk boundaries.
 *
 * A pattern counts as broken only when no single chunk contains it in full.
 * With overlapping chunks, a pattern cut at one chunk's core boundary is
 * still intact if the next chunk's overlap prefix carries all of it.
 */
export function detectBrokenPatterns(
  originalText: string,
  naiveChunks: ChunkSpan[],
): BrokenPattern[] {
  if (naiveChunks.length <= 1) return [];

  const broken: BrokenPattern[] = [];
  const vitals = detectVitals(originalText);
  const sections = detectSections(originalText);
  const medications = detectMedications(originalText);

  // Check vitals and medications — these have both startOffset and endOffset
  for (const vital of vitals) {
    pushBrokenFragments(broken, 'vital', vital.raw, vital.startOffset, vital.endOffset, originalText, naiveChunks);
  }
  for (const med of medications) {
    pushBrokenFragments(broken, 'medication', med.raw, med.startOffset, med.endOffset, originalText, naiveChunks);
  }

  // Check sections — only have startOffset, so check if section header line is split
  for (const section of sections) {
    const headerEnd = findLineEnd(originalText, section.startOffset);
    const headerText = originalText.slice(section.startOffset, headerEnd);
    pushBrokenFragments(broken, 'section', headerText, section.startOffset, headerEnd, originalText, naiveChunks);
  }

  return broken;
}

/**
 * Record one BrokenPattern per non-whitespace fragment when a pattern
 * [patternStart, patternEnd) spans more than one naive chunk.
 */
function pushBrokenFragments(
  broken: BrokenPattern[],
  type: BrokenPattern['type'],
  originalPattern: string,
  patternStart: number,
  patternEnd: number,
  originalText: string,
  naiveChunks: ChunkSpan[],
): void {
  // Intact if any one chunk holds the whole pattern (covers overlap)
  if (naiveChunks.some((c) => c.startOffset <= patternStart && c.endOffset >= patternEnd)) return;

  const spanning = findSpanningChunks(patternStart, patternEnd, naiveChunks);
  if (spanning.length <= 1) return;

  for (const chunkIdx of spanning) {
    const chunk = naiveChunks[chunkIdx];
    const overlapStart = Math.max(patternStart, chunk.startOffset);
    const overlapEnd = Math.min(patternEnd, chunk.endOffset);
    const fragment = originalText.slice(overlapStart, overlapEnd);
    if (!fragment.trim()) continue; // skip whitespace-only fragments

    broken.push({
      type,
      originalText: originalPattern,
      chunkIndex: chunkIdx,
      fragmentInChunk: fragment,
      isStart: chunkIdx === spanning[0],
      startOffset: overlapStart - chunk.startOffset,
      endOffset: overlapEnd - chunk.startOffset,
    });
  }
}

function findSpanningChunks(
  patternStart: number,
  patternEnd: number,
  chunks: ChunkSpan[],
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

/**
 * Runs the same broken-pattern detection on MedicalChunker output.
 *
 * MedicalChunker offsets refer to normalizeText(originalText), so detection
 * runs on the normalized text. Each chunk spans from where its text begins
 * (boundaries.overlapStart when overlap was prepended, else boundaries.start)
 * to boundaries.end.
 */
export function detectBrokenPatternsInChunkingResult(
  originalText: string,
  result: ChunkingResult,
): BrokenPattern[] {
  const spans: ChunkSpan[] = result.chunks.map((chunk) => ({
    startOffset: chunk.boundaries.overlapStart ?? chunk.boundaries.start,
    endOffset: chunk.boundaries.end,
  }));
  return detectBrokenPatterns(normalizeText(originalText), spans);
}
