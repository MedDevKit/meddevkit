/**
 * MedicalChunker - PHI-Aware Medical Text Chunker
 *
 * Core chunking class that preserves medical context and detects PHI.
 *
 * @example
 * ```typescript
 * import { MedicalChunker } from '@meddevkit/chunker';
 *
 * const chunker = new MedicalChunker({
 *   preserveVitals: true,
 *   phiDetection: 'basic',
 *   maxTokens: 512
 * });
 *
 * const result = chunker.chunk(clinicalNote);
 * // { chunks: MedicalChunk[], metadata: ProcessingMetadata }
 * ```
 *
 * @packageDocumentation
 */

import type {
  MedicalChunkerConfig,
  MedicalChunk,
  ChunkingResult,
  ClinicalSection,
  PhiMarker,
  VitalSign,
  NegationContext,
  ProtectedRange,
  SplitReason,
} from './types';

import {
  detectVitals,
  detectSections,
  getSectionAtPosition,
  getSectionBoundaries,
  detectPhi,
  detectNegations,
} from './patterns';

import { estimateTokens, estimateCharsForTokens } from './tokenizer';
import {
  normalizeText,
  findBestSplitPoint,
} from './utils';

// ============================================================================
// Default Configuration
// ============================================================================

/**
 * Default configuration values
 */
const DEFAULT_CONFIG: Required<MedicalChunkerConfig> = {
  preserveVitals: true,
  phiDetection: 'basic',
  maxTokens: 512,
  minTokens: 50,
  overlapTokens: 50,
  preserveSections: true,
  preserveSentences: true,
  detectNegations: false,
  customPreservePatterns: [],
};

// ============================================================================
// MedicalChunker Class
// ============================================================================

/**
 * PHI-Aware Medical Text Chunker
 *
 * Chunks clinical text while preserving medical context:
 * - Never splits vital signs (e.g., "BP: 120/80 mmHg")
 * - Respects clinical section boundaries
 * - Detects and flags potential PHI
 * - Token-aware chunking for LLM context limits
 */
export class MedicalChunker {
  private config: Required<MedicalChunkerConfig>;

  /**
   * Create a new MedicalChunker instance
   *
   * @param config - Configuration options
   */
  constructor(config: MedicalChunkerConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.validateConfig();
  }

  /**
   * Chunk clinical text with medical context awareness
   *
   * @param text - Clinical note text to chunk
   * @returns Chunking result with chunks and metadata
   *
   * @example
   * ```typescript
   * const result = chunker.chunk(`
   *   CHIEF COMPLAINT: Chest pain
   *   VITAL SIGNS: BP: 120/80 mmHg, HR 72 bpm
   *   HISTORY OF PRESENT ILLNESS:
   *   Patient is a 55 year old male...
   * `);
   * ```
   */
  public chunk(text: string): ChunkingResult {
    const startTime = performance.now();
    const warnings: string[] = [];

    // Normalize input text
    const normalizedText = normalizeText(text);

    if (!normalizedText) {
      return this.emptyResult(0);
    }

    // Pre-process: detect sections, vitals, PHI markers
    const sections = this.config.preserveSections
      ? detectSections(normalizedText)
      : [];

    const vitals = this.config.preserveVitals
      ? detectVitals(normalizedText)
      : [];

    const phiMarkers =
      this.config.phiDetection !== 'none'
        ? detectPhi(normalizedText, this.config.phiDetection)
        : [];

    const negations = this.config.detectNegations
      ? detectNegations(normalizedText)
      : [];

    // Build protected ranges (regions that should not be split)
    const protectedRanges = this.buildProtectedRanges(
      normalizedText,
      vitals,
      this.config.customPreservePatterns
    );

    // Get section boundaries for preferred split points
    const sectionBoundaries = getSectionBoundaries(normalizedText);

    // Perform chunking
    const chunks = this.performChunking(
      normalizedText,
      sections,
      sectionBoundaries,
      protectedRanges,
      phiMarkers,
      vitals,
      negations
    );

    // Add overlap if configured
    const chunksWithOverlap =
      this.config.overlapTokens > 0
        ? this.addOverlap(chunks, normalizedText)
        : chunks;

    const processingTimeMs = performance.now() - startTime;

    return {
      chunks: chunksWithOverlap,
      metadata: {
        originalLength: text.length,
        totalChunks: chunksWithOverlap.length,
        processingTimeMs,
        config: this.config,
        warnings,
        containsPhi: phiMarkers.length > 0,
        sectionsDetected: [...new Set(sections.map((s) => s.type))],
        vitalsDetected: vitals.length,
      },
    };
  }

