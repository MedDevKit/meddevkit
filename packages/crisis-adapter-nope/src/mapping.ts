/**
 * Map parsed nope-edge risks to the screen's {@link SecondOpinionResult}
 * (research README §3.2, Q-A2 and Q-A3; the rules in
 * `@meddevkit/crisis-signals`' `SecondOpinionResult`).
 *
 * Per risk:
 *
 * | nope-edge `type` | `subject` | `severity` | Level |
 * |---|---|---|---|
 * | `suicide`, `self_harm` | `self` | `moderate`, `high`, `critical` | `crisis` |
 * | `suicide`, `self_harm` | `self` | `mild` | `concern` |
 * | `suicide`, `self_harm` | `self` | unrecognised value | `concern` |
 * | `suicide`, `self_harm` | `other` | any | `concern` (Q-A2: at most concern, never none) |
 * | `suicide`, `self_harm` | `unknown` (or missing) | any | `concern` (Q-A3: only a self-attributed signal may reach crisis) |
 * | `self_neglect` | any | any | `concern` |
 * | `violence`, `abuse`, `sexual_violence`, `exploitation`, `stalking`, `neglect` | any | any | `none` (recorded in `providerScores` only; risk to others is v2, SPEC D5) |
 *
 * Risks the parser dropped (`severity="none"`, or a type outside the 9)
 * never reach this table. `<risks/>` maps to `none`.
 *
 * Result:
 *
 * - `level`: the highest level over all risks.
 * - `subject`: the subject of a risk at that level, preferring `self`, then
 *   `unknown`, then `other`; omitted when the level is `none`.
 * - `immediacy`: true when any `suicide` or `self_harm` risk whose subject
 *   is not `other` has `imminence` `urgent` or `emergency`. The combiner
 *   uses it only when the final level is `crisis`.
 * - `providerScores`: `risks` (the number of kept risks) and, for each risk
 *   `i`, `risk.<i>.type`, `risk.<i>.subject`, `risk.<i>.severity` and
 *   `risk.<i>.imminence`.
 * - `raw`: `{ risks }`, the parsed risks only. Never the reflection, which
 *   can quote the input.
 *
 * `features` are never used for the level or immediacy (the card: "don't
 * gate decisions on it").
 */

import type { ScreenLevel, SecondOpinionResult } from '@meddevkit/crisis-signals';
import type { NopeRisk, NopeSubject } from './parse';

const RANK: Record<ScreenLevel, number> = { none: 0, concern: 1, crisis: 2 };
const SUBJECT_PREFERENCE: Record<NopeSubject, number> = { self: 0, unknown: 1, other: 2 };

/** Risk types this screen considers: suicide and self-harm. */
const SCREENED_TYPES: ReadonlySet<string> = new Set(['suicide', 'self_harm']);

/** Severities that make a self-attributed suicide or self-harm risk `crisis`. */
const CRISIS_SEVERITIES: ReadonlySet<string> = new Set(['moderate', 'high', 'critical']);

/** Imminence values that set `immediacy`. */
const IMMEDIATE: ReadonlySet<string> = new Set(['urgent', 'emergency']);

/** The level one risk maps to (see the table in this module's docs). */
export function riskLevel(risk: NopeRisk): ScreenLevel {
  if (SCREENED_TYPES.has(risk.type)) {
    if (risk.subject === 'self' && CRISIS_SEVERITIES.has(risk.severity)) return 'crisis';
    return 'concern';
  }
  if (risk.type === 'self_neglect') return 'concern';
  return 'none';
}

/** Whether one risk signals immediacy (see this module's docs). */
export function riskImmediacy(risk: NopeRisk): boolean {
  return SCREENED_TYPES.has(risk.type) && risk.subject !== 'other' && IMMEDIATE.has(risk.imminence);
}

/**
 * Map the parsed risks of one nope-edge answer to a second-opinion result.
 *
 * @param risks - Output of `parseNopeOutput`
 */
export function mapNopeRisks(risks: readonly NopeRisk[]): SecondOpinionResult {
  let level: ScreenLevel = 'none';
  let subject: NopeSubject | undefined;
  const providerScores: Record<string, number | string> = { risks: risks.length };

  for (const [i, risk] of risks.entries()) {
    providerScores[`risk.${i}.type`] = risk.type;
    providerScores[`risk.${i}.subject`] = risk.subject;
    providerScores[`risk.${i}.severity`] = risk.severity;
    providerScores[`risk.${i}.imminence`] = risk.imminence;

    const l = riskLevel(risk);
    if (l === 'none') continue;
    if (RANK[l] > RANK[level]) {
      level = l;
      subject = risk.subject;
    } else if (
      RANK[l] === RANK[level] &&
      subject !== undefined &&
      SUBJECT_PREFERENCE[risk.subject] < SUBJECT_PREFERENCE[subject]
    ) {
      subject = risk.subject;
    }
  }

  const result: SecondOpinionResult = {
    level,
    immediacy: risks.some(riskImmediacy),
    providerScores,
    raw: { risks: risks.map((r) => ({ ...r, ...(r.features ? { features: [...r.features] } : {}) })) },
  };
  if (subject !== undefined) result.subject = subject;
  return result;
}
