/**
 * Opt-in second opinion: combine the offline screen with one model or API
 * classifier (docs/specs/crisis-signals/research/README.md §3.2, SPEC D6).
 *
 * This module only defines the interface and the combiner. It makes no
 * network calls itself and adds no dependencies; each provider adapter is a
 * separate package (the first is `@meddevkit/crisis-adapter-nope`). Text
 * leaves the device only when the consumer configures such an adapter.
 *
 * Privacy (SPEC §9): nothing here logs, stores or sends text. Error outcomes
 * carry fixed messages only, never input text or a provider's error message.
 */

import { LEVEL_RANK } from './match';
import { screenText } from './screen';
import type { ScreenLevel, ScreenOptions, ScreenResult } from './types';

/** Default time a provider gets before the combined result degrades to the local one. */
export const DEFAULT_SECOND_OPINION_TIMEOUT_MS = 10000;

/**
 * A provider's verdict, normalised by its adapter.
 *
 * Adapters must map the provider's output with these rules
 * (research §3.2, Q-A2 and Q-A3), and document their mapping table:
 * - **Subject other (Q-A2).** When the provider says the language is about
 *   someone other than the writer, report `subject: 'other'` and at most
 *   `level: 'concern'` (never `none`: recall first, the caller decides
 *   whether to ask).
 * - **Providers that cannot tell the subject (Q-A3)** (for example OpenAI's
 *   generic `self-harm` category, Azure Content Safety) raise at most to
 *   `concern`. Only a self-attributed signal (OpenAI `self-harm/intent`,
 *   nope-edge's self-subject severity) may report `crisis`.
 * - **Immediacy** only from a real timing signal (nope-edge `imminence`
 *   `urgent`/`emergency`). OpenAI's `self-harm/instructions` is not one.
 * - **Never report an empty or unparseable response as `none`**: throw, so
 *   the combined result is marked degraded.
 *
 * The combiner also applies the subject-other cap itself, as a safety net.
 */
export interface SecondOpinionResult {
  /** Provider verdict mapped to the screen's levels. */
  level: ScreenLevel;
  /** True only when the provider has a timing or imminence signal and it fired. */
  immediacy?: boolean;
  /** Who the provider says the language is about, when it attributes a subject. */
  subject?: 'self' | 'other' | 'unknown';
  /** Provider scores or labels, for example `{ 'self-harm/intent': 0.91 }` or `{ severity: 'high' }`. */
  providerScores?: Record<string, number | string>;
  /**
   * The provider's response, for the consumer's own audit. It may quote the
   * input text (nope-edge's reflection does), so treat it as the input's
   * sensitivity. The library never logs it; adapters should include it only
   * when the consumer opts in.
   */
  raw?: unknown;
}

/**
 * A second-opinion provider (one model or API classifier), implemented by an
 * adapter package. See {@link SecondOpinionResult} for the mapping rules an
 * adapter must apply.
 */
export interface CrisisSecondOpinion {
  /** Stable provider name, for example `nope-edge` or `openai-moderation`. */
  readonly name: string;
  /** Adapter version. */
  readonly version: string;
  /**
   * Assess one text. Should stop work and reject when `options.signal`
   * aborts (on timeout or caller abort); the combiner settles on time either way.
   * Must not log the text or put it in errors.
   */
  assess(text: string, options?: { signal?: AbortSignal }): Promise<SecondOpinionResult>;
}

/**
 * Outcome of the second-opinion call:
 * - `ok`: the provider returned a valid result.
 * - `error`: the provider threw or rejected.
 * - `timeout`: the provider did not answer within `timeoutMs`.
 * - `invalid`: the provider returned something that is not a valid {@link SecondOpinionResult}.
 */
export type SecondOpinionStatus = 'ok' | 'error' | 'timeout' | 'invalid';

/** What happened with the second opinion. Never contains input text, except possibly inside `result.raw`. */
export interface SecondOpinionOutcome {
  /** Provider name ({@link CrisisSecondOpinion.name}). */
  name: string;
  /** Adapter version ({@link CrisisSecondOpinion.version}). */
  version: string;
  /** Whether the provider answered with a valid result. */
  status: SecondOpinionStatus;
  /** The provider's normalised result, only when `status` is `ok`. */
  result?: SecondOpinionResult;
  /** Fixed explanation when `status` is not `ok`. Never contains input text or provider error text. */
  reason?: string;
  /** Wall-clock time from calling the provider to settling, in milliseconds. */
  durationMs: number;
}

/**
 * Which source set the final level:
 * - `none`: the final level is `none`.
 * - `local`: only the offline screen reached the final level.
 * - `secondOpinion`: only the provider reached it (a model-only raise: no
 *   rule, span or modifiers explain it; route it to a person like any flag).
 * - `both`: both reached it.
 */
export type RaisedBy = 'local' | 'secondOpinion' | 'both' | 'none';

