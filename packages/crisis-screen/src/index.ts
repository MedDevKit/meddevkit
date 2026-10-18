/**
 * @meddevkit/crisis-screen
 *
 * Offline keyword-and-context screen for first-person crisis language.
 * Not a diagnostic or risk-assessment tool. See README.md.
 */

import { DATA } from './data';

export type {
  ScreenLevel,
  CrisisCategory,
  ModifierName,
  ScreenOptions,
  ScreenFinding,
  ScreenResult,
  SourceRelation,
  PatternEntry,
  ModifierCueName,
  ModifierCue,
  CueScope,
  BoundaryCue,
  PatternFile,
} from './types';

export { screenText } from './screen';

/** Version of the bundled pattern file (`data/crisis.patterns.json`). */
export const PATTERNS_VERSION: string = DATA.version;
