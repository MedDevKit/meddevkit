/**
 * OpenMedRAG Chunker Types
 * Core interfaces for medical text chunking
 *
 * @packageDocumentation
 */

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
   * Maximum tokens per chunk
   * Uses tiktoken-compatible estimation (~4 chars per token)
   * @default 512
   */
  maxTokens?: number;

  /**
   * Minimum tokens per chunk (avoids tiny chunks)
   * @default 50
   */
  minTokens?: number;

  /**
   * Overlap tokens between chunks for context preservation
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
   * Custom patterns to preserve (will not be split)
   */
  customPreservePatterns?: RegExp[];
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
   * Start position in original text
   */
  start: number;

  /**
   * End position in original text
   */
  end: number;

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
// Processing Result Types
// ============================================================================

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
  reason: 'vital' | 'custom' | 'sentence';
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
