/**
 * MedDevKit Context Version Management
 *
 * Handles version constants, comparison, and feature detection
 * for the plugin system.
 *
 * @packageDocumentation
 */

// ============================================================================
// Version Constants
// ============================================================================

/**
 * Current semantic version of the MedDevKitContext API
 */
export const CONTEXT_VERSION = '1.0.0';

/**
 * Marketing brand version for documentation and display
 */
export const BRAND_VERSION = 'MedDevKit Context 1.0';

// ============================================================================
// Feature Definitions
// ============================================================================

/**
 * Features available in MedDevKitContext
 */
export interface ContextFeatures {
  /** Basic token estimation */
  tokenEstimation: boolean;
  /** Pattern matching helpers */
  patternMatching: boolean;
  /** Protected range management */
  protectedRanges: boolean;
  /** Full text access */
  textAccess: boolean;
  /** Access to detected clinical sections (v1.1.0+) */
  sectionContext: boolean;
  /** Access to adjacent chunks (v1.2.0+) */
  neighborChunks: boolean;
  /** Async pattern detection support (v2.0.0+) */
  asyncPatternDetection: boolean;
  /** Inter-plugin communication (v2.0.0+) */
  pluginCommunication: boolean;
  /** Advanced tokenization options (v2.0.0+) */
  advancedTokenization: boolean;
}

/**
 * Features available in version 1.0.0
 */
export const FEATURES_V1_0_0: ContextFeatures = {
  tokenEstimation: true,
  patternMatching: true,
  protectedRanges: true,
  textAccess: true,
  sectionContext: false,
  neighborChunks: false,
  asyncPatternDetection: false,
  pluginCommunication: false,
  advancedTokenization: false,
};

/**
 * Map of version strings to their available features
 */
export const FEATURES_BY_VERSION: Record<string, ContextFeatures> = {
  '1.0.0': FEATURES_V1_0_0,
};

/**
 * Get features available for the current context version
 */
export function getCurrentFeatures(): ContextFeatures {
  return FEATURES_BY_VERSION[CONTEXT_VERSION] ?? FEATURES_V1_0_0;
}

// ============================================================================
// Version Comparison Utilities
// ============================================================================

/**
 * Parse a semantic version string into components
 *
 * @param version - Version string (e.g., "1.2.3")
 * @returns Parsed version components or null if invalid
 */
export function parseVersion(version: string): {
  major: number;
  minor: number;
  patch: number;
} | null {
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!match) return null;

  return {
    major: parseInt(match[1], 10),
    minor: parseInt(match[2], 10),
    patch: parseInt(match[3], 10),
  };
}

/**
 * Compare two semantic version strings
 *
 * @param a - First version string
 * @param b - Second version string
 * @returns -1 if a < b, 0 if a === b, 1 if a > b
 */
export function compareVersions(a: string, b: string): -1 | 0 | 1 {
  const parsedA = parseVersion(a);
  const parsedB = parseVersion(b);

  if (!parsedA || !parsedB) {
    // Fall back to string comparison if parsing fails
    return a < b ? -1 : a > b ? 1 : 0;
  }

  // Compare major
  if (parsedA.major !== parsedB.major) {
    return parsedA.major < parsedB.major ? -1 : 1;
  }

  // Compare minor
  if (parsedA.minor !== parsedB.minor) {
    return parsedA.minor < parsedB.minor ? -1 : 1;
  }

  // Compare patch
  if (parsedA.patch !== parsedB.patch) {
    return parsedA.patch < parsedB.patch ? -1 : 1;
  }

  return 0;
}

/**
 * Check if a plugin's minimum required version is compatible
 * with the current context version
 *
 * @param minRequired - Minimum version required by plugin
 * @param current - Current context version (defaults to CONTEXT_VERSION)
 * @returns true if compatible (current >= minRequired)
 */
export function isVersionCompatible(
  minRequired: string,
  current: string = CONTEXT_VERSION
): boolean {
  return compareVersions(current, minRequired) >= 0;
}

/**
 * Get a list of features that would be unavailable if running
 * on an older context version
 *
 * @param targetVersion - The version a plugin targets
 * @param currentVersion - The current context version
 * @returns List of feature names that won't be available
 */
export function getUnavailableFeatures(
  targetVersion: string,
  currentVersion: string = CONTEXT_VERSION
): (keyof ContextFeatures)[] {
  const targetFeatures = FEATURES_BY_VERSION[targetVersion];
  const currentFeatures = FEATURES_BY_VERSION[currentVersion] ?? getCurrentFeatures();

  if (!targetFeatures) {
    return [];
  }

  const unavailable: (keyof ContextFeatures)[] = [];

  for (const [feature, available] of Object.entries(targetFeatures)) {
    if (available && !currentFeatures[feature as keyof ContextFeatures]) {
      unavailable.push(feature as keyof ContextFeatures);
    }
  }

  return unavailable;
}
