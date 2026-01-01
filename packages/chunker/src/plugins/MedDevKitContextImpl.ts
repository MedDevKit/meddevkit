/**
 * MedDevKitContext Implementation
 *
 * Concrete implementation of the MedDevKitContext interface
 * that provides utilities to plugins during processing.
 *
 * @packageDocumentation
 */

import type {
  MedDevKitContext,
  ContextFeatures,
  ProtectedRange,
} from '../types';

import { estimateTokens, estimateCharsForTokens } from '../tokenizer';
import { normalizeText } from '../utils';
import {
  CONTEXT_VERSION,
  BRAND_VERSION,
  getCurrentFeatures,
} from './version';

/**
 * Implementation of MedDevKitContext
 *
 * Provides utilities for plugins including token estimation,
 * pattern matching, and protected range management.
 */
export class MedDevKitContextImpl implements MedDevKitContext {
  // ========== Versioning ==========

  public readonly brandVersion: string = BRAND_VERSION;
  public readonly contextVersion: string = CONTEXT_VERSION;
  public readonly features: ContextFeatures;

  // ========== Document Access ==========

  public readonly text: string;
  public readonly normalizedText: string;

  // ========== Internal State ==========

  private existingRanges: ProtectedRange[];
  private additionalRanges: ProtectedRange[] = [];

  /**
   * Create a new MedDevKitContext
   *
   * @param text - Original document text
   * @param existingRanges - Pre-existing protected ranges (from vitals, etc.)
   */
  constructor(text: string, existingRanges: ProtectedRange[] = []) {
    this.text = text;
    this.normalizedText = normalizeText(text) || '';
    this.existingRanges = existingRanges;
    this.features = getCurrentFeatures();
  }

  // ========== Token Utilities ==========

  /**
   * Estimate token count for a string
   */
  public estimateTokens(text: string): number {
    return estimateTokens(text);
  }

  /**
   * Estimate character count for a target token count
   */
  public estimateCharsForTokens(tokens: number): number {
    return estimateCharsForTokens(tokens);
  }

  // ========== Pattern Matching Helpers ==========

  /**
   * Execute a regex pattern and return all matches with positions
   */
  public matchPattern(
    pattern: RegExp
  ): Array<{ match: RegExpExecArray; start: number; end: number }> {
    const matches: Array<{
      match: RegExpExecArray;
      start: number;
      end: number;
    }> = [];

    // Ensure global flag is set
    const regex = new RegExp(
      pattern.source,
      pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g'
    );

    let match: RegExpExecArray | null;
    while ((match = regex.exec(this.normalizedText)) !== null) {
      matches.push({
        match,
        start: match.index,
        end: match.index + match[0].length,
      });

      // Prevent infinite loop with zero-width matches
      if (match.index === regex.lastIndex) {
        regex.lastIndex++;
      }
    }

    return matches;
  }

  // ========== Protected Ranges ==========

  /**
   * Get all currently protected ranges (existing + plugin-added)
   */
  public getProtectedRanges(): readonly ProtectedRange[] {
    return [...this.existingRanges, ...this.additionalRanges];
  }

  /**
   * Request a range to be protected from splitting
   */
  public addProtectedRange(
    start: number,
    end: number,
    _reason?: string
  ): void {
    // Note: _reason parameter reserved for future use
    this.additionalRanges.push({
      start,
      end,
      reason: 'plugin',
    });
  }

  /**
   * Get only the additional ranges added by plugins
   * (Internal use for PluginManager)
   */
  public getAdditionalRanges(): ProtectedRange[] {
    return this.additionalRanges;
  }

  /**
   * Clear additional ranges (used between processing runs)
   */
  public clearAdditionalRanges(): void {
    this.additionalRanges = [];
  }

  /**
   * Update existing ranges (used when merging with vitals, etc.)
   */
  public setExistingRanges(ranges: ProtectedRange[]): void {
    this.existingRanges = ranges;
  }

  // ========== Feature Detection ==========

  /**
   * Check if a feature is available in this context version
   */
  public hasFeature(feature: keyof ContextFeatures): boolean {
    return this.features[feature] === true;
  }
}

/**
 * Create a MedDevKitContext for a document
 *
 * @param text - Document text
 * @param existingRanges - Pre-existing protected ranges
 * @returns New MedDevKitContextImpl instance
 */
export function createContext(
  text: string,
  existingRanges: ProtectedRange[] = []
): MedDevKitContextImpl {
  return new MedDevKitContextImpl(text, existingRanges);
}
