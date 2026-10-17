/**
 * MedDevKit Chunker Types
 * Core interfaces for medical text chunking
 *
 * @packageDocumentation
 */

import type { MedicalEntity } from './adapters/types';

// ============================================================================
// Configuration Types
// ============================================================================

/**
 * Configuration options for MedicalChunker
 */
export interface MedicalChunkerConfig {
  /**
   * Preserve vital signs units - prevents splitting on "BP: 120/80 mmHg"
   * @default true
   */
  preserveVitals?: boolean;

  /**
   * PHI detection mode
   * - 'none': No PHI detection
   * - 'basic': Flag common PHI patterns (names, dates, MRN)
   * - 'enhanced': More comprehensive detection (requires cloud mode)
   * @default 'basic'
   */
  phiDetection?: 'none' | 'basic' | 'enhanced';

  /**
   * Maximum tokens per chunk (core content, before overlap)
   * Uses tiktoken-compatible estimation (~4 chars per token).
   * Overlap is added on top of this budget, so a chunk's tokenCount may
   * exceed maxTokens by up to overlapTokens.
   * @default 512
   */
  maxTokens?: number;

  /**
   * Minimum tokens per chunk (avoids tiny chunks)
   * @default 50
   */
  minTokens?: number;

  /**
   * Overlap tokens between chunks for context preservation.
   *
   * Every chunk after the first is prefixed with up to this many tokens of
   * the text immediately preceding its core range. The overlap is a
   * contiguous slice of the normalized text that starts at a word boundary
   * (preferring a sentence or line start) and never inside a protected range
   * (vital, medication, custom/plugin range) or PHI marker. Overlap is
   * additive: chunk tokenCount may exceed maxTokens by up to overlapTokens.
   * All offset-bearing chunk fields (phiMarkers, vitals, negations, etc.)
   * are relative to the final chunk.text, overlap included.
   * @default 50
   */
  overlapTokens?: number;

  /**
   * Recognize and preserve clinical section boundaries
   * (CC, HPI, PE, Assessment, Plan, etc.)
   * @default true
   */
  preserveSections?: boolean;

  /**
   * Preserve sentences - never split mid-sentence
   * @default true
   */
  preserveSentences?: boolean;

  /**
   * Detect and annotate negated findings
   * @default false
   */
  detectNegations?: boolean;

  /**
   * Preserve medication mentions - prevents splitting on
   * "Metoprolol 25 mg PO BID". Detected medications become protected
   * ranges (like vitals) and are attached to chunk metadata.
   * @default true
   */
  preserveMedications?: boolean;

  /**
   * Detect and annotate temporal expressions
   * ("for 3 days", "started 2 days ago", "intermittent")
   * @default false
   */
  detectTemporal?: boolean;

  /**
   * Detect and annotate severity modifiers
   * ("mild", "severe chest pain", "life-threatening")
   * @default false
   */
  detectSeverity?: boolean;

  /**
   * Custom patterns to preserve (will not be split)
   */
  customPreservePatterns?: RegExp[];

  /**
   * Plugins to use for pattern detection and annotation
   * Plugins are applied in order
   */
  plugins?: PatternPlugin[];

  /**
   * Whether to include full pattern match details in output
   * @default true
   */
  includePluginPatterns?: boolean;

  /**
   * Strict mode: fail if plugin requires newer context version
   * @default false (graceful degradation)
   */
  strictPluginCompatibility?: boolean;
}

// ============================================================================
// Output Types
// ============================================================================

/**
 * A single chunk of medical text with metadata
 */
export interface MedicalChunk {
  /**
   * The chunk text content
   */
  text: string;

  /**
   * Unique chunk identifier
   */
  id: string;

  /**
   * Zero-based index of this chunk
   */
  index: number;

  /**
   * Whether this chunk potentially contains PHI
   */
  hasPhi: boolean;

  /**
   * Detected PHI markers (positions, not content)
   */
  phiMarkers: PhiMarker[];

