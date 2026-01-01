/**
 * MedDevKitContext Tests
 */

import { describe, it, expect } from 'vitest';
import {
  MedDevKitContextImpl,
  createContext,
  CONTEXT_VERSION,
  BRAND_VERSION,
} from '../../src/plugins';

describe('MedDevKitContext', () => {
  describe('Construction', () => {
    it('should create context with text', () => {
      const ctx = new MedDevKitContextImpl('Hello world');
      expect(ctx.text).toBe('Hello world');
      expect(ctx.normalizedText).toBe('Hello world');
    });

    it('should have correct version info', () => {
      const ctx = createContext('test');
      expect(ctx.brandVersion).toBe(BRAND_VERSION);
      expect(ctx.contextVersion).toBe(CONTEXT_VERSION);
    });

    it('should have features object', () => {
      const ctx = createContext('test');
      expect(ctx.features.tokenEstimation).toBe(true);
      expect(ctx.features.patternMatching).toBe(true);
    });
  });

  describe('Token Utilities', () => {
    it('should estimate tokens for text', () => {
      const ctx = createContext('This is a test sentence.');
      const tokens = ctx.estimateTokens('This is a test sentence.');
      expect(tokens).toBeGreaterThan(0);
    });

    it('should estimate chars for tokens', () => {
      const ctx = createContext('test');
      const chars = ctx.estimateCharsForTokens(100);
      expect(chars).toBeGreaterThan(0);
    });
  });

  describe('Pattern Matching', () => {
    it('should match patterns in text', () => {
      const ctx = createContext('BP: 120/80 mmHg, HR: 72 bpm');
      const matches = ctx.matchPattern(/\d+/g);
      expect(matches.length).toBe(3); // 120, 80, 72
    });

    it('should return match with positions', () => {
      const ctx = createContext('Hello world');
      const matches = ctx.matchPattern(/world/);
      expect(matches.length).toBe(1);
      expect(matches[0].start).toBe(6);
      expect(matches[0].end).toBe(11);
    });
  });

  describe('Protected Ranges', () => {
    it('should start with empty additional ranges', () => {
      const ctx = createContext('test');
      expect(ctx.getAdditionalRanges()).toEqual([]);
    });

    it('should add protected ranges', () => {
      const ctx = createContext('test text here');
      ctx.addProtectedRange(0, 4);
      ctx.addProtectedRange(5, 9);

      const ranges = ctx.getAdditionalRanges();
      expect(ranges.length).toBe(2);
      expect(ranges[0]).toEqual({ start: 0, end: 4, reason: 'plugin' });
    });

    it('should include existing ranges in getProtectedRanges', () => {
      const existingRanges = [{ start: 0, end: 5, reason: 'vital' as const }];
      const ctx = new MedDevKitContextImpl('test text', existingRanges);
      ctx.addProtectedRange(10, 15);

      const allRanges = ctx.getProtectedRanges();
      expect(allRanges.length).toBe(2);
    });

    it('should clear additional ranges', () => {
      const ctx = createContext('test');
      ctx.addProtectedRange(0, 4);
      ctx.clearAdditionalRanges();
      expect(ctx.getAdditionalRanges()).toEqual([]);
    });
  });

  describe('Feature Detection', () => {
    it('should detect available features', () => {
      const ctx = createContext('test');
      expect(ctx.hasFeature('tokenEstimation')).toBe(true);
      expect(ctx.hasFeature('patternMatching')).toBe(true);
    });

    it('should detect unavailable features', () => {
      const ctx = createContext('test');
      expect(ctx.hasFeature('asyncPatternDetection')).toBe(false);
      expect(ctx.hasFeature('pluginCommunication')).toBe(false);
    });
  });
});
