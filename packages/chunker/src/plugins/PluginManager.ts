/**
 * Plugin Manager
 *
 * Handles plugin registration, lifecycle orchestration,
 * pattern collection, and compatibility checking.
 *
 * @packageDocumentation
 */

import type {
  PatternPlugin,
  PatternMatch,
  ProtectedRange,
  MedicalChunk,
  ChunkingResult,
  PluginRegistration,
} from '../types';

import { MedDevKitContextImpl } from './MedDevKitContextImpl';
import {
  CONTEXT_VERSION,
  isVersionCompatible,
  getUnavailableFeatures,
} from './version';
import {
  PluginCompatibilityError,
  PluginInitializationError,
  PluginAlreadyRegisteredError,
  createPluginWarning,
  type PluginWarning,
} from './errors';

/**
 * Plugin Manager
 *
 * Manages the lifecycle of plugins including registration,
 * initialization, pattern collection, and cleanup.
 */
export class PluginManager {
  private plugins: Map<string, PatternPlugin> = new Map();
  private warnings: PluginWarning[] = [];
  private initialized: Set<string> = new Set();
  private strictMode: boolean;

  /**
   * Create a new PluginManager
   *
   * @param strictMode - If true, throws on version incompatibility instead of warning
   */
  constructor(strictMode: boolean = false) {
    this.strictMode = strictMode;
  }

  // ========== Registration ==========

  /**
   * Register a plugin with compatibility checking
   *
   * @param plugin - Plugin to register
   * @returns Registration result
   * @throws PluginCompatibilityError if strictMode and version incompatible
   * @throws PluginAlreadyRegisteredError if plugin ID already registered
   */
  public register(plugin: PatternPlugin): PluginRegistration {
    // Check for duplicate registration
    if (this.plugins.has(plugin.id)) {
      throw new PluginAlreadyRegisteredError(plugin.id);
    }

    // Check version compatibility
    const isCompatible = isVersionCompatible(plugin.minContextVersion);
    const unavailableFeatures = getUnavailableFeatures(
      plugin.minContextVersion,
      CONTEXT_VERSION
    );

    if (!isCompatible && this.strictMode) {
      throw new PluginCompatibilityError(
        plugin.id,
        plugin.minContextVersion,
        CONTEXT_VERSION,
        unavailableFeatures
      );
    }

    // Register the plugin
    this.plugins.set(plugin.id, plugin);

    // Generate warning if version mismatch
    let compatibilityWarning: string | undefined;
    if (!isCompatible) {
      compatibilityWarning =
        `Plugin ${plugin.id} requires MedDevKit Context v${plugin.minContextVersion}, ` +
        `running on v${CONTEXT_VERSION}. Some features may be unavailable.`;

      this.warnings.push(
        createPluginWarning(
          plugin.id,
          compatibilityWarning,
          'VERSION_MISMATCH'
        )
      );
    }

    return {
      id: plugin.id,
      success: true,
      compatibilityWarning,
      unavailableFeatures:
        unavailableFeatures.length > 0 ? unavailableFeatures : undefined,
    };
  }

  /**
   * Unregister a plugin
   *
   * @param pluginId - ID of plugin to remove
   */
  public unregister(pluginId: string): void {
    const plugin = this.plugins.get(pluginId);
    if (plugin) {
      // Call cleanup hook if available
      try {
        plugin.onUnload?.();
      } catch {
        // Ignore cleanup errors
      }
      this.plugins.delete(pluginId);
      this.initialized.delete(pluginId);
    }
  }

  // ========== Lifecycle: onRegister ==========

  /**
   * Initialize all registered plugins
   *
   * @param ctx - MedDevKitContext for initialization
   */
  public async initializeAll(ctx: MedDevKitContextImpl): Promise<void> {
    for (const [id, plugin] of this.plugins) {
      if (!this.initialized.has(id) && plugin.onRegister) {
        try {
          await plugin.onRegister(ctx);
          this.initialized.add(id);
        } catch (error) {
          throw new PluginInitializationError(id, 'onRegister', error);
        }
      }
    }
  }

  // ========== Lifecycle: onDocumentStart ==========

  /**
   * Notify plugins that document processing is starting
   *
   * @param document - Document being processed
   * @param ctx - MedDevKitContext
   */
  public onDocumentStart(
    document: { text: string },
    ctx: MedDevKitContextImpl
  ): void {
    for (const plugin of this.plugins.values()) {
      try {
        plugin.onDocumentStart?.(document, ctx);
      } catch (error) {
        this.warnings.push(
          createPluginWarning(
            plugin.id,
            `onDocumentStart failed: ${error instanceof Error ? error.message : String(error)}`,
            'LIFECYCLE_ERROR'
          )
        );
      }
    }
  }

  // ========== Pattern Collection ==========

  /**
   * Collect patterns from all plugins
   *
   * @param text - Text to analyze
   * @param ctx - MedDevKitContext
   * @returns Map of plugin ID to pattern matches
   */
  public collectPatterns(
    text: string,
    ctx: MedDevKitContextImpl
  ): Map<string, PatternMatch[]> {
    const results = new Map<string, PatternMatch[]>();

    for (const [id, plugin] of this.plugins) {
      if (!plugin.detectPatterns) {
        continue;
      }

      try {
        const matches = plugin.detectPatterns(text, ctx);
        results.set(id, matches);
      } catch (error) {
        this.warnings.push(
          createPluginWarning(
            id,
            `Pattern detection failed: ${error instanceof Error ? error.message : String(error)}`,
            'DETECTION_ERROR'
          )
        );
        results.set(id, []);
      }
    }

    return results;
  }

