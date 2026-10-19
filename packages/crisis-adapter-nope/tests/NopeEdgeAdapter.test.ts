import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import type { CrisisSecondOpinion } from '@meddevkit/crisis-signals';
import {
  NopeEdgeAdapter,
  NopeEdgeError,
  ADAPTER_VERSION,
  NOPE_EDGE_ADAPTER_NAME,
  NOPE_EDGE_SYSTEM_PROMPT,
  DEFAULT_MAX_TOKENS,
  DEFAULT_TEMPERATURE,
  DEFAULT_REQUEST_TIMEOUT_MS,
  buildNopeMessages,
  retryHeaderMs,
} from '../src';
import type { NopeEdgeAdapterConfig } from '../src';
import {
  BASE_URL,
  FAKE_KEY,
  INPUT_MARKER,
  REFLECTION_MARKER,
  errorResponse,
  expectNoLeak,
  hang,
  json,
  nopeOutput,
  ok,
  rejection,
  risksXml,
  scriptedFetch,
} from './helpers';

const TEXT = `I keep thinking about ending it. ${INPUT_MARKER}`;
const CRISIS = nopeOutput(risksXml({ subject: 'self', type: 'suicide', severity: 'high', imminence: 'urgent' }));
const NONE = nopeOutput('<risks/>');

