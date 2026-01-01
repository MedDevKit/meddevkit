/**
 * Plugin System Error Classes
 *
 * Custom error types for plugin-related failures including
 * compatibility issues, initialization failures, and runtime errors.
 *
 * @packageDocumentation
 */

/**
 * Base error class for all plugin-related errors
 */
export class PluginError extends Error {
  /**
   * The plugin ID that caused the error
   */
  public readonly pluginId: string;

  /**
   * Error code for programmatic handling
   */
  public readonly code: string;

  constructor(pluginId: string, message: string, code: string = 'PLUGIN_ERROR') {
    super(`[${pluginId}] ${message}`);
    this.name = 'PluginError';
    this.pluginId = pluginId;
    this.code = code;

    // Maintains proper stack trace for where error was thrown
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, PluginError);
    }
  }
}

/**
 * Error thrown when a plugin requires a newer context version
 * than what is currently available
 */
export class PluginCompatibilityError extends PluginError {
  /**
   * The minimum version required by the plugin
   */
  public readonly requiredVersion: string;

  /**
   * The current context version
   */
  public readonly currentVersion: string;

  /**
   * Features that are unavailable due to version mismatch
   */
  public readonly unavailableFeatures: string[];

  constructor(
    pluginId: string,
    requiredVersion: string,
    currentVersion: string,
    unavailableFeatures: string[] = []
  ) {
    super(
      pluginId,
      `Requires MedDevKit Context v${requiredVersion}, but current version is v${currentVersion}`,
      'PLUGIN_COMPATIBILITY_ERROR'
    );
    this.name = 'PluginCompatibilityError';
    this.requiredVersion = requiredVersion;
    this.currentVersion = currentVersion;
    this.unavailableFeatures = unavailableFeatures;

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, PluginCompatibilityError);
    }
  }
}

/**
 * Error thrown when a plugin fails to initialize
 * (e.g., during onRegister lifecycle hook)
 */
export class PluginInitializationError extends PluginError {
  /**
   * The original error that caused initialization to fail
   */
  public readonly cause: unknown;

  /**
   * The lifecycle hook that failed
   */
  public readonly hook: string;

  constructor(pluginId: string, hook: string, cause: unknown) {
    const causeMessage =
      cause instanceof Error ? cause.message : String(cause);
    super(
      pluginId,
      `Failed to initialize during ${hook}: ${causeMessage}`,
      'PLUGIN_INITIALIZATION_ERROR'
    );
    this.name = 'PluginInitializationError';
    this.cause = cause;
    this.hook = hook;

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, PluginInitializationError);
    }
  }
}

/**
 * Error thrown when a plugin's pattern detection fails
 */
export class PluginPatternDetectionError extends PluginError {
  /**
   * The original error that caused detection to fail
   */
  public readonly cause: unknown;

  constructor(pluginId: string, cause: unknown) {
    const causeMessage =
      cause instanceof Error ? cause.message : String(cause);
    super(
      pluginId,
      `Pattern detection failed: ${causeMessage}`,
      'PLUGIN_PATTERN_DETECTION_ERROR'
    );
    this.name = 'PluginPatternDetectionError';
    this.cause = cause;

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, PluginPatternDetectionError);
    }
  }
}

/**
 * Error thrown when a plugin is already registered
 */
export class PluginAlreadyRegisteredError extends PluginError {
  constructor(pluginId: string) {
    super(
      pluginId,
      `Plugin is already registered`,
      'PLUGIN_ALREADY_REGISTERED_ERROR'
    );
    this.name = 'PluginAlreadyRegisteredError';

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, PluginAlreadyRegisteredError);
    }
  }
}

/**
 * Error thrown when a required plugin is not found
 */
export class PluginNotFoundError extends PluginError {
  constructor(pluginId: string) {
    super(pluginId, `Plugin not found`, 'PLUGIN_NOT_FOUND_ERROR');
    this.name = 'PluginNotFoundError';

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, PluginNotFoundError);
    }
  }
}

/**
 * Warning object for non-fatal plugin issues
 * (not an error, but useful for tracking issues)
 */
export interface PluginWarning {
  /**
   * The plugin that generated the warning
   */
  pluginId: string;

  /**
   * Warning message
   */
  message: string;

  /**
   * Warning code for programmatic handling
   */
  code: string;

  /**
   * Timestamp when the warning occurred
   */
  timestamp: number;
}

/**
 * Create a plugin warning object
 */
export function createPluginWarning(
  pluginId: string,
  message: string,
  code: string = 'PLUGIN_WARNING'
): PluginWarning {
  return {
    pluginId,
    message,
    code,
    timestamp: Date.now(),
  };
}
