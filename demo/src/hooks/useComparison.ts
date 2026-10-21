import { useMemo } from 'react';
import type { ChunkingResult } from '@meddevkit/chunker';
import { naiveChunk, type NaiveChunkerResult } from '../utils/naiveChunker';
import {
  detectBrokenPatterns,
  detectBrokenPatternsInChunkingResult,
  type BrokenPattern,
} from '../utils/brokenPatternDetector';

export interface ComparisonResult {
  naiveResult: NaiveChunkerResult;
  brokenPatterns: BrokenPattern[];
  /** Same detection run on MedDevKit's chunks; null when there is no result */
  medDevKitBrokenPatterns: BrokenPattern[] | null;
}

/**
 * Runs naive chunker + broken pattern detection, and the same detection on
 * the MedDevKit chunking result.
 * Only computes when text is non-empty (comparison mode active).
 */
export function useComparison(
  text: string,
  maxTokens: number,
  result: ChunkingResult | null,
): ComparisonResult {
  return useMemo(() => {
    if (!text.trim()) {
      return {
        naiveResult: { chunks: [], totalChunks: 0 },
        brokenPatterns: [],
        medDevKitBrokenPatterns: null,
      };
    }

    const naiveResult = naiveChunk(text, maxTokens);
    const brokenPatterns = detectBrokenPatterns(text, naiveResult.chunks);
    const medDevKitBrokenPatterns = result
      ? detectBrokenPatternsInChunkingResult(text, result)
      : null;

    return { naiveResult, brokenPatterns, medDevKitBrokenPatterns };
  }, [text, maxTokens, result]);
}
