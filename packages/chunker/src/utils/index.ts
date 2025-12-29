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
  mergeRanges,
  isWithinRanges,
  getRangeAtPosition,
} from './boundaries';
