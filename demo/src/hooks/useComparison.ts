import { useMemo } from 'react';
import { naiveChunk, type NaiveChunkerResult } from '../utils/naiveChunker';
import { detectBrokenPatterns, type BrokenPattern } from '../utils/brokenPatternDetector';

export interface ComparisonResult {
  naiveResult: NaiveChunkerResult;
  brokenPatterns: BrokenPattern[];
}

/**
 * Runs naive chunker + broken pattern detection.
 * Only computes when text is non-empty (comparison mode active).
 */
export function useComparison(text: string, maxTokens: number): ComparisonResult {
  return useMemo(() => {
    if (!text.trim()) {
      return {
        naiveResult: { chunks: [], totalChunks: 0 },
        brokenPatterns: [],
      };
    }

    const naiveResult = naiveChunk(text, maxTokens);
    const brokenPatterns = detectBrokenPatterns(text, naiveResult.chunks);

    return { naiveResult, brokenPatterns };
  }, [text, maxTokens]);
}
