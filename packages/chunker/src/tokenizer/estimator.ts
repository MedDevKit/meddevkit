/**
 * Token Estimation
 *
 * Estimates token counts for text without requiring a full tokenizer.
 * Uses approximations based on common tokenizer behavior.
 *
 * @packageDocumentation
 */

// ============================================================================
// Token Estimation
// ============================================================================

/**
 * Average characters per token
 * This is an approximation based on GPT tokenizer analysis
 * Real tokenizers vary: GPT-3/4 ~4 chars, Claude ~3.5 chars
 */
const CHARS_PER_TOKEN = 4;

/**
 * Estimate token count for text
 *
 * @param text - Text to estimate tokens for
 * @returns Estimated token count
 *
 * @example
 * ```typescript
 * const tokens = estimateTokens('Patient presents with chest pain');
 * // Returns ~8 tokens
 * ```
 *
 * @remarks
 * This is an approximation. For exact counts, use a proper tokenizer
 * like tiktoken for OpenAI models or claude-tokenizer for Claude.
 */
export function estimateTokens(text: string): number {
  if (!text || text.length === 0) return 0;

  // Base estimation: chars / avg chars per token
  const baseEstimate = text.length / CHARS_PER_TOKEN;

  // Adjust for whitespace (words)
  const words = text.split(/\s+/).filter(Boolean);
  const wordEstimate = words.length;

  // Adjust for punctuation and special characters
  const punctuationCount = (text.match(/[.,!?;:'"()\[\]{}]/g) || []).length;

  // Adjust for numbers (often tokenized individually)
  const numberMatches = text.match(/\d+/g) || [];
  const numberAdjustment = numberMatches.reduce((acc, num) => {
    // Each number sequence might be 1-3 tokens depending on length
    return acc + Math.ceil(num.length / 3);
  }, 0);

  // Medical abbreviations are often single tokens
  const medicalAbbrs = (text.match(/\b[A-Z]{2,5}\b/g) || []).length;

  // Weighted average of estimates
  const estimate =
    baseEstimate * 0.5 +
    wordEstimate * 0.3 +
    punctuationCount * 0.5 +
    numberAdjustment * 0.1 -
    medicalAbbrs * 0.2; // Abbreviations compress tokens

  return Math.max(1, Math.round(estimate));
}

/**
 * Estimate characters needed for a target token count
 *
 * @param tokens - Target token count
 * @returns Estimated character count
 */
export function estimateCharsForTokens(tokens: number): number {
  return tokens * CHARS_PER_TOKEN;
}

/**
 * Check if text exceeds a token limit
 *
 * @param text - Text to check
 * @param maxTokens - Maximum allowed tokens
 * @returns True if text likely exceeds the limit
 */
export function exceedsTokenLimit(text: string, maxTokens: number): boolean {
  return estimateTokens(text) > maxTokens;
}

/**
 * Split text to fit within token limit
 * Finds a split point that keeps the first part under the limit
 *
 * @param text - Text to potentially split
 * @param maxTokens - Maximum tokens for first part
 * @returns Position to split at, or -1 if no split needed
 */
export function findTokenSplitPoint(text: string, maxTokens: number): number {
  const totalTokens = estimateTokens(text);

  if (totalTokens <= maxTokens) {
    return -1; // No split needed
  }

  // Estimate character position for split
  const targetChars = estimateCharsForTokens(maxTokens);

  // Find a good split point near the target
  // Prefer sentence boundaries, then word boundaries
  let splitPoint = targetChars;

  // Look backward for sentence boundary
  const sentenceEnd = text.lastIndexOf('.', targetChars);
  if (sentenceEnd > targetChars * 0.7) {
    splitPoint = sentenceEnd + 1;
  } else {
    // Look for word boundary
    const wordEnd = text.lastIndexOf(' ', targetChars);
    if (wordEnd > targetChars * 0.8) {
      splitPoint = wordEnd;
    }
  }

  return splitPoint;
}

// ============================================================================
// Exports
// ============================================================================

export { CHARS_PER_TOKEN };
