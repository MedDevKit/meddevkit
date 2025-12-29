/**
 * @meddevkit/chunker
 *
 * PHI-Aware Medical Text Chunker for RAG Applications
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
 * console.log(result.chunks);
 * ```
 *
 * @packageDocumentation
 */

// Core chunker
export { MedicalChunker, createChunker } from './MedicalChunker';

// Types
export type {
  // Configuration
  MedicalChunkerConfig,
  // Output types
  MedicalChunk,
  ChunkingResult,
  ChunkBoundary,
  ChunkMetadata,
  ProcessingMetadata,
  // PHI types
  PhiMarker,
  PhiType,
  // Clinical section types
  ClinicalSection,
  ClinicalSectionType,
  // Vital sign types
  VitalSign,
  VitalType,
  // Negation types
  NegationContext,
  NegationType,
  // Internal types (for advanced usage)
  ProtectedRange,
  SplitPoint,
  SplitReason,
} from './types';

// Pattern detection utilities (for advanced usage)
export {
  // Vital signs
  detectVitals,
  isWithinVitalPattern,
  getVitalProtectedRanges,
  VITAL_PATTERNS,
  // Clinical sections
  detectSections,
  getSectionAtPosition,
  getSectionBoundaries,
  isAtSectionBoundary,
  SECTION_PATTERNS,
  // PHI detection
  detectPhi,
  containsPhi,
  getPhiFreeRanges,
  BASIC_PHI_PATTERNS,
  // Negation detection
  detectNegations,
  isTermNegated,
  getNegatedTerms,
  NEGATION_PATTERNS,
} from './patterns';

// Token estimation utilities
export {
  estimateTokens,
  estimateCharsForTokens,
  exceedsTokenLimit,
  findTokenSplitPoint,
} from './tokenizer';

// Text utilities
export {
  normalizeText,
  normalizeWhitespace,
  splitSentences,
  splitParagraphs,
  countWords,
  truncate,
} from './utils';
