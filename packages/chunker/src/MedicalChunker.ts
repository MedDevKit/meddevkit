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
  MedicationMention,
  TemporalExpression,
  SeverityModifier,
  ProtectedRange,
  SplitReason,
  PatternMatch,
  ChunkMetadata,
} from './types';

import {
  detectVitals,
  detectSections,
  getSectionAtPosition,
  getSectionBoundaries,
  detectPhi,
  detectNegations,
  detectMedications,
  detectTemporal,
  detectSeverity,
} from './patterns';

import { estimateTokens, estimateCharsForTokens } from './tokenizer';
import {
  normalizeText,
  findBestSplitPoint,
  findOverlapStart,
} from './utils';

import {
  PluginManager,
  MedDevKitContextImpl,
  CONTEXT_VERSION,
} from './plugins';

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
  preserveMedications: true,
  detectTemporal: false,
  detectSeverity: false,
  customPreservePatterns: [],
  plugins: [],
  includePluginPatterns: true,
  strictPluginCompatibility: false,
};

/**
 * Document-level detections, with offsets into the normalized text.
 * Per-chunk lists are derived from these for each chunk's text range.
 */
interface DocumentDetections {
  phiMarkers: PhiMarker[];
  vitals: VitalSign[];
  negations: NegationContext[];
  medications: MedicationMention[];
  temporal: TemporalExpression[];
  severity: SeverityModifier[];
  /** Plugin patterns to attach to chunks (empty when not attaching) */
  pluginPatterns: Map<string, PatternMatch[]>;
}

// ============================================================================
// MedicalChunker Class
// ============================================================================

/**
 * PHI-Aware Medical Text Chunker
 *
 * Chunks clinical text while preserving medical context:
 * - Never splits vital signs (e.g., "BP: 120/80 mmHg")
 * - Never splits medication mentions (e.g., "Metoprolol 25 mg PO BID")
 * - Respects clinical section boundaries
 * - Detects and flags potential PHI
 * - Token-aware chunking for LLM context limits
 */
export class MedicalChunker {
  private config: Required<MedicalChunkerConfig>;
  private pluginManager: PluginManager | null = null;
  private pluginsInitialized: boolean = false;

