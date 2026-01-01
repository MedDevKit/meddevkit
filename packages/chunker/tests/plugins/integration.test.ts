/**
 * Plugin Integration Tests
 *
 * Tests the full plugin system with MedicalChunker
 */

import { describe, it, expect, vi } from 'vitest';
import { MedicalChunker } from '../../src/MedicalChunker';
import { CONTEXT_VERSION } from '../../src/plugins';
import type { PatternPlugin, PatternMatch, MedDevKitContext } from '../../src/types';

// Sample medication plugin for testing
const medicationPlugin: PatternPlugin = {
  id: '@test/medication-plugin',
  name: 'Medication Pattern Plugin',
  version: '1.0.0',
  minContextVersion: '1.0.0',

  detectPatterns(text: string, ctx: MedDevKitContext): PatternMatch[] {
    const matches: PatternMatch[] = [];
    const regex = /\b(\w+)\s+(\d+)\s*(mg|mcg|ml)\b/gi;
    let match;

    while ((match = regex.exec(text)) !== null) {
      matches.push({
        patternId: 'medication-dose',
        patternName: 'Medication Dosage',
        pluginId: '@test/medication-plugin',
        startOffset: match.index,
        endOffset: match.index + match[0].length,
        raw: match[0],
        confidence: 0.9,
        isProtected: true,
        category: 'medication',
        data: {
          medication: match[1],
          dose: parseInt(match[2]),
          unit: match[3],
        },
      });
    }

    return matches;
  },
};