/** Result of {@link screenTextWithSecondOpinion}. */
export interface CombinedScreenResult {
  /** max(local level, provider level). The provider can raise a level, never lower it. */
  level: ScreenLevel;
  /** `local.immediacy`, or the provider's immediacy when the final level is `crisis`. */
  immediacy: boolean;
  /** The offline `screenText` result, exactly as `screenText` returned it. */
  local: ScreenResult;
  /** What happened with the provider. */
  secondOpinion: SecondOpinionOutcome;
  /** True when the provider did not return a valid result; `level` and `immediacy` are then the local ones. */
  degraded: boolean;
  /** Which source set the final level. */
  raisedBy: RaisedBy;
}

/** Options for {@link screenTextWithSecondOpinion}. */
export interface SecondOpinionOptions extends ScreenOptions {
  /** Time the provider gets, in milliseconds. Default 10000. */
  timeoutMs?: number;
  /** Caller's signal. Aborting rejects the call with an `AbortError` and aborts the provider's signal. */
  signal?: AbortSignal;
}

const LEVELS: readonly ScreenLevel[] = ['none', 'concern', 'crisis'];
const SUBJECTS: readonly string[] = ['self', 'other', 'unknown'];

/** An `AbortError` with a fixed message (DOMException where available). */
function abortError(): Error {
  const message = 'crisis-signals: second opinion aborted';
  if (typeof DOMException === 'function') return new DOMException(message, 'AbortError');
  const err = new Error(message);
  err.name = 'AbortError';
  return err;
}

/** A `TimeoutError` used as the provider signal's abort reason. */
function timeoutError(timeoutMs: number): Error {
  const message = `crisis-signals: second opinion timed out after ${timeoutMs} ms`;
  if (typeof DOMException === 'function') return new DOMException(message, 'TimeoutError');
  const err = new Error(message);
  err.name = 'TimeoutError';
  return err;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Check a provider result and copy its known fields. Returns a fixed reason
 * string when it is invalid. Unknown fields are dropped, so nothing outside
 * the interface (for example a free-text explanation) is passed on.
 */
function normaliseResult(value: unknown): SecondOpinionResult | string {
  if (!isPlainObject(value)) return 'result must be an object';
  const { level, immediacy, subject, providerScores, raw } = value;
  if (typeof level !== 'string' || !LEVELS.includes(level as ScreenLevel)) {
    return "result.level must be 'none', 'concern' or 'crisis'";
  }
  if (immediacy !== undefined && typeof immediacy !== 'boolean') {
    return 'result.immediacy must be a boolean';
  }
  if (subject !== undefined && (typeof subject !== 'string' || !SUBJECTS.includes(subject))) {
    return "result.subject must be 'self', 'other' or 'unknown'";
  }
  if (providerScores !== undefined) {
    if (!isPlainObject(providerScores)) return 'result.providerScores must be an object';
    for (const k of Object.keys(providerScores)) {
      const s = providerScores[k];
      const ok = typeof s === 'string' || (typeof s === 'number' && Number.isFinite(s));
      if (!ok) return 'result.providerScores values must be finite numbers or strings';
    }
  }
  const out: SecondOpinionResult = { level: level as ScreenLevel };
  if (immediacy !== undefined) out.immediacy = immediacy;
  if (subject !== undefined) out.subject = subject as SecondOpinionResult['subject'];
  if (providerScores !== undefined) out.providerScores = providerScores as Record<string, number | string>;
  if ('raw' in value) out.raw = raw;
  return out;
}

function readOpinionArgs(opinion: unknown, options: unknown): { timeoutMs: number; signal?: AbortSignal } {
  if (!isPlainObject(opinion) && typeof opinion !== 'function') {
    throw new TypeError('crisis-signals: opinion must be a CrisisSecondOpinion');
  }
  const o = opinion as Partial<CrisisSecondOpinion>;
  if (typeof o.assess !== 'function') {
    throw new TypeError('crisis-signals: opinion.assess must be a function');
  }
  if (typeof o.name !== 'string' || typeof o.version !== 'string') {
    throw new TypeError('crisis-signals: opinion.name and opinion.version must be strings');
  }
  if (options === undefined || options === null) return { timeoutMs: DEFAULT_SECOND_OPINION_TIMEOUT_MS };
  if (typeof options !== 'object') {
    throw new TypeError('crisis-signals: options must be an object');
  }
  const { timeoutMs, signal } = options as SecondOpinionOptions;
  if (timeoutMs !== undefined && (typeof timeoutMs !== 'number' || !Number.isFinite(timeoutMs) || timeoutMs <= 0)) {
    throw new RangeError('crisis-signals: options.timeoutMs must be a positive number');
  }
  if (signal !== undefined && (typeof signal !== 'object' || signal === null || typeof signal.aborted !== 'boolean')) {
    throw new TypeError('crisis-signals: options.signal must be an AbortSignal');
  }
  return { timeoutMs: timeoutMs ?? DEFAULT_SECOND_OPINION_TIMEOUT_MS, signal };
}

type Settled =
  | { kind: 'ok'; value: unknown }
  | { kind: 'error' }
  | { kind: 'timeout' }
  | { kind: 'aborted' };

/**
 * Call `opinion.assess` with a signal that aborts on timeout or on the
 * caller's signal. Always resolves, even if the provider ignores the signal;
 * the provider's error is dropped (it may echo the input).
 */
function callWithTimeout(
  opinion: CrisisSecondOpinion,
  text: string,
  timeoutMs: number,
  callerSignal: AbortSignal | undefined,
): Promise<Settled> {
  const controller = new AbortController();
  return new Promise<Settled>((resolve) => {
    let settled = false;
    const finish = (s: Settled): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      callerSignal?.removeEventListener('abort', onCallerAbort);
      resolve(s);
    };
    const onCallerAbort = (): void => {
      controller.abort(abortError());
      finish({ kind: 'aborted' });
    };
    const timer = setTimeout(() => {
      controller.abort(timeoutError(timeoutMs));
      finish({ kind: 'timeout' });
    }, timeoutMs);
    callerSignal?.addEventListener('abort', onCallerAbort, { once: true });

    let call: Promise<SecondOpinionResult>;
    try {
      call = Promise.resolve(opinion.assess(text, { signal: controller.signal }));
    } catch {
      finish({ kind: 'error' });
      return;
    }
    call.then(
      (value) => finish({ kind: 'ok', value }),
      () => finish({ kind: 'error' }),
    );
  });
}

