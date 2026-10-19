/**
 * Test helpers: synthetic model outputs, OpenAI-compatible responses, a
 * scripted in-memory fetch and a local HTTP mock server. Synthetic data only;
 * no network beyond 127.0.0.1.
 */
import { createServer, type IncomingHttpHeaders, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { expect } from 'vitest';

/** Appears in every input text; must never appear in an error or outcome. */
export const INPUT_MARKER = 'ZQX-INPUT-7731';
/** Appears in every reflection; must never appear in an error, outcome or result. */
export const REFLECTION_MARKER = 'ZQX-REFLECTION-5521';
/** Appears in server error bodies; must never appear in an error. */
export const BODY_MARKER = 'ZQX-BODY-9043';

export const BASE_URL = 'http://unit-test.local:11434/v1';
export const FAKE_KEY = 'fake-key-for-tests';

/** A synthetic nope-edge answer: a reflection that quotes the input, then `risks`. */
export function nopeOutput(risks: string, reflection = `The user wrote "${INPUT_MARKER}". ${REFLECTION_MARKER}`): string {
  return `<reflection>${reflection}</reflection>\n${risks}`;
}

/** `<risks>` with one `<risk/>` per attribute set. */
export function risksXml(...risks: Record<string, string>[]): string {
  if (risks.length === 0) return '<risks/>';
  const items = risks.map(
    (r) =>
      `  <risk ${Object.entries(r)
        .map(([k, v]) => `${k}="${v}"`)
        .join(' ')}/>`
  );
  return `<risks>\n${items.join('\n')}\n</risks>`;
}

/** An OpenAI-compatible chat completion body. */
export function completion(content: unknown, finishReason = 'stop'): Record<string, unknown> {
  return {
    id: 'chatcmpl-test',
    object: 'chat.completion',
    created: 1760000000,
    model: 'nope-edge',
    choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: finishReason }],
    usage: { prompt_tokens: 20, completion_tokens: 60, total_tokens: 80 },
  };
}

export function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
}

/** A 2xx chat completion response whose content is `content`. */
export function ok(content: unknown, finishReason?: string): Response {
  return json(completion(content, finishReason));
}

/** An error response whose body echoes the input (servers sometimes do). */
export function errorResponse(status: number, headers: Record<string, string> = {}): Response {
  return json({ error: { message: `bad request for "${INPUT_MARKER}" ${BODY_MARKER}` } }, status, headers);
}

export interface RecordedCall {
  url: string;
  init: RequestInit;
  body: Record<string, unknown>;
  headers: Record<string, string>;
}

type Step = Response | Error | ((init: RequestInit) => Response | Promise<Response>);

/**
 * A fetch that serves `steps` in order (the last step repeats). An `Error`
 * step is thrown; a function step is called with the request init.
 */
export function scriptedFetch(steps: Step[] | (() => Step)) {
  const calls: RecordedCall[] = [];
  let i = 0;
  const fetch: typeof globalThis.fetch = async (input, init = {}) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const headers: Record<string, string> = {};
    new Headers(init.headers).forEach((v, k) => {
      headers[k] = v;
    });
    calls.push({ url, init, body: JSON.parse(String(init.body)), headers });
    if (init.signal?.aborted) throw init.signal.reason;
    const step = typeof steps === 'function' ? steps() : steps[Math.min(i++, steps.length - 1)];
    if (step instanceof Error) throw step;
    if (typeof step === 'function') return step(init);
    // A Response body can only be read once; clone so a repeated step works
    return step.clone();
  };
  return { fetch, calls };
}

/** A fetch step that never settles unless the request's signal aborts. */
export function hang(init: RequestInit): Promise<Response> {
  return new Promise((_resolve, reject) => {
    init.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true });
  });
}

/** The rejection of `promise`, checked to contain no input, body or reflection text. */
export async function rejection<E = Error>(promise: Promise<unknown>): Promise<E> {
  const err = await promise.then(
    () => undefined,
    (e: unknown) => e
  );
  expect(err).toBeDefined();
  expectNoLeak(err);
  return err as E;
}

/** Assert that nothing reachable from `value` (message, stack, JSON) contains a marker. */
export function expectNoLeak(value: unknown): void {
  const e = value as { message?: unknown; stack?: unknown; cause?: unknown } | null;
  const text = [
    String(e?.message ?? ''),
    String(e?.stack ?? ''),
    safeJson(value),
    safeJson(e?.cause),
    String(value),
  ].join(' ');
  for (const marker of [INPUT_MARKER, REFLECTION_MARKER, BODY_MARKER]) {
    expect(text).not.toContain(marker);
  }
}

function safeJson(v: unknown): string {
  try {
    return JSON.stringify(v) ?? '';
  } catch {
    return '';
  }
}

// ----------------------------------------------------------------------------
// Local HTTP mock of an OpenAI-compatible server
// ----------------------------------------------------------------------------

export interface MockRequest {
  method: string;
  url: string;
  headers: IncomingHttpHeaders;
  body: { model?: string; messages?: { role: string; content: string }[]; [k: string]: unknown };
}

export interface MockReply {
  status?: number;
  headers?: Record<string, string>;
  /** JSON body (default: a completion of `content`). */
  body?: unknown;
  /** Assistant content for a 200 completion. */
  content?: string;
  /** Send headers and part of the body, then never finish. */
  stallBody?: boolean;
  /** Never answer at all. */
  hang?: boolean;
}

export interface MockServer {
  baseUrl: string;
  requests: MockRequest[];
  /** Requests whose connection closed before the server finished answering (client aborts). */
  closedEarly: () => number;
  close: () => Promise<void>;
}

/** Start an OpenAI-compatible mock on 127.0.0.1 that answers with `handler`. */
export async function startMockServer(handler: (req: MockRequest) => MockReply | Promise<MockReply>): Promise<MockServer> {
  const requests: MockRequest[] = [];
  let closedEarly = 0;
  const server = createServer((req, res: ServerResponse) => {
    let finished = false;
    res.on('finish', () => {
      finished = true;
    });
    res.on('close', () => {
      if (!finished) closedEarly++;
    });
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', async () => {
      let body: MockRequest['body'] = {};
      try {
        body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      } catch {
        body = {};
      }
      const request: MockRequest = { method: req.method ?? '', url: req.url ?? '', headers: req.headers, body };
      requests.push(request);
      if (req.method !== 'POST' || req.url !== '/v1/chat/completions') {
        res.writeHead(404, { 'content-type': 'application/json' }).end('{"error":"not found"}');
        return;
      }
      const reply = await handler(request);
      if (reply.hang) return;
      const status = reply.status ?? 200;
      const payload = JSON.stringify(reply.body ?? completion(reply.content ?? '<risks/>'));
      res.writeHead(status, { 'content-type': 'application/json', ...(reply.headers ?? {}) });
      if (reply.stallBody) {
        res.write(payload.slice(0, 10));
        return;
      }
      res.end(payload);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${port}/v1`,
    requests,
    closedEarly: () => closedEarly,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections?.();
        server.close(() => resolve());
      }),
  };
}

/** The user message content of a mock request. */
export function userText(req: MockRequest): string {
  return req.body.messages?.find((m) => m.role === 'user')?.content ?? '';
}