  /**
   * Get the current configuration
   */
  public getConfig(): Required<MedicalChunkerConfig> {
    return { ...this.config };
  }

  /**
   * Create a new chunker with updated configuration
   *
   * @param config - Configuration overrides
   * @returns New MedicalChunker instance
   */
  public withConfig(config: Partial<MedicalChunkerConfig>): MedicalChunker {
    return new MedicalChunker({ ...this.config, ...config });
  }

  // ==========================================================================
  // Private Methods
  // ==========================================================================

  /**
   * Validate configuration
   */
  private validateConfig(): void {
    if (this.config.maxTokens < this.config.minTokens) {
      throw new Error(
        `maxTokens (${this.config.maxTokens}) must be greater than minTokens (${this.config.minTokens})`
      );
    }
    if (this.config.overlapTokens >= this.config.maxTokens) {
      throw new Error(
        `overlapTokens (${this.config.overlapTokens}) must be less than maxTokens (${this.config.maxTokens})`
      );
    }
    if (this.config.maxTokens < 10) {
      throw new Error('maxTokens must be at least 10');
    }
  }

  /**
   * Build protected ranges that should not be split
   */
  private buildProtectedRanges(
    text: string,
    vitals: VitalSign[],
    customPatterns: RegExp[]
  ): ProtectedRange[] {
    const ranges: ProtectedRange[] = [];

    // Add vital sign ranges
    for (const vital of vitals) {
      ranges.push({
        start: vital.startOffset,
        end: vital.endOffset,
        reason: 'vital',
      });
    }

    // Add custom pattern matches
    for (const pattern of customPatterns) {
      const regex = new RegExp(
        pattern.source,
        pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g'
      );
      let match;
      while ((match = regex.exec(text)) !== null) {
        ranges.push({
          start: match.index,
          end: match.index + match[0].length,
          reason: 'custom',
        });
      }
    }

    // Merge overlapping ranges
    return this.mergeProtectedRanges(ranges);
  }

  /**
   * Merge overlapping protected ranges
   */
  private mergeProtectedRanges(ranges: ProtectedRange[]): ProtectedRange[] {
    if (ranges.length <= 1) return ranges;

    const sorted = [...ranges].sort((a, b) => a.start - b.start);
    const merged: ProtectedRange[] = [sorted[0]];

    for (let i = 1; i < sorted.length; i++) {
      const current = sorted[i];
      const last = merged[merged.length - 1];

      if (current.start <= last.end) {
        last.end = Math.max(last.end, current.end);
      } else {
        merged.push(current);
      }
    }

    return merged;
  }

  /**
   * Main chunking algorithm
   */
  private performChunking(
    text: string,
    sections: ClinicalSection[],
    sectionBoundaries: number[],
    protectedRanges: ProtectedRange[],
    phiMarkers: PhiMarker[],
    vitals: VitalSign[],
    negations: NegationContext[]
  ): MedicalChunk[] {
    const chunks: MedicalChunk[] = [];
    const maxChars = estimateCharsForTokens(this.config.maxTokens);
    let position = 0;
    let chunkIndex = 0;

    while (position < text.length) {
      // Determine ideal end position based on tokens
      const idealEnd = Math.min(position + maxChars, text.length);

      // Find best split point
      const { end, reason } = this.findChunkEnd(
        text,
        position,
        idealEnd,
        sectionBoundaries,
        protectedRanges
      );

      // Extract chunk text
      const chunkText = text.slice(position, end).trim();

      if (chunkText.length > 0) {
        // Check minimum tokens
        const tokenCount = estimateTokens(chunkText);
        if (tokenCount >= this.config.minTokens || end >= text.length) {
          // Get PHI markers for this chunk (adjust positions to be relative to chunk)
          const chunkPhiMarkers = this.getMarkersInRange(
            phiMarkers,
            position,
            end
          ).map((m) => ({
            ...m,
            startOffset: m.startOffset - position,
            endOffset: m.endOffset - position,
          }));

          // Get vitals for this chunk
          const chunkVitals = vitals
            .filter((v) => v.startOffset >= position && v.endOffset <= end)
            .map((v) => ({
              ...v,
              startOffset: v.startOffset - position,
              endOffset: v.endOffset - position,
            }));

          // Get negations for this chunk
          const chunkNegations = negations
            .filter((n) => n.startOffset >= position && n.endOffset <= end)
            .map((n) => ({
              ...n,
              startOffset: n.startOffset - position,
              endOffset: n.endOffset - position,
            }));

          // Determine section for this chunk
          const section = getSectionAtPosition(sections, position);

          chunks.push({
            text: chunkText,
            id: this.generateChunkId(chunkIndex),
            index: chunkIndex,
            hasPhi: chunkPhiMarkers.length > 0,
            phiMarkers: chunkPhiMarkers,
            boundaries: {
              start: position,
              end,
              splitReason: reason,
            },
            metadata: {
              tokenCount,
              charCount: chunkText.length,
              wordCount: chunkText.split(/\s+/).filter(Boolean).length,
              section,
              vitals: chunkVitals.length > 0 ? chunkVitals : undefined,
              negations: chunkNegations.length > 0 ? chunkNegations : undefined,
            },
          });

          chunkIndex++;
        }
      }

      position = end;
    }

    return chunks;
  }