  /**
   * Create a new MedicalChunker instance
   *
   * @param config - Configuration options
   */
  constructor(config: MedicalChunkerConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.validateConfig();

    // Initialize plugin manager if plugins are provided
    if (this.config.plugins && this.config.plugins.length > 0) {
      this.pluginManager = new PluginManager(this.config.strictPluginCompatibility);
      for (const plugin of this.config.plugins) {
        this.pluginManager.register(plugin);
      }
    }
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

    const medications = this.config.preserveMedications
      ? detectMedications(normalizedText)
      : [];

    const temporal = this.config.detectTemporal
      ? detectTemporal(normalizedText)
      : [];

    const severity = this.config.detectSeverity
      ? detectSeverity(normalizedText)
      : [];

    // Build base protected ranges (regions that should not be split)
    let protectedRanges = this.buildProtectedRanges(
      normalizedText,
      vitals,
      medications,
      this.config.customPreservePatterns
    );

    // Plugin integration
    let pluginPatterns: Map<string, PatternMatch[]> = new Map();
    let ctx: MedDevKitContextImpl | null = null;

    if (this.pluginManager) {
      // Create context for plugins
      ctx = new MedDevKitContextImpl(text, protectedRanges);

      // Initialize plugins (first time only)
      if (!this.pluginsInitialized) {
        // Note: This is sync for now; async initialization would need refactoring
        // For async plugins, users should call initializePlugins() before chunking
        this.pluginsInitialized = true;
      }

      // Call onDocumentStart
      this.pluginManager.onDocumentStart({ text }, ctx);

      // Collect patterns from plugins
      pluginPatterns = this.pluginManager.collectPatterns(normalizedText, ctx);

      // Collect protected ranges from plugins
      const pluginProtectedRanges = this.pluginManager.collectProtectedRanges(
        normalizedText,
        ctx
      );

      // Also get ranges added via ctx.addProtectedRange()
      const contextRanges = ctx.getAdditionalRanges();

      // Merge all protected ranges
      protectedRanges = this.mergeProtectedRanges([
        ...protectedRanges,
        ...pluginProtectedRanges,
        ...contextRanges,
        ...this.getProtectedRangesFromPatterns(pluginPatterns),
      ]);

      // Update context with merged ranges
      ctx.setExistingRanges(protectedRanges);

      // Allow plugins to modify patterns
      const allPatterns = PluginManager.flattenPatterns(pluginPatterns);
      const modifiedPatterns = this.pluginManager.onPatternsCollected(
        allPatterns,
        ctx
      );

      // Rebuild pattern map if patterns were modified
      if (modifiedPatterns !== allPatterns) {
        pluginPatterns = this.rebuildPatternMap(modifiedPatterns);
      }
    }

    // Get section boundaries for preferred split points
    const sectionBoundaries = getSectionBoundaries(normalizedText);

    const detections: DocumentDetections = {
      phiMarkers,
      vitals,
      negations,
      medications,
      temporal,
      severity,
      pluginPatterns:
        this.pluginManager && this.config.includePluginPatterns
          ? pluginPatterns
          : new Map(),
    };

    // Perform chunking
    let chunks = this.performChunking(
      normalizedText,
      sections,
      sectionBoundaries,
      protectedRanges,
      detections
    );

    // Add overlap if configured. This runs before onChunkCreated so plugins
    // see the final chunk text with offsets aligned to it.
    if (this.config.overlapTokens > 0) {
      chunks = this.addOverlap(
        chunks,
        normalizedText,
        protectedRanges,
        detections
      );
    }

    // Plugin: onChunkCreated
    if (this.pluginManager && ctx) {
      chunks = chunks.map((chunk) =>
        this.pluginManager!.onChunkCreated(chunk, ctx!)
      );
    }

    const processingTimeMs = performance.now() - startTime;

    // Build result
    const result: ChunkingResult = {
      chunks,
      metadata: {
        originalLength: text.length,
        totalChunks: chunks.length,
        processingTimeMs,
        config: this.config,
        warnings,
        containsPhi: phiMarkers.length > 0,
        sectionsDetected: [...new Set(sections.map((s) => s.type))],
        vitalsDetected: vitals.length,
        medicationsDetected: medications.length,
        temporalDetected: temporal.length,
        severityDetected: severity.length,
        // Plugin metadata
        contextVersion: this.pluginManager ? CONTEXT_VERSION : undefined,
        pluginsApplied: this.pluginManager
          ? this.pluginManager.getPluginIds()
          : undefined,
        pluginWarnings: this.pluginManager
          ? this.pluginManager.getWarningsForOutput()
          : undefined,
        pluginPatternsDetected: this.pluginManager
          ? PluginManager.countPatterns(pluginPatterns)
          : undefined,
      },
    };

    // Plugin: onDocumentEnd
    if (this.pluginManager && ctx) {
      this.pluginManager.onDocumentEnd(result, ctx);
    }

    return result;
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
    medications: MedicationMention[],
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

    // Add medication ranges
    for (const medication of medications) {
      ranges.push({
        start: medication.startOffset,
        end: medication.endOffset,
        reason: 'medication',
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
    detections: DocumentDetections
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

      // Chunk text starts at the first non-whitespace character
      const textStart = this.skipWhitespace(text, position, end);
      const content = this.buildChunkContent(text, textStart, end, detections);

      if (content.text.length > 0) {
        // Check minimum tokens
        if (
          content.metadata.tokenCount >= this.config.minTokens ||
          end >= text.length
        ) {
          // Determine section for this chunk
          const section = getSectionAtPosition(sections, position);

          chunks.push({
            text: content.text,
            id: this.generateChunkId(chunkIndex),
            index: chunkIndex,
            hasPhi: content.hasPhi,
            phiMarkers: content.phiMarkers,
            boundaries: {
              start: position,
              end,
              splitReason: reason,
            },
            metadata: {
              ...content.metadata,
              section,
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
   * Build a chunk's text and all offset-bearing fields for the text range
   * [textStart, end). Every returned offset is relative to the returned
   * text, which is the normalized text in that range with trailing
   * whitespace trimmed (textStart must not point at whitespace).
   */
  private buildChunkContent(
    text: string,
    textStart: number,
    end: number,
    detections: DocumentDetections
  ): Pick<MedicalChunk, 'text' | 'hasPhi' | 'phiMarkers'> & {
    metadata: Omit<ChunkMetadata, 'section'>;
  } {
    const chunkText = text.slice(textStart, end).trimEnd();
    const inRange = <T extends { startOffset: number; endOffset: number }>(
      spans: T[]
    ): T[] => this.getSpansInRange(spans, textStart, end);
    const orUndefined = <T>(list: T[]): T[] | undefined =>
      list.length > 0 ? list : undefined;

    const phiMarkers = inRange(detections.phiMarkers);

    const metadata: Omit<ChunkMetadata, 'section'> = {
      tokenCount: estimateTokens(chunkText),
      charCount: chunkText.length,
      wordCount: chunkText.split(/\s+/).filter(Boolean).length,
      vitals: orUndefined(inRange(detections.vitals)),
      negations: orUndefined(inRange(detections.negations)),
      medications: orUndefined(inRange(detections.medications)),
      temporal: orUndefined(inRange(detections.temporal)),
      severity: orUndefined(inRange(detections.severity)),
    };

    // Plugin patterns (only present when at least one match is in range)
    const pluginPatterns: Record<string, PatternMatch[]> = {};
    const allMatches: PatternMatch[] = [];
    for (const [pluginId, patterns] of detections.pluginPatterns) {
      const inChunk = inRange(patterns);
      if (inChunk.length > 0) {
        pluginPatterns[pluginId] = inChunk;
        allMatches.push(...inChunk);
      }
    }
    if (allMatches.length > 0) {
      metadata.pluginPatterns = pluginPatterns;
      metadata.allPatternMatches = allMatches.sort(
        (a, b) => a.startOffset - b.startOffset
      );
    }

    return {
      text: chunkText,
      hasPhi: phiMarkers.length > 0,
      phiMarkers,
      metadata,
    };
  }

  /**
   * First non-whitespace position in [start, end), or end if none
   */
  private skipWhitespace(text: string, start: number, end: number): number {
    let i = start;
    while (i < end && /\s/.test(text[i])) i++;
    return i;
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
   * Get offset-bearing spans fully inside a range, with offsets made
   * relative to the range start
   */
  private getSpansInRange<T extends { startOffset: number; endOffset: number }>(
    spans: T[],
    start: number,
    end: number
  ): T[] {
    return spans
      .filter((s) => s.startOffset >= start && s.endOffset <= end)
      .map((s) => ({
        ...s,
        startOffset: s.startOffset - start,
        endOffset: s.endOffset - start,
      }));
  }

  /**
   * Add overlap between chunks
   *
   * Each chunk after the first gets a prefix of up to overlapTokens of the
   * text immediately preceding its core range (bounded by the previous
   * chunk's core start). The prefix starts at a clean position chosen by
   * findOverlapStart (sentence/line start preferred, never mid-word, never
   * inside a protected range or PHI span). chunk.text becomes the
   * contiguous normalized text from that position to boundaries.end, and
   * all offset-bearing fields are rebuilt relative to it, so detections in
   * the overlap are reported too. boundaries.start/end stay the core range;
   * boundaries.overlapStart records where chunk.text begins.
   */
  private addOverlap(
    chunks: MedicalChunk[],
    fullText: string,
    protectedRanges: ProtectedRange[],
    detections: DocumentDetections
  ): MedicalChunk[] {
    if (chunks.length <= 1) return chunks;

    const overlapChars = estimateCharsForTokens(this.config.overlapTokens);
    const blockedRanges = [
      ...protectedRanges,
      ...detections.phiMarkers.map((m) => ({
        start: m.startOffset,
        end: m.endOffset,
      })),
    ];

    return chunks.map((chunk, index) => {
      if (index === 0) return chunk;

      const prevChunk = chunks[index - 1];
      const coreStart = chunk.boundaries.start;
      const windowStart = Math.max(
        prevChunk.boundaries.start,
        coreStart - overlapChars
      );
      const overlapStart = findOverlapStart(
        fullText,
        windowStart,
        coreStart,
        blockedRanges
      );

      // Snapping left no overlap: keep the chunk as is
      if (overlapStart >= coreStart) return chunk;

      const content = this.buildChunkContent(
        fullText,
        overlapStart,
        chunk.boundaries.end,
        detections
      );

      return {
        ...chunk,
        text: content.text,
        hasPhi: content.hasPhi,
        phiMarkers: content.phiMarkers,
        boundaries: {
          ...chunk.boundaries,
          overlapStart,
        },
        metadata: {
          ...content.metadata,
          section: chunk.metadata.section,
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
        medicationsDetected: 0,
        temporalDetected: 0,
        severityDetected: 0,
      },
    };
  }

  // ==========================================================================
  // Plugin Helper Methods
  // ==========================================================================

  /**
   * Extract protected ranges from plugin pattern matches
   */
  private getProtectedRangesFromPatterns(
    patterns: Map<string, PatternMatch[]>
  ): ProtectedRange[] {
    const ranges: ProtectedRange[] = [];

    for (const matches of patterns.values()) {
      for (const match of matches) {
        if (match.isProtected) {
          ranges.push({
            start: match.startOffset,
            end: match.endOffset,
            reason: 'plugin',
          });
        }
      }
    }

    return ranges;
  }

  /**
   * Rebuild pattern map from flat array (after modification)
   */
  private rebuildPatternMap(
    patterns: PatternMatch[]
  ): Map<string, PatternMatch[]> {
    const map = new Map<string, PatternMatch[]>();

    for (const pattern of patterns) {
      const existing = map.get(pattern.pluginId) || [];
      existing.push(pattern);
      map.set(pattern.pluginId, existing);
    }

    return map;
  }

  /**
   * Initialize plugins asynchronously
   * Call this before chunking if plugins have async onRegister hooks
   */
  public async initializePlugins(): Promise<void> {
    if (!this.pluginManager || this.pluginsInitialized) {
      return;
    }

    // Create a temporary context for initialization
    const ctx = new MedDevKitContextImpl('', []);
    await this.pluginManager.initializeAll(ctx);
    this.pluginsInitialized = true;
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
