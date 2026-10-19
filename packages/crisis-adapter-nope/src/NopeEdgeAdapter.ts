/**
 * nope-edge second-opinion adapter for `@meddevkit/crisis-signals`.
 *
 * Sends one text to a **self-hosted** nope-edge model (NopeNet's MIT-licensed
 * Qwen3-4B fine-tune) through any OpenAI-compatible chat-completions server
 * (Ollama, llama.cpp `llama-server`, vLLM, SGLang), parses the model's
 * `<risks>` XML and maps it to a `SecondOpinionResult`.
 *
 * `fetch` only: no SDK and no runtime dependencies, so it runs in Node >= 18
 * and edge runtimes.
 *
 * Privacy (SPEC §9): nothing is logged. Errors never contain the input text,
 * the response body or the model's output; at most an HTTP status. The
 * model's reflection (which can quote the input) is discarded. The text goes
 * to whatever `baseUrl` the caller configures; that server, and what it
 * logs, is the caller's responsibility.
 *
 * @packageDocumentation
 */

import type { CrisisSecondOpinion, SecondOpinionResult } from '@meddevkit/crisis-signals';
import { NopeEdgeError } from './errors';
import { mapNopeRisks } from './mapping';
import { parseNopeOutput, type NopeRisk } from './parse';
import { buildNopeMessages, DEFAULT_MAX_TOKENS, DEFAULT_TEMPERATURE } from './prompt';
import { ADAPTER_VERSION } from './version';

/** Adapter name reported in `SecondOpinionOutcome.name`. */
export const NOPE_EDGE_ADAPTER_NAME = 'nope-edge';

/** Default per-attempt timeout, the same as the combiner's default budget. */
export const DEFAULT_REQUEST_TIMEOUT_MS = 10_000;

/** HTTP statuses that are retried: 429 and every 5xx. */
function isRetryableStatus(status: number): boolean {
  return status === 429 || (status >= 500 && status <= 599);
}

/**
 * Configuration for {@link NopeEdgeAdapter}.
 */
export interface NopeEdgeAdapterConfig {
  /**
   * Base URL of the OpenAI-compatible API, including its version path, e.g.
   * `http://localhost:11434/v1` (Ollama), `http://localhost:8080/v1`
   * (llama-server) or `http://localhost:8000/v1` (vLLM, SGLang). The adapter
   * POSTs to `${baseUrl}/chat/completions`. Text is sent to this server.
   */
  baseUrl: string;
  /** Model name the server knows, e.g. `nope-edge` (an Ollama tag) or `nopenet/nope-edge` (vLLM). */
  model: string;
  /** Sent as `Authorization: Bearer <apiKey>` when the server requires one. Keep it server-side. */
  apiKey?: string;
  /** fetch implementation (tests, proxies, custom agents). @default globalThis.fetch */
  fetch?: typeof fetch;
  /**
   * Sampling temperature. The model card decodes greedily
   * (`do_sample=False`, `"temperature": 0`) and so does its Modelfile.
   * Always sent, so a server's own default cannot apply. @default 0
   */
  temperature?: number;
  /** `max_tokens` for the answer (the card uses 300). Output cut off before `</risks>` is a parse error. @default 300 */
  maxTokens?: number;
  /**
   * Time allowed for each attempt (request and response body), in
   * milliseconds. `0` disables the adapter's own timeout. A timed-out
   * attempt is not retried. When used through `screenTextWithSecondOpinion`,
   * its `timeoutMs` (default 10000) also bounds the whole call.
   * @default 10000
   */
  requestTimeoutMs?: number;
  /**
   * Retries after HTTP 429, any 5xx or a network error. Other 4xx responses,
   * timeouts and aborts are never retried. `0` disables retries. @default 2
   */
  retries?: number;
  /**
   * Base delay for exponential backoff with full jitter (a random delay
   * between 0 and `retryBaseDelayMs * 2^retry`), used when the response has
   * no `retry-after-ms` or `Retry-After` header. @default 250
   */
  retryBaseDelayMs?: number;
  /** Upper bound for any single retry wait, including server-requested ones. @default 2000 */
  maxRetryDelayMs?: number;
}