function adapter(fetch: typeof globalThis.fetch, extra: Partial<NopeEdgeAdapterConfig> = {}): NopeEdgeAdapter {
  return new NopeEdgeAdapter({ baseUrl: BASE_URL, model: 'nope-edge', fetch, retryBaseDelayMs: 1, ...extra });
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('package', () => {
  it('version constant matches package.json', () => {
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
    expect(ADAPTER_VERSION).toBe(pkg.version);
  });

  it('implements CrisisSecondOpinion', () => {
    const a: CrisisSecondOpinion = adapter(scriptedFetch([ok(NONE)]).fetch);
    expect(a.name).toBe(NOPE_EDGE_ADAPTER_NAME);
    expect(a.name).toBe('nope-edge');
    expect(a.version).toBe(ADAPTER_VERSION);
    expect(typeof a.assess).toBe('function');
  });

  it('has no runtime dependencies', () => {
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
    expect(pkg.dependencies).toBeUndefined();
    expect(pkg.peerDependencies).toEqual({ '@meddevkit/crisis-signals': '^0.2.0' });
  });
});

describe('prompt (model card format)', () => {
  it('sends no system prompt and the text unchanged as one user message', () => {
    expect(NOPE_EDGE_SYSTEM_PROMPT).toBeUndefined();
    expect(buildNopeMessages(TEXT)).toEqual([{ role: 'user', content: TEXT }]);
    expect(buildNopeMessages('  spaced ​ emoji 😭 kms  ')).toEqual([{ role: 'user', content: '  spaced ​ emoji 😭 kms  ' }]);
  });

  it('defaults to greedy decoding and 300 tokens', () => {
    expect(DEFAULT_TEMPERATURE).toBe(0);
    expect(DEFAULT_MAX_TOKENS).toBe(300);
    expect(DEFAULT_REQUEST_TIMEOUT_MS).toBe(10_000);
  });
});

describe('request', () => {
  it('POSTs an OpenAI-compatible chat completion to ${baseUrl}/chat/completions', async () => {
    const f = scriptedFetch([ok(CRISIS)]);
    await new NopeEdgeAdapter({ baseUrl: `${BASE_URL}//`, model: ' nope-edge ', fetch: f.fetch }).assess(TEXT);
    expect(f.calls).toHaveLength(1);
    const [call] = f.calls;
    expect(call.url).toBe(`${BASE_URL}/chat/completions`);
    expect(call.init.method).toBe('POST');
    expect(call.headers['content-type']).toBe('application/json');
    expect(call.headers.authorization).toBeUndefined();
    expect(call.body).toEqual({
      model: 'nope-edge',
      messages: [{ role: 'user', content: TEXT }],
      temperature: 0,
      max_tokens: 300,
      stream: false,
    });
  });

  it('sends a bearer key, temperature and maxTokens when configured', async () => {
    const f = scriptedFetch([ok(CRISIS)]);
    await adapter(f.fetch, { apiKey: FAKE_KEY, temperature: 0.2, maxTokens: 512 }).assess(TEXT);
    expect(f.calls[0].headers.authorization).toBe(`Bearer ${FAKE_KEY}`);
    expect(f.calls[0].body).toMatchObject({ temperature: 0.2, max_tokens: 512 });
  });

  it('uses globalThis.fetch by default', async () => {
    const f = scriptedFetch([ok(NONE)]);
    vi.stubGlobal('fetch', f.fetch);
    try {
      const r = await new NopeEdgeAdapter({ baseUrl: BASE_URL, model: 'm' }).assess(TEXT);
      expect(r.level).toBe('none');
      expect(f.calls).toHaveLength(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('config validation', () => {
  const bad: [Partial<NopeEdgeAdapterConfig>, string][] = [
    [{ baseUrl: '' }, 'nope-edge: config.baseUrl must be an http(s) URL'],
    [{ baseUrl: 'localhost:11434' }, 'nope-edge: config.baseUrl must be an http(s) URL'],
    [{ baseUrl: 'ftp://example.test/v1' }, 'nope-edge: config.baseUrl must be an http(s) URL'],
    [{ model: '' }, 'nope-edge: config.model must be a non-empty string'],
    [{ model: '   ' }, 'nope-edge: config.model must be a non-empty string'],
    [{ temperature: -1 }, 'nope-edge: config.temperature must be a non-negative number'],
    [{ maxTokens: 2.5 }, 'nope-edge: config.maxTokens must be a non-negative integer'],
    [{ maxTokens: 0 }, 'nope-edge: config.maxTokens must be at least 1'],
    [{ retries: -1 }, 'nope-edge: config.retries must be a non-negative integer'],
    [{ requestTimeoutMs: Number.NaN }, 'nope-edge: config.requestTimeoutMs must be a non-negative number'],
    [{ fetch: 'nope' as unknown as typeof fetch }, 'nope-edge: config.fetch must be a function'],
    [{ apiKey: 42 as unknown as string }, 'nope-edge: config.apiKey must be a string'],
  ];

  for (const [override, message] of bad) {
    it(`rejects ${JSON.stringify(override)}`, () => {
      let caught: unknown;
      try {
        new NopeEdgeAdapter({ baseUrl: 'https://user:secret@example.test/v1', model: 'm', apiKey: FAKE_KEY, ...override });
      } catch (err) {
        caught = err;
      }
      expect(caught).toBeInstanceOf(NopeEdgeError);
      expect((caught as NopeEdgeError).code).toBe('InvalidConfig');
      expect((caught as Error).message).toBe(message);
      expect((caught as Error).message).not.toContain('secret');
      expect((caught as Error).message).not.toContain(FAKE_KEY);
    });
  }

  it('rejects a missing config', () => {
    expect(() => new NopeEdgeAdapter(undefined as unknown as NopeEdgeAdapterConfig)).toThrow('nope-edge: config must be an object');
  });

  it('rejects non-string text without calling the server', async () => {
    const f = scriptedFetch([ok(NONE)]);
    const err = await rejection<NopeEdgeError>(adapter(f.fetch).assess(42 as unknown as string));
    expect(err.code).toBe('InvalidInput');
    expect(f.calls).toHaveLength(0);
  });

  it('reports a missing fetch implementation', async () => {
    vi.stubGlobal('fetch', undefined);
    try {
      const err = await rejection<NopeEdgeError>(new NopeEdgeAdapter({ baseUrl: BASE_URL, model: 'm' }).assess(TEXT));
      expect(err.code).toBe('NoFetch');
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('response handling', () => {
  it('maps a crisis answer', async () => {
    const r = await adapter(scriptedFetch([ok(CRISIS)]).fetch).assess(TEXT);
    expect(r).toEqual({
      level: 'crisis',
      subject: 'self',
      immediacy: true,
      providerScores: {
        risks: 1,
        'risk.0.type': 'suicide',
        'risk.0.subject': 'self',
        'risk.0.severity': 'high',
        'risk.0.imminence': 'urgent',
      },
      raw: { risks: [{ subject: 'self', type: 'suicide', severity: 'high', imminence: 'urgent' }] },
    });
    expect(JSON.stringify(r)).not.toContain(REFLECTION_MARKER);
  });

  it('maps <risks/> to none', async () => {
    const r = await adapter(scriptedFetch([ok(NONE)]).fetch).assess(TEXT);
    expect(r).toMatchObject({ level: 'none', immediacy: false });
    expect(r.subject).toBeUndefined();
  });

  it('accepts content given as text parts', async () => {
    const parts = [
      { type: 'text', text: '<reflection>x</reflection>' },
      { type: 'text', text: '<risks><risk subject="self" type="self_harm" severity="mild"/></risks>' },
      { type: 'image_url' },
    ];
    expect((await adapter(scriptedFetch([ok(parts)]).fetch).assess(TEXT)).level).toBe('concern');
  });

  const failures: [string, () => Response, string, string][] = [
    ['a non-JSON body', () => new Response(`<html>${INPUT_MARKER}</html>`, { status: 200 }), 'InvalidResponse', 'nope-edge: response body is not JSON'],
    ['a body without choices', () => json({ error: INPUT_MARKER }), 'InvalidResponse', 'nope-edge: response is not a chat completion (no choices)'],
    ['an empty choices array', () => json({ choices: [] }), 'InvalidResponse', 'nope-edge: response is not a chat completion (no choices)'],
    ['empty content', () => ok(''), 'EmptyResponse', 'nope-edge: chat completion has no message content'],
    ['null content', () => ok(null), 'EmptyResponse', 'nope-edge: chat completion has no message content'],
    ['unparseable content', () => ok(`Sure! ${INPUT_MARKER} ${REFLECTION_MARKER}`), 'ParseError', 'nope-edge: model output has no <risks> element'],
    [
      'content cut off at max_tokens',
      () => ok(`<reflection>The user wrote ${INPUT_MARKER} ${REFLECTION_MARKER}`, 'length'),
      'ParseError',
      'nope-edge: model output was cut off at maxTokens before a complete <risks> element',
    ],
  ];

  for (const [what, response, code, message] of failures) {
    it(`throws ${code} for ${what}, without its text`, async () => {
      const f = scriptedFetch([response()]);
      const err = await rejection<NopeEdgeError>(adapter(f.fetch).assess(TEXT));
      expect(err).toBeInstanceOf(NopeEdgeError);
      expect(err.code).toBe(code);
      expect(err.message).toBe(message);
      expect(f.calls).toHaveLength(1);
    });
  }

  it('a complete answer with finish_reason length is still accepted', async () => {
    const r = await adapter(scriptedFetch([ok(CRISIS, 'length')]).fetch).assess(TEXT);
    expect(r.level).toBe('crisis');
  });
});

describe('retries', () => {
  it('retries a 429 after Retry-After seconds, then succeeds', async () => {
    vi.useFakeTimers();
    const f = scriptedFetch([errorResponse(429, { 'retry-after': '1' }), ok(CRISIS)]);
    const promise = adapter(f.fetch, { maxRetryDelayMs: 5000 }).assess(TEXT);
    await vi.advanceTimersByTimeAsync(999);
    expect(f.calls).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(f.calls).toHaveLength(2);
    expect((await promise).level).toBe('crisis');
  });

  it('honours retry-after-ms over Retry-After', async () => {
    vi.useFakeTimers();
    const f = scriptedFetch([errorResponse(429, { 'retry-after-ms': '300', 'retry-after': '20' }), ok(NONE)]);
    const promise = adapter(f.fetch).assess(TEXT);
    await vi.advanceTimersByTimeAsync(299);
    expect(f.calls).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(f.calls).toHaveLength(2);
    await promise;
  });

  it('backs off exponentially with jitter on 503 without Retry-After', async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const f = scriptedFetch([errorResponse(503), errorResponse(503), ok(NONE)]);
    const promise = adapter(f.fetch, { retryBaseDelayMs: 100 }).assess(TEXT);
    await vi.advanceTimersByTimeAsync(49);
    expect(f.calls).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1); // 0.5 * 100
    expect(f.calls).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(99);
    expect(f.calls).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(1); // 0.5 * 200
    expect(f.calls).toHaveLength(3);
    expect((await promise).level).toBe('none');
  });

  it('caps server-requested and backoff delays at maxRetryDelayMs', async () => {
    vi.useFakeTimers();
    const f = scriptedFetch([errorResponse(429, { 'retry-after': '3600' }), ok(NONE)]);
    const promise = adapter(f.fetch, { maxRetryDelayMs: 50 }).assess(TEXT);
    await vi.advanceTimersByTimeAsync(50);
    expect(f.calls).toHaveLength(2);
    await promise;
  });

  it('retries 500, 502, 503 and 504', async () => {
    const f = scriptedFetch([errorResponse(500), errorResponse(502), errorResponse(504), ok(CRISIS)]);
    const r = await adapter(f.fetch, { retries: 3 }).assess(TEXT);
    expect(r.level).toBe('crisis');
    expect(f.calls).toHaveLength(4);
  });

  it('retries a network error, then succeeds', async () => {
    const f = scriptedFetch([new TypeError('fetch failed'), ok(CRISIS)]);
    expect((await adapter(f.fetch).assess(TEXT)).level).toBe('crisis');
    expect(f.calls).toHaveLength(2);
  });

  it('throws HttpError with the status and attempt count when retries run out', async () => {
    const f = scriptedFetch(() => errorResponse(429, { 'retry-after': '0' }));
    const err = await rejection<NopeEdgeError>(adapter(f.fetch).assess(TEXT));
    expect(err.code).toBe('HttpError');
    expect(err.status).toBe(429);
    expect(err.message).toBe('nope-edge: request was rate limited (HTTP 429) after 3 attempts');
    expect(f.calls).toHaveLength(3);
  });

  it('throws NetworkError with the system code after repeated network failures', async () => {
    const cause = Object.assign(new Error(`connect ECONNREFUSED for ${INPUT_MARKER}`), { code: 'ECONNREFUSED' });
    const f = scriptedFetch(() => new TypeError(`fetch failed: ${INPUT_MARKER}`, { cause }));
    const err = await rejection<NopeEdgeError>(adapter(f.fetch, { retries: 1 }).assess(TEXT));
    expect(err.code).toBe('NetworkError');
    expect(err.status).toBeUndefined();
    expect(err.message).toBe('nope-edge: request failed with a network error (ECONNREFUSED) after 2 attempts');
    expect(err.cause).toBeUndefined();
    expect(f.calls).toHaveLength(2);
  });

  it('does not retry other 4xx responses', async () => {
    for (const code of [400, 401, 403, 404, 413, 422]) {
      const f = scriptedFetch(() => errorResponse(code));
      const err = await rejection<NopeEdgeError>(adapter(f.fetch).assess(TEXT));
      expect(err.code).toBe('HttpError');
      expect(err.status).toBe(code);
      expect(err.message).toBe(`nope-edge: request failed with HTTP ${code}`);
      expect(f.calls).toHaveLength(1);
    }
  });

  it('retries 0 disables retries', async () => {
    const f = scriptedFetch(() => errorResponse(503));
    const err = await rejection<NopeEdgeError>(adapter(f.fetch, { retries: 0 }).assess(TEXT));
    expect(err.message).toBe('nope-edge: request failed with HTTP 503');
    expect(f.calls).toHaveLength(1);
  });

  it('parses Retry-After as seconds, HTTP date or retry-after-ms', () => {
    expect(retryHeaderMs(new Headers({ 'retry-after': '2' }))).toBe(2000);
    expect(retryHeaderMs(new Headers({ 'retry-after-ms': '150' }))).toBe(150);
    expect(retryHeaderMs(new Headers({ 'retry-after-ms': 'x', 'retry-after': '1' }))).toBe(1000);
    const future = new Date(Date.now() + 60_000).toUTCString();
    const ms = retryHeaderMs(new Headers({ 'retry-after': future }))!;
    expect(ms).toBeGreaterThan(55_000);
    expect(ms).toBeLessThanOrEqual(60_000);
    expect(retryHeaderMs(new Headers({ 'retry-after': 'soon' }))).toBeUndefined();
    expect(retryHeaderMs(new Headers())).toBeUndefined();
  });
});

describe('timeout', () => {
  it('throws Timeout after requestTimeoutMs and does not retry', async () => {
    vi.useFakeTimers();
    const f = scriptedFetch([hang]);
    const promise = rejection<NopeEdgeError>(adapter(f.fetch, { requestTimeoutMs: 500 }).assess(TEXT));
    await vi.advanceTimersByTimeAsync(499);
    expect(f.calls).toHaveLength(1);
    expect(f.calls[0].init.signal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    const err = await promise;
    expect(err.code).toBe('Timeout');
    expect(err.message).toBe('nope-edge: no response within 500 ms');
    expect(f.calls[0].init.signal?.aborted).toBe(true);
    expect(f.calls).toHaveLength(1);
  });

  it('requestTimeoutMs 0 disables the adapter timeout', async () => {
    vi.useFakeTimers();
    let release: (r: Response) => void = () => undefined;
    const f = scriptedFetch([() => new Promise<Response>((resolve) => (release = resolve))]);
    const promise = adapter(f.fetch, { requestTimeoutMs: 0 }).assess(TEXT);
    await vi.advanceTimersByTimeAsync(60_000);
    release(ok(CRISIS));
    expect((await promise).level).toBe('crisis');
  });
});

describe('abort', () => {
  it('passes a signal to fetch that aborts with the caller’s reason', async () => {
    const controller = new AbortController();
    const reason = new Error('caller aborted');
    const f = scriptedFetch([hang]);
    const promise = rejection(adapter(f.fetch).assess(TEXT, { signal: controller.signal }));
    await new Promise((r) => setTimeout(r, 5));
    const fetchSignal = f.calls[0].init.signal!;
    expect(fetchSignal).toBeDefined();
    expect(fetchSignal.aborted).toBe(false);
    controller.abort(reason);
    expect(fetchSignal.aborted).toBe(true);
    expect(fetchSignal.reason).toBe(reason);
    expect(await promise).toBe(reason);
    expect(f.calls).toHaveLength(1);
  });

  it('rejects without calling the server when the signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort(new Error('already'));
    const f = scriptedFetch([ok(CRISIS)]);
    const err = await rejection(adapter(f.fetch).assess(TEXT, { signal: controller.signal }));
    expect((err as Error).message).toBe('already');
    expect(f.calls).toHaveLength(0);
  });

  it('rejects promptly when aborted during a retry wait', async () => {
    const controller = new AbortController();
    const f = scriptedFetch(() => errorResponse(503, { 'retry-after': '10' }));
    setTimeout(() => controller.abort(new Error('caller aborted')), 20);
    const started = Date.now();
    const err = await rejection(adapter(f.fetch, { maxRetryDelayMs: 10_000 }).assess(TEXT, { signal: controller.signal }));
    expect((err as Error).message).toBe('caller aborted');
    expect(Date.now() - started).toBeLessThan(1000);
    expect(f.calls).toHaveLength(1);
  });

  it('an AbortError from fetch that the caller did not cause becomes Aborted, not retried', async () => {
    const f = scriptedFetch(() => new DOMException(`aborted ${INPUT_MARKER}`, 'AbortError'));
    const err = await rejection<NopeEdgeError>(adapter(f.fetch).assess(TEXT));
    expect(err.code).toBe('Aborted');
    expect(err.message).toBe('nope-edge: request was aborted');
    expect(f.calls).toHaveLength(1);
  });
});

describe('privacy', () => {
  it('never puts input text, response bodies or model output in errors', async () => {
    const cases: (() => Response | Error)[] = [
      () => errorResponse(400),
      () => errorResponse(500),
      () => new TypeError(`fetch failed ${INPUT_MARKER}`),
      () => new Response(`${INPUT_MARKER}`, { status: 200 }),
      () => ok(`<reflection>${INPUT_MARKER} ${REFLECTION_MARKER}</reflection>`),
      () => ok(`<reflection>${REFLECTION_MARKER}</reflection><risks><risk type="suicide" severity="${INPUT_MARKER}`),
    ];
    for (const step of cases) {
      const f = scriptedFetch(() => step());
      const err = await rejection(adapter(f.fetch, { retries: 0 }).assess(TEXT));
      expectNoLeak(err);
    }
  });

  it('does not log', async () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug', 'trace'] as const).map((m) =>
      vi.spyOn(console, m).mockImplementation(() => undefined)
    );
    await adapter(scriptedFetch([ok(CRISIS)]).fetch).assess(TEXT);
    await adapter(scriptedFetch([errorResponse(500)]).fetch, { retries: 1 }).assess(TEXT).catch(() => undefined);
    await adapter(scriptedFetch([ok('garbage')]).fetch).assess(TEXT).catch(() => undefined);
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
  });
});
