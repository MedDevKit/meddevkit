/**
 * Pattern Detection Modules
 *
 * @packageDocumentation
 */

// Vital signs detection
export {
  VITAL_PATTERNS,
  detectVitals,
  isWithinVitalPattern,
  getVitalProtectedRanges,
} from './vitals';

// Clinical sections detection
export {
  SECTION_PATTERNS,
  detectSections,
  getSectionAtPosition,
  getSectionBoundaries,
  isAtSectionBoundary,
  createSectionIndex,
} from './sections';

// PHI detection
export {
  BASIC_PHI_PATTERNS,
  PHI_CONFIDENCE,
  detectPhi,
  containsPhi,
  getPhiFreeRanges,
} from './phi';

// Negation detection
export {
  NEGATION_PATTERNS,
  NEGATION_CONFIDENCE,
  detectNegations,
  isTermNegated,
  getNegatedTerms,
} from './negation';