/** A finite number >= 0 (optionally an integer), else the default; throws on a wrong type. */
function nonNegative(name: string, value: number | undefined, fallback: number, integer = false): number {
  if (value === undefined) return fallback;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || (integer && !Number.isInteger(value))) {
    throw new NopeEdgeError(
      `nope-edge: config.${name} must be a ${integer ? 'non-negative integer' : 'non-negative number'}`,
      'InvalidConfig'
    );
  }
  return value;
}

/**
 * {@link CrisisSecondOpinion} backed by a self-hosted nope-edge model on an
 * OpenAI-compatible server. See the package README for the mapping table and
 * what this second opinion can and cannot do.
 *
 * @example
 * ```typescript
 * import { screenTextWithSecondOpinion } from '@meddevkit/crisis-signals';
 * import { NopeEdgeAdapter } from '@meddevkit/crisis-adapter-nope';
 *
 * const nope = new NopeEdgeAdapter({ baseUrl: 'http://localhost:11434/v1', model: 'nope-edge' });
 * const r = await screenTextWithSecondOpinion(text, nope);
 * ```
 */
export class NopeEdgeAdapter implements CrisisSecondOpinion {
  readonly name = NOPE_EDGE_ADAPTER_NAME;
  readonly version = ADAPTER_VERSION;

  private readonly url: string;
  private readonly model: string;
  private readonly apiKey?: string;
  private readonly fetchImpl?: typeof fetch;
  private readonly temperature: number;
  private readonly maxTokens: number;
  private readonly requestTimeoutMs: number;
  private readonly retries: number;
  private readonly retryBaseDelayMs: number;
  private readonly maxRetryDelayMs: number;

  /**
   * @throws {@link NopeEdgeError} (`InvalidConfig`) when `baseUrl` is not an
   *   http(s) URL, `model` is empty, or a numeric option is out of range.
   *   Messages never include the URL or the key.
   */
  constructor(config: NopeEdgeAdapterConfig) {
    if (typeof config !== 'object' || config === null) {
      throw new NopeEdgeError('nope-edge: config must be an object', 'InvalidConfig');
    }
    const baseUrl = typeof config.baseUrl === 'string' ? config.baseUrl.trim().replace(/\/+$/, '') : '';
    let protocol = '';
    try {
      protocol = new URL(baseUrl).protocol;
    } catch {
      protocol = '';
    }
    if (protocol !== 'http:' && protocol !== 'https:') {
      throw new NopeEdgeError('nope-edge: config.baseUrl must be an http(s) URL', 'InvalidConfig');
    }
    if (typeof config.model !== 'string' || config.model.trim() === '') {
      throw new NopeEdgeError('nope-edge: config.model must be a non-empty string', 'InvalidConfig');
    }
    if (config.fetch !== undefined && typeof config.fetch !== 'function') {
      throw new NopeEdgeError('nope-edge: config.fetch must be a function', 'InvalidConfig');
    }
    if (config.apiKey !== undefined && typeof config.apiKey !== 'string') {
      throw new NopeEdgeError('nope-edge: config.apiKey must be a string', 'InvalidConfig');
    }

    this.url = `${baseUrl}/chat/completions`;
    this.model = config.model.trim();
    this.apiKey = config.apiKey || undefined;
    this.fetchImpl = config.fetch;
    this.temperature = nonNegative('temperature', config.temperature, DEFAULT_TEMPERATURE);
    this.maxTokens = nonNegative('maxTokens', config.maxTokens, DEFAULT_MAX_TOKENS, true);
    if (this.maxTokens < 1) {
      throw new NopeEdgeError('nope-edge: config.maxTokens must be at least 1', 'InvalidConfig');
    }
    this.requestTimeoutMs = nonNegative('requestTimeoutMs', config.requestTimeoutMs, DEFAULT_REQUEST_TIMEOUT_MS);
    this.retries = nonNegative('retries', config.retries, 2, true);
    this.retryBaseDelayMs = nonNegative('retryBaseDelayMs', config.retryBaseDelayMs, 250);
    this.maxRetryDelayMs = nonNegative('maxRetryDelayMs', config.maxRetryDelayMs, 2000);
  }

