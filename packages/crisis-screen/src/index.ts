/**
 * @meddevkit/crisis-screen
 *
 * Offline keyword-and-context screen for first-person crisis language.
 * Not a diagnostic or risk-assessment tool. See README.md.
 */

import patternData from '../data/crisis.patterns.json';
import type { PatternFile, ScreenOptions, ScreenResult } from './types';

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
  PatternFile,
} from './types';

const patterns = patternData as PatternFile;

/** Version of the bundled pattern file (`data/crisis.patterns.json`). */
export const PATTERNS_VERSION: string = patterns.version;

/**
 * Screen one text for first-person crisis language.
 *
 * Scaffold stub: always returns level `none` until the engine lands.
 * Does not log, store or send the text.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- stub; the engine uses both
export function screenText(_text: string, _options?: ScreenOptions): ScreenResult {
  return { level: 'none', immediacy: false, findings: [], patternsVersion: PATTERNS_VERSION };
}