  /**
   * Chunk boundaries in the original text
   */
  boundaries: ChunkBoundary;

  /**
   * Chunk metadata
   */
  metadata: ChunkMetadata;
}

/**
 * Marker indicating potential PHI location
 */
export interface PhiMarker {
  /**
   * Type of PHI detected
   */
  type: PhiType;

  /**
   * Start position within the chunk
   */
  startOffset: number;

  /**
   * End position within the chunk
   */
  endOffset: number;

  /**
   * Detection confidence (0-1)
   */
  confidence: number;
}

/**
 * Types of Protected Health Information
 */
export type PhiType =
  | 'name'
  | 'date'
  | 'mrn'
  | 'ssn'
  | 'phone'
  | 'email'
  | 'address'
  | 'age_over_89'
  | 'unknown';

/**
 * Boundary information for a chunk
 */
export interface ChunkBoundary {
  /**
   * Start of the chunk's core (non-overlap) range, as an offset into the
   * normalized text. Core ranges of consecutive chunks do not overlap.
   */
  start: number;

  /**
   * End (exclusive) of the chunk's core range in the normalized text.
   * chunk.text always ends here (minus trailing whitespace).
   */
  end: number;

  /**
   * Offset in the normalized text where chunk.text actually begins when
   * overlap from the preceding text was prepended (always < start).
   * Absent when the chunk has no overlap. Offsets in phiMarkers and chunk
   * metadata are relative to this position when present.
   */
  overlapStart?: number;

  /**
   * Type of boundary that caused the split
   */
  splitReason: SplitReason;
}

/**
 * Reason why a chunk was split at this point
 */
export type SplitReason =
  | 'max_tokens'
  | 'section_boundary'
  | 'paragraph'
  | 'sentence'
  | 'end_of_text';

/**
 * Metadata for a chunk
 */
export interface ChunkMetadata {
  /**
   * Estimated token count
   */
  tokenCount: number;

  /**
   * Character count
   */
  charCount: number;

  /**
   * Word count
   */
  wordCount: number;

  /**
   * Clinical section this chunk belongs to (if detected)
   */
  section?: ClinicalSection;

  /**
   * Vital signs found in this chunk
   */
  vitals?: VitalSign[];

  /**
   * Negated findings in this chunk
   */
  negations?: NegationContext[];

  /**
   * Medication mentions found in this chunk
   */
  medications?: MedicationMention[];

  /**
   * Temporal expressions found in this chunk
   */
  temporal?: TemporalExpression[];

  /**
   * Severity modifiers found in this chunk
   */
  severity?: SeverityModifier[];

  /**
   * Pattern matches from plugins, keyed by plugin ID
   */
  pluginPatterns?: Record<string, PatternMatch[]>;

  /**
   * Flattened list of all plugin pattern matches, sorted by position
   */
  allPatternMatches?: PatternMatch[];

  /**
   * Entities passed via {@link ChunkOptions.entities} that lie fully within
   * this chunk's text (including any overlap prefix). Copies with
   * `startOffset`/`endOffset` relative to `chunk.text`, so
   * `chunk.text.slice(e.startOffset, e.endOffset) === e.text`.
   *
   * An entity that crosses a chunk boundary (only possible for entities too
   * long to be protected from splitting) is attached only to chunks that
   * fully contain it, and is omitted from chunk metadata if no chunk does.
   *
   * Present (possibly empty) only when the `entities` option was provided.
   */
  entities?: MedicalEntity[];
}

// ============================================================================
// Clinical Section Types
// ============================================================================

/**
 * A detected clinical section
 */
export interface ClinicalSection {
  /**
   * Section type
   */
  type: ClinicalSectionType;

  /**
   * Section header as it appears in text
   */
  header: string;

  /**
   * Start position in text
   */
  startOffset: number;

  /**
   * Confidence of section detection (0-1)
   */
  confidence: number;
}

/**
 * Standard clinical note section types
 */
