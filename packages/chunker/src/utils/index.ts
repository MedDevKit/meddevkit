/**
 * Utility Modules
 *
 * @packageDocumentation
 */

export {
  normalizeText,
  normalizeWhitespace,
  splitSentences,
  splitParagraphs,
  countWords,
  truncate,
} from './normalize';

export {
  findBestSplitPoint,
  findSentenceBoundary,
  findParagraphBoundary,
  findWordBoundary,
  findOverlapStart,
  mergeRanges,
  isWithinRanges,
  getRangeAtPosition,
} from './boundaries';