  /**
   * Ask the model about one text.
   *
   * @param text - The text to assess, sent unchanged as the single user message
   * @param options - `signal` aborts the request, a retry wait and body reading
   * @returns The mapped result (see the README's mapping table)
   * @throws (rejects) the caller's abort reason when `signal` aborts; else a
   *   {@link NopeEdgeError} with a fixed message (HTTP status at most) for a
   *   non-2xx response, network failure, timeout, or output that cannot be
   *   parsed. Never returns `none` for an answer it could not parse.
   */
  async assess(text: string, options: { signal?: AbortSignal } = {}): Promise<SecondOpinionResult> {
    const signal = options?.signal;
    throwIfAborted(signal);
    if (typeof text !== 'string') {
      throw new NopeEdgeError('nope-edge: text must be a string', 'InvalidInput');
    }
    const body = JSON.stringify({
      model: this.model,
      messages: buildNopeMessages(text),
      temperature: this.temperature,
      max_tokens: this.maxTokens,
      stream: false,
    });
    const responseText = await this.post(body, signal);
    const { content, truncated } = readCompletion(responseText);
    let risks: NopeRisk[];
    try {
      risks = parseNopeOutput(content);
    } catch (err) {
      if (truncated && err instanceof NopeEdgeError) {
        throw new NopeEdgeError(
          'nope-edge: model output was cut off at maxTokens before a complete <risks> element',
          'ParseError'
        );
      }
      throw err;
    }
    return mapNopeRisks(risks);
  }

  // --------------------------------------------------------------------------
  // HTTP
  // --------------------------------------------------------------------------

  private get fetchFn(): typeof fetch {
    const f = this.fetchImpl ?? globalThis.fetch;
    if (typeof f !== 'function') {
      throw new NopeEdgeError('nope-edge: no fetch implementation available; pass config.fetch', 'NoFetch');
    }
    return f;
  }

  private headers(): Record<string, string> {
    const h: Record<string, string> = { 'Content-Type': 'application/json', Accept: 'application/json' };
    if (this.apiKey) h.Authorization = `Bearer ${this.apiKey}`;
    return h;
  }

  /**
   * POST with retries on 429, 5xx and network errors; returns the body text
   * of a 2xx response. Each attempt gets its own signal that aborts on the
   * caller's signal or after `requestTimeoutMs`, covering the body read too.
   */
  private async post(body: string, signal: AbortSignal | undefined): Promise<string> {
    const fetchFn = this.fetchFn;
    for (let attempt = 0; ; attempt++) {
      throwIfAborted(signal);
      const last = attempt >= this.retries;
      const attemptController = new AbortController();
      let timedOut = false;
      const onAbort = (): void => attemptController.abort(signal?.reason);
      signal?.addEventListener('abort', onAbort, { once: true });
      const timer =
        this.requestTimeoutMs > 0
          ? setTimeout(() => {
              timedOut = true;
              attemptController.abort(timeoutReason());
            }, this.requestTimeoutMs)
          : undefined;

      let delay: number;
      try {
        const res = await fetchFn(this.url, {
          method: 'POST',
          headers: this.headers(),
          body,
          signal: attemptController.signal,
        });
        if (res.ok) return await res.text();
        discard(res);
        if (!isRetryableStatus(res.status) || last) throw httpError(res.status, attempt + 1);
        delay = retryHeaderMs(res.headers) ?? this.backoffMs(attempt);
      } catch (err) {
        if (err instanceof NopeEdgeError) throw err;
        if (signal?.aborted) throw abortReason(signal);
        if (timedOut) {
          throw new NopeEdgeError(`nope-edge: no response within ${this.requestTimeoutMs} ms`, 'Timeout');
        }
        if (isAbortError(err)) throw new NopeEdgeError('nope-edge: request was aborted', 'Aborted');
        if (last) throw networkError(err, attempt + 1);
        delay = this.backoffMs(attempt);
      } finally {
        if (timer !== undefined) clearTimeout(timer);
        signal?.removeEventListener('abort', onAbort);
      }
      await sleep(Math.min(delay, this.maxRetryDelayMs), signal);
    }
  }