export type ClinicalSectionType =
  | 'chief_complaint'
  | 'hpi'
  | 'past_medical_history'
  | 'past_surgical_history'
  | 'medications'
  | 'allergies'
  | 'family_history'
  | 'social_history'
  | 'review_of_systems'
  | 'physical_exam'
  | 'assessment'
  | 'plan'
  | 'labs'
  | 'imaging'
  | 'procedures'
  | 'vitals'
  | 'unknown';

// ============================================================================
// Vital Signs Types
// ============================================================================

/**
 * A detected vital sign measurement
 */
export interface VitalSign {
  /**
   * Type of vital sign
   */
  type: VitalType;

  /**
   * Raw text as it appears
   */
  raw: string;

  /**
   * Parsed value (if applicable)
   */
  value?: number | string;

  /**
   * Secondary value (e.g., diastolic for blood pressure)
   */
  value2?: number;

  /**
   * Unit of measurement
   */
  unit?: string;

  /**
   * Start position in text
   */
  startOffset: number;

  /**
   * End position in text
   */
  endOffset: number;
}

/**
 * Types of vital signs
 */
export type VitalType =
  | 'blood_pressure'
  | 'heart_rate'
  | 'respiratory_rate'
  | 'temperature'
  | 'oxygen_saturation'
  | 'weight'
  | 'height'
  | 'bmi'
  | 'pain_scale';

// ============================================================================
// Negation Types
// ============================================================================

/**
 * A detected negation context
 */
export interface NegationContext {
  /**
   * The negated finding text
   */
  negatedText: string;

  /**
   * Type of negation
   */
  type: NegationType;

  /**
   * Start position in text
   */
  startOffset: number;

  /**
   * End position in text
   */
  endOffset: number;

  /**
   * Detection confidence (0-1)
   */
  confidence: number;
}

/**
 * Types of negation patterns
 */
export type NegationType =
  | 'absent' // "no chest pain"
  | 'denied' // "denies fever"
  | 'ruled_out' // "rule out MI"
  | 'negative' // "negative for malignancy"
  | 'without'; // "without edema"

// ============================================================================
// Medication Types
// ============================================================================

/**
 * A detected medication mention (drug name + dose)
 *
 * Pattern-based only - no drug lexicon is used, so `name` is the
 * 1-2 word token(s) immediately preceding the dose.
 */
export interface MedicationMention {
  /**
   * Medication name as it appears (e.g., "Metoprolol", "insulin glargine")
   */
  name: string;

  /**
   * Raw text of the full mention (name through route/frequency)
   */
  raw: string;

  /**
   * Parsed dose (lower bound for ranges, e.g. 1 in "1-2 tabs")
   */
  dose?: number;

  /**
   * Upper bound of a dose range (e.g. 2 in "1-2 tabs")
   */
  doseMax?: number;

  /**
   * Dose unit as it appears (e.g., "mg", "units", "puffs")
   */
  unit?: string;

  /**
   * Normalized route of administration (PO -> 'oral', IV -> 'intravenous')
   */
  route?: MedicationRoute;

  /**
   * Frequency as it appears (e.g., "BID", "q4h prn", "twice daily")
   */
  frequency?: string;

  /**
   * Start position in text
   */
  startOffset: number;

  /**
   * End position in text
   */
  endOffset: number;

  /**
   * Detection confidence (0-1); higher when route/frequency are present
   */
  confidence: number;
}

/**
 * Normalized routes of administration
 */
export type MedicationRoute =
  | 'oral' // PO, by mouth
  | 'intravenous' // IV, IVPB
  | 'intramuscular' // IM
  | 'subcutaneous' // SQ, SC, subcut
  | 'sublingual' // SL
  | 'topical'
  | 'inhaled' // inhaled, neb
  | 'rectal' // PR
  | 'other';

// ============================================================================
// Temporal Types
// ============================================================================

/**
 * A detected temporal expression
 */
export interface TemporalExpression {
  /**
   * Kind of temporal expression
   */
  type: TemporalType;

