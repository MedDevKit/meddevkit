import { describe, it, expect } from 'vitest';
import { screenText, screenTextWithSecondOpinion, DEFAULT_SECOND_OPINION_TIMEOUT_MS } from '../src';
import type { CrisisSecondOpinion, SecondOpinionResult } from '../src';

// Synthetic inputs only. MARKER never falls inside a local finding span.
const MARKER = 'ZQXMARKER-7731';
const NONE_TEXT = `The weather was nice. ${MARKER}`;
const CONCERN_TEXT = `I can't cope with any of this. ${MARKER}`;
const CRISIS_TEXT = `I keep thinking about ending it. ${MARKER}`;
const CRISIS_IMMEDIATE_TEXT = 'I keep thinking about ending it. Maybe tonight.';

interface Fake extends CrisisSecondOpinion {
  calls: number;
  lastSignal?: AbortSignal;
}

/** A fake provider whose `assess` runs `impl`. */
function fake(impl: (text: string, signal: AbortSignal) => Promise<unknown> | unknown): Fake {
  const f: Fake = {
    name: 'fake-provider',
    version: '1.2.3',
    calls: 0,
    assess(text, options) {
      f.calls++;
      f.lastSignal = options?.signal;
      return impl(text, options!.signal!) as Promise<SecondOpinionResult>;
    },
  };
  return f;
}

const returning = (r: unknown): Fake => fake(async () => r);

/** Never settles unless its signal aborts. */
const hanging = (): Fake =>
  fake(
    (_text, signal) =>
      new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(signal.reason));
      }),
  );

