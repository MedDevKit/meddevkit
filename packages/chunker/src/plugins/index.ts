/**
 * Plugin System
 *
 * Exports for the MedDevKit plugin system including
 * context, manager, version utilities, and error types.
 *
 * @packageDocumentation
 */

// Version utilities
export {
  CONTEXT_VERSION,
  BRAND_VERSION,
  FEATURES_V1_0_0,
  FEATURES_BY_VERSION,
  getCurrentFeatures,
  parseVersion,
  compareVersions,
  isVersionCompatible,
  getUnavailableFeatures,
} from './version';

// Context implementation
export {
  MedDevKitContextImpl,
  createContext,
} from './MedDevKitContextImpl';

// Plugin manager
export { PluginManager } from './PluginManager';

// Error types
export {
  PluginError,
  PluginCompatibilityError,
  PluginInitializationError,
  PluginPatternDetectionError,
  PluginAlreadyRegisteredError,
  PluginNotFoundError,
  createPluginWarning,
  type PluginWarning,
} from './errors';