  /**
   * Raw text as it appears
   */
  raw: string;

  /**
   * Parsed numeric quantity ("3" in "for 3 days"); undefined for vague
   * quantities ("for several days") and non-numeric expressions
   */
  value?: number;

  /**
   * Normalized time unit
   */
  unit?: TemporalUnit;

  /**
   * Start position in text
   */
  startOffset: number;

  /**
   * End position in text
   */
  endOffset: number;

  /**
   * Detection confidence (0-1)
   */
  confidence: number;
}

/**
 * Types of temporal expressions
 */
export type TemporalType =
  | 'duration' // "for 3 days", "x 2 weeks"
  | 'onset' // "started 2 days ago", "since yesterday"
  | 'relative' // "yesterday", "2 weeks ago"
  | 'course'; // "intermittent", "worsening"

/**
 * Normalized time units
 */
export type TemporalUnit =
  | 'minute'
  | 'hour'
  | 'day'
  | 'week'
  | 'month'
  | 'year';

// ============================================================================
// Severity Types
// ============================================================================

/**
 * A detected severity modifier
 */
export interface SeverityModifier {
  /**
   * Normalized severity level
   */
  level: SeverityLevel;

  /**
   * Severity term as it appears (e.g., "severe", "mild-to-moderate")
   */
  term: string;

  /**
   * The finding the term modifies ("chest pain" in "severe chest pain")
   */
  modifiedText?: string;

  /**
   * Start position in text (start of the term)
   */
  startOffset: number;

  /**
   * End position in text (end of modifiedText, or of the term if none)
   */
  endOffset: number;

  /**
   * Detection confidence (0-1)
   */
  confidence: number;
}

/**
 * Normalized severity levels
 */
export type SeverityLevel = 'mild' | 'moderate' | 'severe' | 'critical';

// ============================================================================
// Processing Result Types
// ============================================================================

/**
 * Per-call options for {@link MedicalChunker.chunk}.
 */
export interface ChunkOptions {
  /**
   * Entities from a clinical NLP analysis (typically
   * `MedicalAnalysisResult.entities` from `MedicalAnalyzer`).
   *
   * Offsets must refer to the normalized text, i.e. `normalizeText(text)`.
   * Pass `MedicalAnalysisResult.text` as the text to chunk: if the text
   * given to `chunk()` is not already normalized, all entities are ignored
   * and a warning is added to `metadata.warnings`. Entities with invalid
   * offsets (non-integer, negative, empty, or past the end of the text) or
   * whose non-empty `text` does not match the text at their offsets are
   * skipped, with one aggregated warning.
   *
   * Valid entities of at most 100 characters (and no longer than the
   * chunk size) are protected from splitting, like vital signs and
   * medications. Every valid entity is attached to `metadata.entities` of
   * each chunk that fully contains it, with offsets relative to
   * `chunk.text`.
   */
  entities?: MedicalEntity[];
}

/**
 * Result of chunking clinical text
 */
export interface ChunkingResult {
  /**
   * Array of chunks
   */
  chunks: MedicalChunk[];

  /**
   * Processing metadata
   */
  metadata: ProcessingMetadata;
}

/**
 * Metadata about the chunking process
 */
export interface ProcessingMetadata {
  /**
   * Original text length in characters
   */
  originalLength: number;

  /**
   * Total chunks created
   */
  totalChunks: number;

  /**
   * Processing time in milliseconds
   */
  processingTimeMs: number;

  /**
   * Configuration used for processing
   */
  config: Required<MedicalChunkerConfig>;

  /**
   * Any warnings generated during processing
   */
  warnings: string[];

  /**
   * Whether any PHI was detected in the text
   */
  containsPhi: boolean;

  /**
   * Clinical sections detected in the document
   */
  sectionsDetected: ClinicalSectionType[];

  /**
   * Total vital signs detected
   */
  vitalsDetected: number;

  /**
   * Total medication mentions detected (0 when preserveMedications is false)
   */
  medicationsDetected: number;