  /**
   * Collect protected ranges from all plugins
   *
   * @param text - Text to analyze
   * @param ctx - MedDevKitContext
   * @returns Array of protected ranges
   */
  public collectProtectedRanges(
    text: string,
    ctx: MedDevKitContextImpl
  ): ProtectedRange[] {
    const ranges: ProtectedRange[] = [];

    for (const [id, plugin] of this.plugins) {
      if (!plugin.getProtectedRanges) {
        continue;
      }

      try {
        const pluginRanges = plugin.getProtectedRanges(text, ctx);
        ranges.push(...pluginRanges);
      } catch (error) {
        this.warnings.push(
          createPluginWarning(
            id,
            `getProtectedRanges failed: ${error instanceof Error ? error.message : String(error)}`,
            'PROTECTED_RANGES_ERROR'
          )
        );
      }
    }

    return ranges;
  }

  // ========== Lifecycle: onPatternsCollected ==========

  /**
   * Allow plugins to modify collected patterns
   *
   * @param patterns - All collected patterns
   * @param ctx - MedDevKitContext
   * @returns Modified patterns
   */
  public onPatternsCollected(
    patterns: PatternMatch[],
    ctx: MedDevKitContextImpl
  ): PatternMatch[] {
    let result = patterns;

    for (const plugin of this.plugins.values()) {
      if (!plugin.onPatternsCollected) {
        continue;
      }

      try {
        result = plugin.onPatternsCollected(result, ctx);
      } catch (error) {
        this.warnings.push(
          createPluginWarning(
            plugin.id,
            `onPatternsCollected failed: ${error instanceof Error ? error.message : String(error)}`,
            'LIFECYCLE_ERROR'
          )
        );
      }
    }

    return result;
  }

  // ========== Lifecycle: onChunkCreated ==========

  /**
   * Allow plugins to modify a created chunk
   *
   * @param chunk - Chunk that was created
   * @param ctx - MedDevKitContext
   * @returns Modified chunk
   */
  public onChunkCreated(
    chunk: MedicalChunk,
    ctx: MedDevKitContextImpl
  ): MedicalChunk {
    let result = chunk;

    for (const plugin of this.plugins.values()) {
      if (!plugin.onChunkCreated) {
        continue;
      }

      try {
        result = plugin.onChunkCreated(result, ctx);
      } catch (error) {
        this.warnings.push(
          createPluginWarning(
            plugin.id,
            `onChunkCreated failed: ${error instanceof Error ? error.message : String(error)}`,
            'LIFECYCLE_ERROR'
          )
        );
      }
    }

    return result;
  }

  // ========== Lifecycle: onDocumentEnd ==========

  /**
   * Notify plugins that document processing is complete
   *
   * @param result - Final chunking result
   * @param ctx - MedDevKitContext
   */
  public onDocumentEnd(
    result: ChunkingResult,
    ctx: MedDevKitContextImpl
  ): void {
    for (const plugin of this.plugins.values()) {
      try {
        plugin.onDocumentEnd?.(result, ctx);
      } catch (error) {
        this.warnings.push(
          createPluginWarning(
            plugin.id,
            `onDocumentEnd failed: ${error instanceof Error ? error.message : String(error)}`,
            'LIFECYCLE_ERROR'
          )
        );
      }
    }
  }

  // ========== Lifecycle: onUnload ==========

  /**
   * Unload all plugins (cleanup)
   */
  public unloadAll(): void {
    for (const plugin of this.plugins.values()) {
      try {
        plugin.onUnload?.();
      } catch {
        // Ignore cleanup errors
      }
    }
    this.plugins.clear();
    this.initialized.clear();
  }

  // ========== Utilities ==========

  /**
   * Get all registered plugin IDs
   */
  public getPluginIds(): string[] {
    return Array.from(this.plugins.keys());
  }

  /**
   * Get all warnings generated during processing
   */
  public getWarnings(): PluginWarning[] {
    return [...this.warnings];
  }

  /**
   * Get warnings as simple objects for output
   */
  public getWarningsForOutput(): Array<{ pluginId: string; message: string }> {
    return this.warnings.map((w) => ({
      pluginId: w.pluginId,
      message: w.message,
    }));
  }

  /**
   * Clear all warnings
   */
  public clearWarnings(): void {
    this.warnings = [];
  }

  /**
   * Check if a plugin is registered
   */
  public hasPlugin(pluginId: string): boolean {
    return this.plugins.has(pluginId);
  }

  /**
   * Get the number of registered plugins
   */
  public get size(): number {
    return this.plugins.size;
  }

  /**
   * Count total pattern matches from a collection
   */
  public static countPatterns(
    patterns: Map<string, PatternMatch[]>
  ): number {
    let count = 0;
    for (const matches of patterns.values()) {
      count += matches.length;
    }
    return count;
  }

  /**
   * Flatten pattern matches into sorted array
   */
  public static flattenPatterns(
    patterns: Map<string, PatternMatch[]>
  ): PatternMatch[] {
    const all: PatternMatch[] = [];
    for (const matches of patterns.values()) {
      all.push(...matches);
    }
    return all.sort((a, b) => a.startOffset - b.startOffset);
  }

  /**
   * Convert pattern map to record for output
   */
  public static patternsToRecord(
    patterns: Map<string, PatternMatch[]>
  ): Record<string, PatternMatch[]> {
    const record: Record<string, PatternMatch[]> = {};
    for (const [id, matches] of patterns) {
      if (matches.length > 0) {
        record[id] = matches;
      }
    }
    return record;
  }
}
