/**
 * Version Utilities Tests
 */

import { describe, it, expect } from 'vitest';
import {
  CONTEXT_VERSION,
  BRAND_VERSION,
  parseVersion,
  compareVersions,
  isVersionCompatible,
  getUnavailableFeatures,
  getCurrentFeatures,
} from '../../src/plugins/version';

describe('Version Utilities', () => {
  describe('Constants', () => {
    it('should have CONTEXT_VERSION as semver string', () => {
      expect(CONTEXT_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
    });

    it('should have BRAND_VERSION as marketing string', () => {
      expect(BRAND_VERSION).toContain('MedDevKit Context');
    });
  });

  describe('parseVersion', () => {
    it('should parse valid version strings', () => {
      expect(parseVersion('1.0.0')).toEqual({ major: 1, minor: 0, patch: 0 });
      expect(parseVersion('2.3.4')).toEqual({ major: 2, minor: 3, patch: 4 });
      expect(parseVersion('10.20.30')).toEqual({ major: 10, minor: 20, patch: 30 });
    });

    it('should return null for invalid version strings', () => {
      expect(parseVersion('invalid')).toBeNull();
      expect(parseVersion('1.0')).toBeNull();
      expect(parseVersion('')).toBeNull();
    });
  });

  describe('compareVersions', () => {
    it('should return 0 for equal versions', () => {
      expect(compareVersions('1.0.0', '1.0.0')).toBe(0);
      expect(compareVersions('2.3.4', '2.3.4')).toBe(0);
    });

    it('should return -1 when first version is less', () => {
      expect(compareVersions('1.0.0', '2.0.0')).toBe(-1);
      expect(compareVersions('1.0.0', '1.1.0')).toBe(-1);
      expect(compareVersions('1.0.0', '1.0.1')).toBe(-1);
    });

    it('should return 1 when first version is greater', () => {
      expect(compareVersions('2.0.0', '1.0.0')).toBe(1);
      expect(compareVersions('1.1.0', '1.0.0')).toBe(1);
      expect(compareVersions('1.0.1', '1.0.0')).toBe(1);
    });
  });

  describe('isVersionCompatible', () => {
    it('should return true when current >= required', () => {
      expect(isVersionCompatible('1.0.0', '1.0.0')).toBe(true);
      expect(isVersionCompatible('1.0.0', '2.0.0')).toBe(true);
      expect(isVersionCompatible('1.0.0', '1.1.0')).toBe(true);
    });

    it('should return false when current < required', () => {
      expect(isVersionCompatible('2.0.0', '1.0.0')).toBe(false);
      expect(isVersionCompatible('1.1.0', '1.0.0')).toBe(false);
    });
  });

  describe('getCurrentFeatures', () => {
    it('should return features for current version', () => {
      const features = getCurrentFeatures();
      expect(features.tokenEstimation).toBe(true);
      expect(features.patternMatching).toBe(true);
      expect(features.protectedRanges).toBe(true);
      expect(features.textAccess).toBe(true);
    });
  });

  describe('getUnavailableFeatures', () => {
    it('should return empty array for compatible versions', () => {
      const unavailable = getUnavailableFeatures('1.0.0', '1.0.0');
      expect(unavailable).toEqual([]);
    });
  });
});