  /**
   * Total temporal expressions detected (0 when detectTemporal is false)
   */
  temporalDetected: number;

  /**
   * Total severity modifiers detected (0 when detectSeverity is false)
   */
  severityDetected: number;

  /**
   * MedDevKit Context version used for processing
   */
  contextVersion?: string;

  /**
   * Plugins that were applied during processing
   */
  pluginsApplied?: string[];

  /**
   * Warnings from plugins during processing
   */
  pluginWarnings?: Array<{ pluginId: string; message: string }>;

  /**
   * Total pattern matches detected by plugins
   */
  pluginPatternsDetected?: number;

  /**
   * Number of valid entities used from {@link ChunkOptions.entities}
   * (0 when they were all ignored or skipped). Present only when the
   * `entities` option was provided.
   */
  entitiesProvided?: number;
}

// ============================================================================
// Internal Types (exported for advanced usage)
// ============================================================================

/**
 * A range in text that should be protected from splitting
 */
export interface ProtectedRange {
  /**
   * Start position
   */
  start: number;

  /**
   * End position
   */
  end: number;

  /**
   * Reason this range is protected
   */
  reason:
    | 'vital'
    | 'medication'
    | 'custom'
    | 'sentence'
    | 'plugin'
    /** An entity passed via {@link ChunkOptions.entities} */
    | 'entity';
}

/**
 * Result of finding a split point
 */
export interface SplitPoint {
  /**
   * Position in text to split
   */
  position: number;

  /**
   * Reason for choosing this split point
   */
  reason: SplitReason;
}

// ============================================================================
// Plugin System Types
// ============================================================================

/**
 * Features available in MedDevKitContext
 * New features are added in each version
 */
export interface ContextFeatures {
  /** Basic token estimation */
  tokenEstimation: boolean;
  /** Pattern matching helpers */
  patternMatching: boolean;
  /** Protected range management */
  protectedRanges: boolean;
  /** Full text access */
  textAccess: boolean;
  /** Access to detected clinical sections (v1.1.0+) */
  sectionContext: boolean;
  /** Access to adjacent chunks (v1.2.0+) */
  neighborChunks: boolean;
  /** Async pattern detection support (v2.0.0+) */
  asyncPatternDetection: boolean;
  /** Inter-plugin communication (v2.0.0+) */
  pluginCommunication: boolean;
  /** Advanced tokenization options (v2.0.0+) */
  advancedTokenization: boolean;
}

/**
 * MedDevKit Context - passed to all plugin methods
 *
 * Provides utilities for pattern detection, token estimation,
 * and document access. Features expand with each version.
 */
export interface MedDevKitContext {
  // ========== Versioning ==========

  /**
   * Marketing brand version (e.g., "MedDevKit Context 1.0")
   */
  readonly brandVersion: string;

  /**
   * Semantic version for compatibility checking (e.g., "1.0.0")
   */
  readonly contextVersion: string;

  /**
   * Features available in this context version
   */
  readonly features: ContextFeatures;

  // ========== Document Access ==========

  /**
   * Original text being processed
   */
  readonly text: string;

  /**
   * Normalized text (whitespace cleaned, etc.)
   */
  readonly normalizedText: string;

  // ========== Token Utilities ==========

  /**
   * Estimate token count for a string
   */
  estimateTokens(text: string): number;

  /**
   * Estimate character count for a target token count
   */
  estimateCharsForTokens(tokens: number): number;

  // ========== Pattern Matching Helpers ==========

  /**
   * Execute a regex pattern and return all matches with positions
   */
  matchPattern(pattern: RegExp): Array<{
    match: RegExpExecArray;
    start: number;
    end: number;
  }>;

  // ========== Protected Ranges ==========

  /**
   * Get all currently protected ranges
   */
  getProtectedRanges(): readonly ProtectedRange[];

  /**
   * Request a range to be protected from splitting
   */
  addProtectedRange(start: number, end: number, reason?: string): void;

  // ========== Feature Detection ==========