describe('Plugin Integration', () => {
  describe('Basic Plugin Usage', () => {
    it('should chunk with plugin', () => {
      const chunker = new MedicalChunker({
        plugins: [medicationPlugin],
        maxTokens: 100,
      });

      const result = chunker.chunk('Patient taking aspirin 81 mg daily.');

      expect(result.metadata.pluginsApplied).toContain('@test/medication-plugin');
      expect(result.metadata.contextVersion).toBe(CONTEXT_VERSION);
    });

    it('should detect plugin patterns', () => {
      const chunker = new MedicalChunker({
        plugins: [medicationPlugin],
      });

      const result = chunker.chunk('Patient taking aspirin 81 mg daily.');

      expect(result.metadata.pluginPatternsDetected).toBeGreaterThan(0);
    });

    it('should attach patterns to chunks', () => {
      const chunker = new MedicalChunker({
        plugins: [medicationPlugin],
        includePluginPatterns: true,
      });

      const result = chunker.chunk('Patient taking aspirin 81 mg daily.');

      const chunk = result.chunks[0];
      expect(chunk.metadata.pluginPatterns).toBeDefined();
      expect(chunk.metadata.pluginPatterns?.['@test/medication-plugin']).toBeDefined();
    });

    it('should include pattern data', () => {
      const chunker = new MedicalChunker({
        plugins: [medicationPlugin],
      });

      const result = chunker.chunk('Patient taking aspirin 81 mg daily.');
      const patterns = result.chunks[0].metadata.pluginPatterns?.['@test/medication-plugin'];

      expect(patterns?.[0].data?.medication).toBe('aspirin');
      expect(patterns?.[0].data?.dose).toBe(81);
      expect(patterns?.[0].data?.unit).toBe('mg');
    });
  });

  describe('Protected Ranges', () => {
    it('should protect patterns marked as protected', () => {
      const chunker = new MedicalChunker({
        plugins: [medicationPlugin],
        maxTokens: 50,
        minTokens: 10,
        overlapTokens: 10,
      });

      // The medication "aspirin 81 mg" should not be split
      const text = 'Patient is currently taking aspirin 81 mg for cardiac protection.';
      const result = chunker.chunk(text);

      // Check that the medication pattern wasn't split across chunks
      const allText = result.chunks.map((c) => c.text).join(' ');
      expect(allText).toContain('aspirin 81 mg');
    });
  });

  describe('Lifecycle Hooks', () => {
    it('should call onDocumentStart', () => {
      const onDocumentStart = vi.fn();
      const plugin: PatternPlugin = {
        id: 'test-lifecycle',
        name: 'Lifecycle Test',
        version: '1.0.0',
        minContextVersion: '1.0.0',
        onDocumentStart,
      };

      const chunker = new MedicalChunker({ plugins: [plugin] });
      chunker.chunk('test document');

      expect(onDocumentStart).toHaveBeenCalled();
    });

    it('should call onChunkCreated for each chunk', () => {
      const onChunkCreated = vi.fn().mockImplementation((chunk) => chunk);
      const plugin: PatternPlugin = {
        id: 'test-lifecycle',
        name: 'Lifecycle Test',
        version: '1.0.0',
        minContextVersion: '1.0.0',
        onChunkCreated,
      };

      const chunker = new MedicalChunker({
        plugins: [plugin],
        maxTokens: 100,
        minTokens: 10,
        overlapTokens: 10,
      });

      // Create text that will result in multiple chunks
      const text = 'First sentence here. Second sentence here. Third sentence here.';
      const result = chunker.chunk(text);

      expect(onChunkCreated).toHaveBeenCalledTimes(result.chunks.length);
    });

    it('should call onDocumentEnd', () => {
      const onDocumentEnd = vi.fn();
      const plugin: PatternPlugin = {
        id: 'test-lifecycle',
        name: 'Lifecycle Test',
        version: '1.0.0',
        minContextVersion: '1.0.0',
        onDocumentEnd,
      };

      const chunker = new MedicalChunker({ plugins: [plugin] });
      chunker.chunk('test document');

      expect(onDocumentEnd).toHaveBeenCalled();
    });
  });

  describe('Multiple Plugins', () => {
    it('should work with multiple plugins', () => {
      const plugin1: PatternPlugin = {
        id: 'plugin-1',
        name: 'Plugin 1',
        version: '1.0.0',
        minContextVersion: '1.0.0',
        detectPatterns: () => [
          {
            patternId: 'p1',
            patternName: 'Pattern 1',
            pluginId: 'plugin-1',
            startOffset: 0,
            endOffset: 5,
            raw: 'hello',
            confidence: 0.9,
            isProtected: false,
          },
        ],
      };

      const plugin2: PatternPlugin = {
        id: 'plugin-2',
        name: 'Plugin 2',
        version: '1.0.0',
        minContextVersion: '1.0.0',
        detectPatterns: () => [
          {
            patternId: 'p2',
            patternName: 'Pattern 2',
            pluginId: 'plugin-2',
            startOffset: 6,
            endOffset: 11,
            raw: 'world',
            confidence: 0.8,
            isProtected: false,
          },
        ],
      };

      const chunker = new MedicalChunker({ plugins: [plugin1, plugin2] });
      const result = chunker.chunk('hello world');

      expect(result.metadata.pluginsApplied).toContain('plugin-1');
      expect(result.metadata.pluginsApplied).toContain('plugin-2');
      expect(result.metadata.pluginPatternsDetected).toBe(2);
    });
  });

  describe('Without Plugins', () => {
    it('should work normally without plugins', () => {
      const chunker = new MedicalChunker();
      const result = chunker.chunk('Hello world');

      expect(result.chunks.length).toBe(1);
      expect(result.metadata.pluginsApplied).toBeUndefined();
      expect(result.metadata.contextVersion).toBeUndefined();
    });
  });

  describe('Pattern Modification via onPatternsCollected', () => {
    it('should allow plugins to modify patterns', () => {
      const plugin: PatternPlugin = {
        id: 'modifier-plugin',
        name: 'Pattern Modifier',
        version: '1.0.0',
        minContextVersion: '1.0.0',
        detectPatterns: () => [
          {
            patternId: 'original',
            patternName: 'Original Pattern',
            pluginId: 'modifier-plugin',
            startOffset: 0,
            endOffset: 5,
            raw: 'hello',
            confidence: 0.5,
            isProtected: false,
          },
        ],
        onPatternsCollected: (patterns) => {
          // Boost confidence of all patterns
          return patterns.map((p) => ({ ...p, confidence: 1.0 }));
        },
      };

      const chunker = new MedicalChunker({ plugins: [plugin] });
      const result = chunker.chunk('hello world');

      const patterns = result.chunks[0].metadata.allPatternMatches;
      expect(patterns?.[0].confidence).toBe(1.0);
    });
  });
});
