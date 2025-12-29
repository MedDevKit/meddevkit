/**
 * Text Normalization Utilities
 *
 * @packageDocumentation
 */

// ============================================================================
// Text Normalization
// ============================================================================

/**
 * Normalize clinical text for processing
 *
 * @param text - Raw clinical text
 * @returns Normalized text
 */
export function normalizeText(text: string): string {
  if (!text) return '';

  return text
    // Normalize line endings
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    // Normalize multiple spaces (preserve newlines)
    .replace(/[^\S\n]+/g, ' ')
    // Normalize multiple newlines to max 2
    .replace(/\n{3,}/g, '\n\n')
    // Trim lines
    .split('\n')
    .map((line) => line.trim())
    .join('\n')
    // Trim overall
    .trim();
}

/**
 * Normalize whitespace only (lighter normalization)
 *
 * @param text - Text to normalize
 * @returns Text with normalized whitespace
 */
export function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * Split text into sentences
 * Medical text often has abbreviations with periods, so we're careful
 *
 * @param text - Text to split
 * @returns Array of sentences
 */
export function splitSentences(text: string): string[] {
  // Common medical abbreviations that end with periods
  const medicalAbbreviations = [
    'Dr.',
    'Mr.',
    'Mrs.',
    'Ms.',
    'pt.',
    'Pt.',
    'vs.',
    'e.g.',
    'i.e.',
    'etc.',
    'approx.',
    'avg.',
    'min.',
    'max.',
    'no.',
    'No.',
    'vol.',
    'wt.',
    'ht.',
    'temp.',
    'q.d.',
    'b.i.d.',
    't.i.d.',
    'q.i.d.',
    'p.r.n.',
    'h.s.',
    'a.c.',
    'p.c.',
    'q.h.',
    'q.4h.',
    'q.6h.',
    'q.8h.',
    'q.12h.',
    'stat.',
    'p.o.',
    'I.M.',
    'I.V.',
    'S.C.',
    'S.L.',
  ];

  // Replace abbreviations with placeholders
  let processed = text;
  const placeholders: string[] = [];

  for (const abbr of medicalAbbreviations) {
    const regex = new RegExp(abbr.replace('.', '\\.'), 'g');
    const placeholder = `__ABBR${placeholders.length}__`;
    if (processed.includes(abbr)) {
      processed = processed.replace(regex, placeholder);
      placeholders.push(abbr);
    }
  }

  // Split on sentence-ending punctuation
  const sentences = processed.split(/(?<=[.!?])\s+/);

  // Restore abbreviations
  return sentences.map((sentence) => {
    let restored = sentence;
    placeholders.forEach((abbr, i) => {
      restored = restored.replace(`__ABBR${i}__`, abbr);
    });
    return restored.trim();
  }).filter(Boolean);
}

/**
 * Split text into paragraphs
 *
 * @param text - Text to split
 * @returns Array of paragraphs
 */
export function splitParagraphs(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
}

/**
 * Count words in text
 *
 * @param text - Text to count words in
 * @returns Word count
 */
export function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

/**
 * Truncate text to a maximum length, preserving word boundaries
 *
 * @param text - Text to truncate
 * @param maxLength - Maximum character length
 * @param suffix - Suffix to add if truncated (default: '...')
 * @returns Truncated text
 */
export function truncate(
  text: string,
  maxLength: number,
  suffix: string = '...'
): string {
  if (text.length <= maxLength) return text;

  const truncateAt = maxLength - suffix.length;
  const lastSpace = text.lastIndexOf(' ', truncateAt);

  if (lastSpace > truncateAt * 0.8) {
    return text.slice(0, lastSpace) + suffix;
  }

  return text.slice(0, truncateAt) + suffix;
}
