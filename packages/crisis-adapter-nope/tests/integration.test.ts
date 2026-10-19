/**
 * The adapter against a local OpenAI-compatible HTTP mock (node:http on
 * 127.0.0.1, real fetch), alone and through screenTextWithSecondOpinion.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { screenText, screenTextWithSecondOpinion } from '@meddevkit/crisis-signals';
import { NopeEdgeAdapter, NopeEdgeError } from '../src';
import {
  FAKE_KEY,
  INPUT_MARKER,
  REFLECTION_MARKER,
  expectNoLeak,
  nopeOutput,
  rejection,
  risksXml,
  startMockServer,
  userText,
  type MockReply,
  type MockServer,
} from './helpers';

// Synthetic inputs. The marker never falls inside a local finding span.
const NONE_TEXT = `The weather was nice today. ${INPUT_MARKER}`;
const CONCERN_TEXT = `I can't cope with any of this. ${INPUT_MARKER}`;
const CRISIS_TEXT = `I keep thinking about ending it. ${INPUT_MARKER}`;

const SELF_CRISIS = nopeOutput(risksXml({ subject: 'self', type: 'suicide', severity: 'high', imminence: 'urgent' }));
const OTHER_CRISIS = nopeOutput(risksXml({ subject: 'other', type: 'suicide', severity: 'critical', imminence: 'emergency' }));
const NO_RISK = nopeOutput('<risks/>');

let server: MockServer | undefined;
afterEach(async () => {
  await server?.close();
  server = undefined;
});

async function serve(handler: (text: string) => MockReply): Promise<MockServer> {
  server = await startMockServer((req) => handler(userText(req)));
  return server;
}

const nope = (s: MockServer, extra: Partial<ConstructorParameters<typeof NopeEdgeAdapter>[0]> = {}) =>
  new NopeEdgeAdapter({ baseUrl: s.baseUrl, model: 'nope-edge', retryBaseDelayMs: 1, ...extra });

describe('adapter against a mock OpenAI-compatible server', () => {
  it('sends the documented request and maps the answer', async () => {
    const s = await serve(() => ({ content: SELF_CRISIS }));
    const r = await nope(s, { apiKey: FAKE_KEY }).assess(CRISIS_TEXT);
    expect(r).toMatchObject({ level: 'crisis', subject: 'self', immediacy: true });

    expect(s.requests).toHaveLength(1);
    const [req] = s.requests;
    expect(req.method).toBe('POST');
    expect(req.url).toBe('/v1/chat/completions');
    expect(req.headers['content-type']).toBe('application/json');
    expect(req.headers.authorization).toBe(`Bearer ${FAKE_KEY}`);
    expect(req.body).toEqual({
      model: 'nope-edge',
      messages: [{ role: 'user', content: CRISIS_TEXT }],
      temperature: 0,
      max_tokens: 300,
      stream: false,
    });
  });

  it('retries a 503, then succeeds', async () => {
    let n = 0;
    const s = await serve(() => (n++ === 0 ? { status: 503, body: { error: 'loading model' } } : { content: NO_RISK }));
    expect((await nope(s).assess(NONE_TEXT)).level).toBe('none');
    expect(s.requests).toHaveLength(2);
  });

  it('does not retry a 404 (wrong model or path)', async () => {
    const s = await serve(() => ({ status: 404, body: { error: { message: `model not found; prompt was ${INPUT_MARKER}` } } }));
    const err = await rejection<NopeEdgeError>(nope(s).assess(NONE_TEXT));
    expect(err).toMatchObject({ code: 'HttpError', status: 404 });
    expect(s.requests).toHaveLength(1);
  });

  it('times out while the body is still streaming', async () => {
    const s = await serve(() => ({ stallBody: true }));
    const err = await rejection<NopeEdgeError>(nope(s, { requestTimeoutMs: 150 }).assess(NONE_TEXT));
    expect(err.code).toBe('Timeout');
    expect(s.requests).toHaveLength(1);
  });

  it('aborts the HTTP request when the caller aborts', async () => {
    const s = await serve(() => ({ hang: true }));
    const controller = new AbortController();
    const promise = rejection(nope(s).assess(NONE_TEXT, { signal: controller.signal }));
    await waitFor(() => s.requests.length === 1);
    controller.abort(new Error('caller aborted'));
    expect(((await promise) as Error).message).toBe('caller aborted');
    await waitFor(() => s.closedEarly() === 1);
  });

  it('reports a refused connection as NetworkError', async () => {
    const s = await serve(() => ({ content: NO_RISK }));
    const baseUrl = s.baseUrl;
    await s.close();
    server = undefined;
    const err = await rejection<NopeEdgeError>(
      new NopeEdgeAdapter({ baseUrl, model: 'nope-edge', retries: 1, retryBaseDelayMs: 1 }).assess(NONE_TEXT)
    );
    expect(err.code).toBe('NetworkError');
    expect(err.message).toMatch(/^nope-edge: request failed with a network error( \(ECONNREFUSED\))? after 2 attempts$/);
  });
});

describe('screenTextWithSecondOpinion with NopeEdgeAdapter', () => {
  it('raises a local none to crisis (model-only flag) with immediacy', async () => {
    expect(screenText(NONE_TEXT).level).toBe('none');
    const s = await serve(() => ({ content: SELF_CRISIS }));
    const r = await screenTextWithSecondOpinion(NONE_TEXT, nope(s));
    expect(r.level).toBe('crisis');
    expect(r.immediacy).toBe(true);
    expect(r.raisedBy).toBe('secondOpinion');
    expect(r.degraded).toBe(false);
    expect(r.local).toEqual(screenText(NONE_TEXT));
    expect(r.secondOpinion).toMatchObject({ name: 'nope-edge', status: 'ok', result: { level: 'crisis', subject: 'self' } });
    expect(JSON.stringify(r)).not.toContain(REFLECTION_MARKER);
    expect(JSON.stringify(r.secondOpinion)).not.toContain(INPUT_MARKER);
  });

  it('raises a local concern to crisis', async () => {
    expect(screenText(CONCERN_TEXT).level).toBe('concern');
    const s = await serve(() => ({ content: SELF_CRISIS }));
    const r = await screenTextWithSecondOpinion(CONCERN_TEXT, nope(s));
    expect(r).toMatchObject({ level: 'crisis', raisedBy: 'secondOpinion', degraded: false });
  });

  it('subject other raises at most to concern, without immediacy', async () => {
    const s = await serve(() => ({ content: OTHER_CRISIS }));
    const r = await screenTextWithSecondOpinion(NONE_TEXT, nope(s));
    expect(r).toMatchObject({ level: 'concern', immediacy: false, raisedBy: 'secondOpinion' });
    expect(r.secondOpinion.result).toMatchObject({ level: 'concern', subject: 'other' });
  });

  it('a model none never lowers a local crisis', async () => {
    expect(screenText(CRISIS_TEXT).level).toBe('crisis');
    const s = await serve(() => ({ content: NO_RISK }));
    const r = await screenTextWithSecondOpinion(CRISIS_TEXT, nope(s));
    expect(r).toMatchObject({ level: 'crisis', raisedBy: 'local', degraded: false });
    expect(r.secondOpinion.result?.level).toBe('none');
  });

  it('agreement on crisis is raisedBy both', async () => {
    const s = await serve(() => ({ content: SELF_CRISIS }));
    const r = await screenTextWithSecondOpinion(CRISIS_TEXT, nope(s));
    expect(r).toMatchObject({ level: 'crisis', raisedBy: 'both' });
  });

  describe('degraded paths fall back to the local result', () => {
    const degraded: [string, MockReply, 'error' | 'timeout'][] = [
      ['HTTP 500 after retries', { status: 500, body: { error: `oops ${INPUT_MARKER}` } }, 'error'],
      ['HTTP 401', { status: 401, body: { error: 'unauthorized' } }, 'error'],
      ['unparseable model output', { content: `I'm sorry, I can't help. ${INPUT_MARKER} ${REFLECTION_MARKER}` }, 'error'],
      ['a body that is not a chat completion', { body: `not a completion ${INPUT_MARKER}` }, 'error'],
      ['no answer in time', { hang: true }, 'timeout'],
    ];

    for (const [what, reply, status] of degraded) {
      it(what, async () => {
        const s = await serve(() => reply);
        for (const text of [NONE_TEXT, CONCERN_TEXT]) {
          const local = screenText(text);
          const r = await screenTextWithSecondOpinion(text, nope(s, { retries: 1 }), { timeoutMs: 300 });
          expect(r.degraded).toBe(true);
          expect(r.level).toBe(local.level);
          expect(r.immediacy).toBe(local.immediacy);
          expect(r.raisedBy).toBe(local.level === 'none' ? 'none' : 'local');
          expect(r.secondOpinion.status).toBe(status);
          expect(r.secondOpinion.result).toBeUndefined();
          expectNoLeak(r.secondOpinion);
          expect(JSON.stringify(r)).not.toContain(REFLECTION_MARKER);
        }
      });
    }

    it('the combiner timeout aborts the HTTP request', async () => {
      const s = await serve(() => ({ hang: true }));
      const r = await screenTextWithSecondOpinion(NONE_TEXT, nope(s), { timeoutMs: 100 });
      expect(r.secondOpinion.status).toBe('timeout');
      await waitFor(() => s.closedEarly() === 1);
    });
  });

  it('a caller abort rejects and aborts the HTTP request', async () => {
    const s = await serve(() => ({ hang: true }));
    const controller = new AbortController();
    const promise = screenTextWithSecondOpinion(NONE_TEXT, nope(s), { signal: controller.signal });
    await waitFor(() => s.requests.length === 1);
    controller.abort();
    await expect(promise).rejects.toMatchObject({ name: 'AbortError' });
    await waitFor(() => s.closedEarly() === 1);
  });
});

async function waitFor(condition: () => boolean, timeoutMs = 2000): Promise<void> {
  const started = Date.now();
  while (!condition()) {
    if (Date.now() - started > timeoutMs) throw new Error('waitFor timed out');
    await new Promise((r) => setTimeout(r, 5));
  }
}
