/**
 * @meddevkit/crisis-signals
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
  PatternContext,
  ContextScope,
  ModifierCueName,
  ModifierCue,
  CueScope,
  BoundaryCue,
  FragmentEntry,
  PatternFile,
} from './types';

export { screenText } from './screen';

export type {
  CrisisSecondOpinion,
  SecondOpinionResult,
  SecondOpinionStatus,
  SecondOpinionOutcome,
  SecondOpinionOptions,
  RaisedBy,
  CombinedScreenResult,
} from './secondOpinion';

export { screenTextWithSecondOpinion, DEFAULT_SECOND_OPINION_TIMEOUT_MS } from './secondOpinion';

/** Version of the bundled pattern file (`data/crisis.patterns.json`). */
export const PATTERNS_VERSION: string = DATA.version;