  /** Exponential backoff with full jitter, capped at maxRetryDelayMs */
  private backoffMs(attempt: number): number {
    const ceiling = Math.min(this.maxRetryDelayMs, this.retryBaseDelayMs * 2 ** attempt);
    return Math.floor(Math.random() * ceiling);
  }
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Pull the assistant content out of an OpenAI-compatible chat completion.
 * Accepts a string content or an array of `{ type: 'text', text }` parts.
 */
function readCompletion(bodyText: string): { content: string; truncated: boolean } {
  let json: unknown;
  try {
    json = JSON.parse(bodyText);
  } catch {
    throw new NopeEdgeError('nope-edge: response body is not JSON', 'InvalidResponse');
  }
  const choice = (json as { choices?: unknown } | null)?.choices;
  const first = Array.isArray(choice) ? (choice[0] as Record<string, unknown> | undefined) : undefined;
  if (!first || typeof first !== 'object') {
    throw new NopeEdgeError('nope-edge: response is not a chat completion (no choices)', 'InvalidResponse');
  }
  const message = first.message as { content?: unknown } | undefined;
  let content: string | undefined;
  if (typeof message?.content === 'string') {
    content = message.content;
  } else if (Array.isArray(message?.content)) {
    content = message.content
      .map((p: unknown) => (p && typeof (p as { text?: unknown }).text === 'string' ? (p as { text: string }).text : ''))
      .join('');
  }
  if (content === undefined || content.trim() === '') {
    throw new NopeEdgeError('nope-edge: chat completion has no message content', 'EmptyResponse');
  }
  return { content, truncated: first.finish_reason === 'length' };
}

function httpError(status: number, attempts: number): NopeEdgeError {
  const what = status === 429 ? 'was rate limited (HTTP 429)' : `failed with HTTP ${status}`;
  const tries = attempts > 1 ? ` after ${attempts} attempts` : '';
  return new NopeEdgeError(`nope-edge: request ${what}${tries}`, 'HttpError', status);
}

/** A short system error code (e.g. `ECONNREFUSED`) from a fetch failure, if there is one. */
function systemCode(err: unknown): string | undefined {
  for (const e of [err, (err as { cause?: unknown } | null)?.cause]) {
    const code = (e as { code?: unknown } | null)?.code;
    if (typeof code === 'string' && /^[A-Z][A-Z0-9_]{1,40}$/.test(code)) return code;
  }
  return undefined;
}

function networkError(err: unknown, attempts: number): NopeEdgeError {
  const code = systemCode(err);
  const tries = attempts > 1 ? ` after ${attempts} attempts` : '';
  return new NopeEdgeError(`nope-edge: request failed with a network error${code ? ` (${code})` : ''}${tries}`, 'NetworkError');
}

/**
 * Release a response body without reading it. Not awaited: cancelling one
 * branch of a tee'd body (a cloned Response) only settles once every branch
 * is cancelled.
 */
function discard(res: Response): void {
  try {
    res.body?.cancel().catch(() => undefined);
  } catch {
    // ignore: a locked or already-consumed body
  }
}

function isAbortError(err: unknown): boolean {
  const name = (err as { name?: unknown } | null)?.name;
  return name === 'AbortError' || name === 'TimeoutError';
}

function timeoutReason(): Error {
  const message = 'nope-edge: request timed out';
  if (typeof DOMException === 'function') return new DOMException(message, 'TimeoutError');
  const err = new Error(message);
  err.name = 'TimeoutError';
  return err;
}

/**
 * Server-requested retry delay in milliseconds: `retry-after-ms`, else
 * `Retry-After` (seconds or HTTP date).
 */
export function retryHeaderMs(headers: Headers): number | undefined {
  const ms = headers.get('retry-after-ms');
  if (ms !== null && ms.trim() !== '') {
    const n = Number(ms);
    if (Number.isFinite(n) && n >= 0) return n;
  }
  const value = headers.get('retry-after');
  if (!value || value.trim() === '') return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const date = Date.parse(value);
  if (!Number.isNaN(date)) return Math.max(0, date - Date.now());
  return undefined;
}

function abortReason(signal: AbortSignal): unknown {
  return signal.reason ?? new NopeEdgeError('nope-edge: request was aborted', 'Aborted');
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw abortReason(signal);
}

function sleep(ms: number, signal: AbortSignal | undefined): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortReason(signal));
      return;
    }
    const onAbort = (): void => {
      clearTimeout(timer);
      reject(abortReason(signal as AbortSignal));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}