  /**
   * Check if a feature is available in this context version
   */
  hasFeature(feature: keyof ContextFeatures): boolean;
}

/**
 * A pattern match detected by a plugin
 */
export interface PatternMatch {
  /**
   * Pattern identifier (e.g., "ejection-fraction")
   */
  patternId: string;

  /**
   * Human-readable pattern name
   */
  patternName: string;

  /**
   * Plugin that produced this match
   */
  pluginId: string;

  /**
   * Start position in text
   */
  startOffset: number;

  /**
   * End position in text
   */
  endOffset: number;

  /**
   * Raw matched text
   */
  raw: string;

  /**
   * Detection confidence (0-1)
   */
  confidence: number;

  /**
   * Whether this range should be protected from splitting
   */
  isProtected: boolean;

  /**
   * Optional parsed/structured data
   */
  data?: Record<string, unknown>;

  /**
   * Optional category for grouping (e.g., "medication", "lab_value")
   */
  category?: string;
}

/**
 * Annotations returned by plugin's annotateChunk method
 */
export interface ChunkAnnotations {
  /**
   * Additional metadata to merge into chunk
   */
  metadata?: Record<string, unknown>;

  /**
   * Tags to add to the chunk
   */
  tags?: string[];
}

/**
 * Plugin interface for extending MedicalChunker
 *
 * Plugins can detect patterns, define protected ranges,
 * and annotate chunks with additional metadata.
 */
export interface PatternPlugin {
  // ========== Identity ==========

  /**
   * Unique plugin identifier (e.g., "@meddevkit/plugin-cardiology")
   */
  readonly id: string;

  /**
   * Human-readable plugin name
   */
  readonly name: string;

  /**
   * Plugin version (semver)
   */
  readonly version: string;

  /**
   * Minimum MedDevKit Context version required
   */
  readonly minContextVersion: string;

  /**
   * Optional description
   */
  readonly description?: string;

  // ========== Capability Methods (all optional) ==========

  /**
   * Detect patterns in the text
   */
  detectPatterns?(text: string, ctx: MedDevKitContext): PatternMatch[];

  /**
   * Define ranges that should be protected from splitting
   */
  getProtectedRanges?(text: string, ctx: MedDevKitContext): ProtectedRange[];

  /**
   * Annotate a chunk with additional metadata
   */
  annotateChunk?(chunk: MedicalChunk, ctx: MedDevKitContext): ChunkAnnotations;

  // ========== Lifecycle Hooks ==========

  /**
   * Called once when plugin is registered
   */
  onRegister?(ctx: MedDevKitContext): void | Promise<void>;

  /**
   * Called at the start of document processing
   */
  onDocumentStart?(document: { text: string }, ctx: MedDevKitContext): void;

  /**
   * Called after all patterns are collected, can modify patterns
   */
  onPatternsCollected?(
    patterns: PatternMatch[],
    ctx: MedDevKitContext
  ): PatternMatch[];

  /**
   * Called after each chunk is created, can modify chunk.
   *
   * Runs after overlap has been applied, so chunk.text, phiMarkers and all
   * metadata offsets are final and relative to chunk.text. Changes made
   * here are not revisited by the chunker.
   */
  onChunkCreated?(chunk: MedicalChunk, ctx: MedDevKitContext): MedicalChunk;

  /**
   * Called after all chunks are created
   */
  onDocumentEnd?(result: ChunkingResult, ctx: MedDevKitContext): void;

  /**
   * Called when plugin is unloaded (cleanup)
   */
  onUnload?(): void;
}

/**
 * Result of registering a plugin
 */
export interface PluginRegistration {
  /**
   * Plugin ID
   */
  id: string;

  /**
   * Whether plugin was successfully registered
   */
  success: boolean;

  /**
   * Warning if plugin uses newer features than available
   */
  compatibilityWarning?: string;

  /**
   * Features unavailable due to version mismatch
   */
  unavailableFeatures?: (keyof ContextFeatures)[];
}