describe('screenTextWithSecondOpinion', () => {
  it('local result deep-equals screenText(text) and is not modified', async () => {
    for (const text of [NONE_TEXT, CONCERN_TEXT, CRISIS_TEXT, CRISIS_IMMEDIATE_TEXT]) {
      const r = await screenTextWithSecondOpinion(text, returning({ level: 'crisis', immediacy: true }));
      expect(r.local).toEqual(screenText(text));
    }
  });

  it('passes the text and a signal to the provider', async () => {
    let seen = '';
    const p = fake(async (text) => {
      seen = text;
      return { level: 'none' };
    });
    await screenTextWithSecondOpinion(NONE_TEXT, p);
    expect(seen).toBe(NONE_TEXT);
    expect(p.calls).toBe(1);
    expect(p.lastSignal).toBeDefined();
    expect(p.lastSignal!.aborted).toBe(false);
  });

  it('raises none to concern', async () => {
    const r = await screenTextWithSecondOpinion(NONE_TEXT, returning({ level: 'concern', providerScores: { 'self-harm': 0.4 } }));
    expect(r.local.level).toBe('none');
    expect(r.level).toBe('concern');
    expect(r.raisedBy).toBe('secondOpinion');
    expect(r.degraded).toBe(false);
    expect(r.secondOpinion).toMatchObject({
      name: 'fake-provider',
      version: '1.2.3',
      status: 'ok',
      result: { level: 'concern', providerScores: { 'self-harm': 0.4 } },
    });
    expect(r.secondOpinion.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('raises concern to crisis', async () => {
    const r = await screenTextWithSecondOpinion(CONCERN_TEXT, returning({ level: 'crisis', subject: 'self' }));
    expect(r.local.level).toBe('concern');
    expect(r.level).toBe('crisis');
    expect(r.raisedBy).toBe('secondOpinion');
  });

  it('never lowers a local crisis', async () => {
    const r = await screenTextWithSecondOpinion(CRISIS_IMMEDIATE_TEXT, returning({ level: 'none', immediacy: false }));
    expect(r.level).toBe('crisis');
    expect(r.immediacy).toBe(true);
    expect(r.raisedBy).toBe('local');
    expect(r.degraded).toBe(false);
  });

  it('reports both when the levels agree, and none when both are none', async () => {
    expect((await screenTextWithSecondOpinion(CRISIS_TEXT, returning({ level: 'crisis' }))).raisedBy).toBe('both');
    const n = await screenTextWithSecondOpinion(NONE_TEXT, returning({ level: 'none' }));
    expect(n.level).toBe('none');
    expect(n.raisedBy).toBe('none');
  });

  it('ignores provider immediacy unless the final level is crisis', async () => {
    const low = await screenTextWithSecondOpinion(NONE_TEXT, returning({ level: 'concern', immediacy: true }));
    expect(low.level).toBe('concern');
    expect(low.immediacy).toBe(false);

    const raised = await screenTextWithSecondOpinion(NONE_TEXT, returning({ level: 'crisis', immediacy: true }));
    expect(raised.level).toBe('crisis');
    expect(raised.immediacy).toBe(true);

    // Local crisis without immediacy; the provider adds it.
    const added = await screenTextWithSecondOpinion(CRISIS_TEXT, returning({ level: 'concern', immediacy: true }));
    expect(added.local.immediacy).toBe(false);
    expect(added.level).toBe('crisis');
    expect(added.immediacy).toBe(true);
  });

  it('caps a subject-other opinion at concern and ignores its immediacy (Q-A2)', async () => {
    const r = await screenTextWithSecondOpinion(NONE_TEXT, returning({ level: 'crisis', subject: 'other', immediacy: true }));
    expect(r.level).toBe('concern');
    expect(r.immediacy).toBe(false);
    expect(r.raisedBy).toBe('secondOpinion');
    expect(r.secondOpinion.result).toMatchObject({ level: 'crisis', subject: 'other' });

    const onCrisis = await screenTextWithSecondOpinion(CRISIS_TEXT, returning({ level: 'crisis', subject: 'other', immediacy: true }));
    expect(onCrisis.level).toBe('crisis');
    expect(onCrisis.immediacy).toBe(false);
    expect(onCrisis.raisedBy).toBe('local');
  });

  it('times out: degraded, local result returned, provider signal aborted', async () => {
    const p = hanging();
    const r = await screenTextWithSecondOpinion(CONCERN_TEXT, p, { timeoutMs: 20 });
    expect(r.degraded).toBe(true);
    expect(r.level).toBe('concern');
    expect(r.immediacy).toBe(false);
    expect(r.raisedBy).toBe('local');
    expect(r.secondOpinion.status).toBe('timeout');
    expect(r.secondOpinion.result).toBeUndefined();
    expect(p.lastSignal!.aborted).toBe(true);
    expect((p.lastSignal!.reason as Error).name).toBe('TimeoutError');
    expect(r.local).toEqual(screenText(CONCERN_TEXT));
  });

  it('times out even when the provider ignores the signal', async () => {
    const p = fake(() => new Promise(() => {}));
    const r = await screenTextWithSecondOpinion(NONE_TEXT, p, { timeoutMs: 20 });
    expect(r.secondOpinion.status).toBe('timeout');
    expect(r.raisedBy).toBe('none');
  });

  it('provider rejection: degraded, with no input text anywhere outside local spans', async () => {
    const p = fake(async (text) => {
      throw new Error(`provider failed on: ${text}`);
    });
    const r = await screenTextWithSecondOpinion(CRISIS_TEXT, p);
    expect(r.degraded).toBe(true);
    expect(r.level).toBe('crisis');
    expect(r.raisedBy).toBe('local');
    expect(r.secondOpinion.status).toBe('error');
    expect(r.secondOpinion.reason).toBe('provider threw or rejected');
    expect(JSON.stringify(r)).not.toContain(MARKER);
    expect(JSON.stringify(r)).not.toContain('provider failed on');
  });

  it('synchronous provider throw: degraded, with no input text', async () => {
    const p: CrisisSecondOpinion = {
      name: 'sync-thrower',
      version: '0.0.1',
      assess(text) {
        throw new Error(text);
      },
    };
    const r = await screenTextWithSecondOpinion(NONE_TEXT, p);
    expect(r.secondOpinion.status).toBe('error');
    expect(r.degraded).toBe(true);
    expect(JSON.stringify(r)).not.toContain(MARKER);
  });

  it.each([
    ['an unknown level', { level: 'high' }],
    ['a missing level', { providerScores: {} }],
    ['null', null],
    ['a string', 'crisis'],
    ['an array', [{ level: 'crisis' }]],
    ['a non-boolean immediacy', { level: 'crisis', immediacy: 'yes' }],
    ['an unknown subject', { level: 'crisis', subject: 'them' }],
    ['non-object providerScores', { level: 'concern', providerScores: [1] }],
    ['a non-finite score', { level: 'concern', providerScores: { a: Number.NaN } }],
    ['an object score', { level: 'concern', providerScores: { a: {} } }],
  ])('invalid result (%s): degraded and invalid', async (_label, value) => {
    const r = await screenTextWithSecondOpinion(NONE_TEXT, returning(value));
    expect(r.degraded).toBe(true);
    expect(r.level).toBe('none');
    expect(r.secondOpinion.status).toBe('invalid');
    expect(r.secondOpinion.result).toBeUndefined();
    expect(typeof r.secondOpinion.reason).toBe('string');
  });

  it('an invalid result that echoes the input is not passed on', async () => {
    const r = await screenTextWithSecondOpinion(CRISIS_TEXT, fake(async (text) => ({ level: 'severe', raw: text })));
    expect(r.secondOpinion.status).toBe('invalid');
    expect(JSON.stringify(r)).not.toContain(MARKER);
  });

  it('copies only the interface fields of a valid result', async () => {
    const r = await screenTextWithSecondOpinion(
      NONE_TEXT,
      returning({ level: 'concern', subject: 'unknown', raw: { x: 1 }, explanation: 'free text' }),
    );
    expect(r.secondOpinion.result).toEqual({ level: 'concern', subject: 'unknown', raw: { x: 1 } });
  });

  it('caller abort rejects with an AbortError (no text) and aborts the provider signal', async () => {
    const p = hanging();
    const controller = new AbortController();
    const pending = screenTextWithSecondOpinion(CRISIS_TEXT, p, { signal: controller.signal, timeoutMs: 5000 });
    setTimeout(() => controller.abort(), 5);
    const err = await pending.then(
      () => {
        throw new Error('expected rejection');
      },
      (e: unknown) => e as Error,
    );
    expect(err.name).toBe('AbortError');
    expect(err.message).not.toContain(MARKER);
    expect(p.lastSignal!.aborted).toBe(true);
  });

  it('an already-aborted signal rejects without calling the provider', async () => {
    const p = returning({ level: 'crisis' });
    const controller = new AbortController();
    controller.abort();
    await expect(screenTextWithSecondOpinion(NONE_TEXT, p, { signal: controller.signal })).rejects.toMatchObject({
      name: 'AbortError',
    });
    expect(p.calls).toBe(0);
  });

  it('passes screenText options through to the local screen', async () => {
    const text = 'This commute is killing me.';
    const r = await screenTextWithSecondOpinion(text, returning({ level: 'none' }), { suppressIdioms: false });
    expect(r.local).toEqual(screenText(text, { suppressIdioms: false }));
    expect(r.level).toBe('concern');
  });

  it('rejects invalid arguments with errors that contain no text', async () => {
    const ok = returning({ level: 'none' });
    await expect(screenTextWithSecondOpinion(42 as unknown as string, ok)).rejects.toBeInstanceOf(TypeError);
    await expect(screenTextWithSecondOpinion(NONE_TEXT, {} as CrisisSecondOpinion)).rejects.toBeInstanceOf(TypeError);
    await expect(
      screenTextWithSecondOpinion(NONE_TEXT, { name: 1, version: '1', assess: ok.assess } as unknown as CrisisSecondOpinion),
    ).rejects.toBeInstanceOf(TypeError);
    for (const timeoutMs of [0, -1, Number.NaN, Infinity]) {
      await expect(screenTextWithSecondOpinion(NONE_TEXT, ok, { timeoutMs })).rejects.toBeInstanceOf(RangeError);
    }
    await expect(
      screenTextWithSecondOpinion(NONE_TEXT, ok, { signal: {} as AbortSignal }),
    ).rejects.toBeInstanceOf(TypeError);
    const err = await screenTextWithSecondOpinion(NONE_TEXT, null as unknown as CrisisSecondOpinion).catch((e: Error) => e);
    expect((err as Error).message).not.toContain(MARKER);
  });

  it('defaults the timeout to 10 seconds', () => {
    expect(DEFAULT_SECOND_OPINION_TIMEOUT_MS).toBe(10000);
  });
});