function now(): number {
  return typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now();
}

/**
 * Screen `text` offline, then ask one second-opinion provider and combine
 * the two (research §3.2):
 *
 * 1. `screenText(text, options)` runs first. Its result is returned
 *    unchanged as `local`.
 * 2. The provider gets `text` and a signal that aborts after `timeoutMs`
 *    (default 10000) or when the caller's `signal` aborts.
 * 3. `level` = max(local level, provider level): the provider can raise
 *    `none` → `concern` → `crisis` but never lower a level. An opinion with
 *    `subject: 'other'` raises at most to `concern` and its immediacy is
 *    ignored (Q-A2), even if the adapter did not apply that cap.
 * 4. `immediacy` = `local.immediacy`, or the provider's immediacy when the
 *    final level is `crisis`.
 * 5. If the provider throws, times out or returns an invalid result, the
 *    local level and immediacy are returned with `degraded: true`. The
 *    outcome carries a fixed `reason`, never input text or the provider's
 *    error message.
 *
 * Text leaves the device only through the adapter the caller passes in. The
 * library does not log, store or send it.
 *
 * @param text - Free text, for example one conversational turn
 * @param opinion - The provider adapter
 * @param options - `screenText` options, plus `timeoutMs` and `signal`
 * @returns The combined result; it does not reject because of the provider
 * @throws (rejects) `TypeError`/`RangeError` without text for invalid arguments,
 *   and an `AbortError` (fixed message) when the caller's `signal` aborts
 *   before the provider settles, following `fetch`. An already-aborted
 *   signal rejects without calling the provider.
 */
export async function screenTextWithSecondOpinion(
  text: string,
  opinion: CrisisSecondOpinion,
  options?: SecondOpinionOptions,
): Promise<CombinedScreenResult> {
  const local = screenText(text, options);
  const { timeoutMs, signal } = readOpinionArgs(opinion, options);
  if (signal?.aborted) throw abortError();

  const base = { name: opinion.name, version: opinion.version };
  const started = now();
  const settled = await callWithTimeout(opinion, text, timeoutMs, signal);
  const durationMs = Math.max(0, now() - started);
  if (settled.kind === 'aborted') throw abortError();

  let outcome: SecondOpinionOutcome;
  if (settled.kind === 'timeout') {
    outcome = { ...base, status: 'timeout', reason: `no answer within ${timeoutMs} ms`, durationMs };
  } else if (settled.kind === 'error') {
    outcome = { ...base, status: 'error', reason: 'provider threw or rejected', durationMs };
  } else {
    const result = normaliseResult(settled.value);
    outcome =
      typeof result === 'string'
        ? { ...base, status: 'invalid', reason: result, durationMs }
        : { ...base, status: 'ok', result, durationMs };
  }

  if (outcome.status !== 'ok' || !outcome.result) {
    return {
      level: local.level,
      immediacy: local.immediacy,
      local,
      secondOpinion: outcome,
      degraded: true,
      raisedBy: local.level === 'none' ? 'none' : 'local',
    };
  }

  const r = outcome.result;
  const other = r.subject === 'other';
  const providerLevel: ScreenLevel = other && r.level === 'crisis' ? 'concern' : r.level;
  const level = LEVEL_RANK[providerLevel] > LEVEL_RANK[local.level] ? providerLevel : local.level;
  const immediacy = local.immediacy || (!other && r.immediacy === true && level === 'crisis');

  let raisedBy: RaisedBy = 'none';
  if (level !== 'none') {
    const fromLocal = local.level === level;
    const fromOpinion = providerLevel === level;
    raisedBy = fromLocal && fromOpinion ? 'both' : fromLocal ? 'local' : 'secondOpinion';
  }

  return { level, immediacy, local, secondOpinion: outcome, degraded: false, raisedBy };
}
