/**
 * PluginManager Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  PluginManager,
  MedDevKitContextImpl,
  PluginAlreadyRegisteredError,
  PluginCompatibilityError,
  CONTEXT_VERSION,
} from '../../src/plugins';
import type { PatternPlugin, PatternMatch } from '../../src/types';

// Sample plugin for testing
const createTestPlugin = (overrides: Partial<PatternPlugin> = {}): PatternPlugin => ({
  id: 'test-plugin',
  name: 'Test Plugin',
  version: '1.0.0',
  minContextVersion: '1.0.0',
  ...overrides,
});

describe('PluginManager', () => {
  let manager: PluginManager;

  beforeEach(() => {
    manager = new PluginManager();
  });

  describe('Registration', () => {
    it('should register a plugin successfully', () => {
      const plugin = createTestPlugin();
      const result = manager.register(plugin);

      expect(result.id).toBe('test-plugin');
      expect(result.success).toBe(true);
      expect(manager.hasPlugin('test-plugin')).toBe(true);
    });

    it('should throw on duplicate registration', () => {
      const plugin = createTestPlugin();
      manager.register(plugin);

      expect(() => manager.register(plugin)).toThrow(PluginAlreadyRegisteredError);
    });

    it('should warn on version mismatch (non-strict mode)', () => {
      const plugin = createTestPlugin({ minContextVersion: '99.0.0' });
      const result = manager.register(plugin);

      expect(result.success).toBe(true);
      expect(result.compatibilityWarning).toBeDefined();
    });

    it('should throw on version mismatch (strict mode)', () => {
      const strictManager = new PluginManager(true);
      const plugin = createTestPlugin({ minContextVersion: '99.0.0' });

      expect(() => strictManager.register(plugin)).toThrow(PluginCompatibilityError);
    });
  });

  describe('Unregistration', () => {
    it('should unregister a plugin', () => {
      const plugin = createTestPlugin();
      manager.register(plugin);
      manager.unregister('test-plugin');

      expect(manager.hasPlugin('test-plugin')).toBe(false);
    });

    it('should call onUnload when unregistering', () => {
      const onUnload = vi.fn();
      const plugin = createTestPlugin({ onUnload });
      manager.register(plugin);
      manager.unregister('test-plugin');

      expect(onUnload).toHaveBeenCalled();
    });
  });

  describe('Pattern Collection', () => {
    it('should collect patterns from plugins', () => {
      const detectPatterns = vi.fn().mockReturnValue([
        {
          patternId: 'test-pattern',
          patternName: 'Test Pattern',
          pluginId: 'test-plugin',
          startOffset: 0,
          endOffset: 5,
          raw: 'hello',
          confidence: 0.9,
          isProtected: false,
        },
      ] as PatternMatch[]);

      const plugin = createTestPlugin({ detectPatterns });
      manager.register(plugin);

      const ctx = new MedDevKitContextImpl('hello world');
      const patterns = manager.collectPatterns('hello world', ctx);

      expect(detectPatterns).toHaveBeenCalled();
      expect(patterns.get('test-plugin')?.length).toBe(1);
    });

    it('should handle plugin errors gracefully', () => {
      const detectPatterns = vi.fn().mockImplementation(() => {
        throw new Error('Plugin error');
      });

      const plugin = createTestPlugin({ detectPatterns });
      manager.register(plugin);

      const ctx = new MedDevKitContextImpl('hello world');
      const patterns = manager.collectPatterns('hello world', ctx);

      expect(patterns.get('test-plugin')).toEqual([]);
      expect(manager.getWarnings().length).toBeGreaterThan(0);
    });
  });

  describe('Protected Ranges', () => {
    it('should collect protected ranges from plugins', () => {
      const getProtectedRanges = vi.fn().mockReturnValue([
        { start: 0, end: 5, reason: 'plugin' as const },
      ]);

      const plugin = createTestPlugin({ getProtectedRanges });
      manager.register(plugin);

      const ctx = new MedDevKitContextImpl('hello world');
      const ranges = manager.collectProtectedRanges('hello world', ctx);

      expect(ranges.length).toBe(1);
    });
  });

  describe('Lifecycle Hooks', () => {
    it('should call onDocumentStart', () => {
      const onDocumentStart = vi.fn();
      const plugin = createTestPlugin({ onDocumentStart });
      manager.register(plugin);

      const ctx = new MedDevKitContextImpl('test');
      manager.onDocumentStart({ text: 'test' }, ctx);

      expect(onDocumentStart).toHaveBeenCalled();
    });

    it('should call onChunkCreated and allow modification', () => {
      const onChunkCreated = vi.fn().mockImplementation((chunk) => ({
        ...chunk,
        metadata: { ...chunk.metadata, customField: 'test' },
      }));

      const plugin = createTestPlugin({ onChunkCreated });
      manager.register(plugin);

      const ctx = new MedDevKitContextImpl('test');
      const chunk = {
        text: 'test',
        id: 'chunk_0',
        index: 0,
        hasPhi: false,
        phiMarkers: [],
        boundaries: { start: 0, end: 4, splitReason: 'end_of_text' as const },
        metadata: { tokenCount: 1, charCount: 4, wordCount: 1 },
      };

      const result = manager.onChunkCreated(chunk, ctx);

      expect(onChunkCreated).toHaveBeenCalled();
      expect((result.metadata as Record<string, unknown>).customField).toBe('test');
    });

    it('should call onDocumentEnd', () => {
      const onDocumentEnd = vi.fn();
      const plugin = createTestPlugin({ onDocumentEnd });
      manager.register(plugin);

      const ctx = new MedDevKitContextImpl('test');
      const result = { chunks: [], metadata: {} as never };
      manager.onDocumentEnd(result, ctx);

      expect(onDocumentEnd).toHaveBeenCalled();
    });
  });

  describe('Utilities', () => {
    it('should get plugin IDs', () => {
      manager.register(createTestPlugin({ id: 'plugin-1' }));
      manager.register(createTestPlugin({ id: 'plugin-2' }));

      const ids = manager.getPluginIds();
      expect(ids).toContain('plugin-1');
      expect(ids).toContain('plugin-2');
    });

    it('should count patterns', () => {
      const patterns = new Map([
        ['plugin-1', [{ patternId: 'a' }, { patternId: 'b' }] as PatternMatch[]],
        ['plugin-2', [{ patternId: 'c' }] as PatternMatch[]],
      ]);

      expect(PluginManager.countPatterns(patterns)).toBe(3);
    });

    it('should flatten patterns', () => {
      const patterns = new Map([
        ['plugin-1', [{ startOffset: 10 }, { startOffset: 5 }] as PatternMatch[]],
        ['plugin-2', [{ startOffset: 0 }] as PatternMatch[]],
      ]);

      const flat = PluginManager.flattenPatterns(patterns);
      expect(flat.length).toBe(3);
      expect(flat[0].startOffset).toBe(0); // Sorted by position
    });
  });
});