  /**
   * Find the best end position for a chunk
   */
  private findChunkEnd(
    text: string,
    startPosition: number,
    idealEnd: number,
    sectionBoundaries: number[],
    protectedRanges: ProtectedRange[]
  ): { end: number; reason: SplitReason } {
    // Check if we're at end of text
    if (idealEnd >= text.length) {
      return { end: text.length, reason: 'end_of_text' };
    }

    // Check for section boundary within range (preferred split point)
    if (this.config.preserveSections) {
      const sectionBoundary = this.findSectionBoundaryInRange(
        sectionBoundaries,
        startPosition,
        idealEnd
      );
      if (sectionBoundary !== null) {
        return { end: sectionBoundary, reason: 'section_boundary' };
      }
    }

    // Find best split point respecting protected ranges and sentences
    const splitPoint = findBestSplitPoint(
      text,
      startPosition,
      idealEnd,
      protectedRanges,
      this.config.preserveSentences
    );

    return {
      end: splitPoint.position,
      reason: splitPoint.reason,
    };
  }

  /**
   * Find a section boundary within a range
   */
  private findSectionBoundaryInRange(
    boundaries: number[],
    start: number,
    end: number
  ): number | null {
    // Look for the last section boundary in the range
    // that's at least 50% through the range
    const minPosition = start + (end - start) * 0.5;

    const validBoundaries = boundaries.filter(
      (b) => b > minPosition && b <= end
    );

    if (validBoundaries.length === 0) return null;

    // Return the last valid boundary
    return validBoundaries[validBoundaries.length - 1];
  }

  /**
   * Get markers that fall within a range
   */
  private getMarkersInRange(
    markers: PhiMarker[],
    start: number,
    end: number
  ): PhiMarker[] {
    return markers.filter((m) => m.startOffset >= start && m.endOffset <= end);
  }

  /**
   * Add overlap between chunks
   */
  private addOverlap(
    chunks: MedicalChunk[],
    fullText: string
  ): MedicalChunk[] {
    if (chunks.length <= 1) return chunks;

    const overlapChars = estimateCharsForTokens(this.config.overlapTokens);

    return chunks.map((chunk, index) => {
      if (index === 0) return chunk;

      // Get overlap from previous chunk
      const prevChunk = chunks[index - 1];
      const overlapStart = Math.max(
        prevChunk.boundaries.start,
        prevChunk.boundaries.end - overlapChars
      );
      const overlapText = fullText.slice(
        overlapStart,
        prevChunk.boundaries.end
      );

      // Prepend overlap to current chunk
      const newText = overlapText + ' ' + chunk.text;

      return {
        ...chunk,
        text: newText.trim(),
        metadata: {
          ...chunk.metadata,
          tokenCount: estimateTokens(newText),
          charCount: newText.length,
          wordCount: newText.split(/\s+/).filter(Boolean).length,
        },
      };
    });
  }

  /**
   * Generate unique chunk ID
   */
  private generateChunkId(index: number): string {
    return `chunk_${index}_${Date.now().toString(36)}`;
  }

  /**
   * Create empty result for empty input
   */
  private emptyResult(processingTimeMs: number): ChunkingResult {
    return {
      chunks: [],
      metadata: {
        originalLength: 0,
        totalChunks: 0,
        processingTimeMs,
        config: this.config,
        warnings: [],
        containsPhi: false,
        sectionsDetected: [],
        vitalsDetected: 0,
      },
    };
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a MedicalChunker with default configuration
 *
 * @returns New MedicalChunker instance
 */
export function createChunker(
  config?: MedicalChunkerConfig
): MedicalChunker {
  return new MedicalChunker(config);
}
