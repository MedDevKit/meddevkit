/**
 * scripts/eval.mjs: local-only versus combined metrics, against the local
 * HTTP mock. Synthetic vectors only (never the held-out files).
 */
import { describe, it, expect, afterEach } from 'vitest';
import { screenTextWithSecondOpinion } from '@meddevkit/crisis-signals';
import { NopeEdgeAdapter } from '../src';
// @ts-expect-error plain .mjs script without type declarations
import { evaluate, metrics, formatReport, parseVectors, wilson } from '../scripts/eval.mjs';
import { INPUT_MARKER, REFLECTION_MARKER, nopeOutput, risksXml, startMockServer, userText, type MockServer } from './helpers';

const OBLIQUE = 'OBLIQUE';
const vectors = [
  { id: 'c1', group: 'crisis_positive', text: 'I keep thinking about ending it.' },
  { id: 'c2', group: 'crisis_positive', text: `I gave my things away this week. ${OBLIQUE} ${INPUT_MARKER}` },
  { id: 'k1', group: 'concern_positive', text: "I can't cope with any of this." },
  { id: 'g1', group: 'grief_negative', text: `My grandmother died last spring and I miss her. ${INPUT_MARKER}` },
  { id: 'i1', group: 'idiom_negative', text: `This commute is killing me. ${INPUT_MARKER}` },
  { id: 'e1', group: 'everyday_negative', text: `The weather was nice today. ${OBLIQUE}-FAIL ${INPUT_MARKER}` },
];

let server: MockServer | undefined;
afterEach(async () => {
  await server?.close();
  server = undefined;
});

describe('scripts/eval.mjs', () => {
  it('wilson matches the core metrics script', () => {
    const [lo, hi] = wilson(15, 31);
    expect(lo).toBeCloseTo(0.32, 2);
    expect(hi).toBeCloseTo(0.652, 2);
    expect(wilson(0, 0).every(Number.isNaN)).toBe(true);
  });

  it('parseVectors reports a bad line by number only', () => {
    expect(parseVectors('{"id":"a"}\n\n{"id":"b"}\n')).toEqual([{ id: 'a' }, { id: 'b' }]);
    expect(() => parseVectors(`{"id":"a"}\n{${INPUT_MARKER}`)).toThrow(/^line 2: not valid JSON$/);
  });

  it('scores local-only versus combined metrics and never prints text', async () => {
    server = await startMockServer((req) => {
      const text = userText(req);
      if (text.includes(`${OBLIQUE}-FAIL`)) return { content: `garbage ${REFLECTION_MARKER}` };
      if (text.includes(OBLIQUE)) {
        return { content: nopeOutput(risksXml({ subject: 'self', type: 'suicide', severity: 'high', imminence: 'chronic' })) };
      }
      return { content: nopeOutput('<risks/>') };
    });
    const adapter = new NopeEdgeAdapter({ baseUrl: server.baseUrl, model: 'nope-edge', retries: 0 });
    const progress: number[] = [];
    const rows = await evaluate(vectors, {
      screenTextWithSecondOpinion,
      adapter,
      timeoutMs: 2000,
      onProgress: (done: number) => progress.push(done),
    });
    expect(progress).toEqual([1, 2, 3, 4, 5, 6]);
    expect(server.requests).toHaveLength(vectors.length);

    const byId = Object.fromEntries(rows.map((r: { id: string }) => [r.id, r]));
    expect(byId.c2).toMatchObject({ local: 'none', combined: 'crisis', status: 'ok', raisedBy: 'secondOpinion' });
    expect(byId.e1).toMatchObject({ local: 'none', combined: 'none', status: 'error', degraded: true });

    const m = metrics(rows);
    const crisis = m.find((x: { name: string }) => x.name === 'Crisis recall');
    expect(crisis.local).toMatchObject({ k: 1, n: 2, offenders: ['c2'] });
    expect(crisis.combined).toMatchObject({ k: 2, n: 2, offenders: [] });
    const anyFlag = m.find((x: { name: string }) => x.name === 'Any-flag recall');
    expect(anyFlag.local).toMatchObject({ k: 2, n: 3 });
    expect(anyFlag.combined).toMatchObject({ k: 3, n: 3 });
    const grief = m.find((x: { name: string }) => x.name === 'Grief false-alarm rate');
    expect(grief.combined).toMatchObject({ k: 0, n: 1 });
    const idiom = m.find((x: { name: string }) => x.name === 'Idiom + everyday false-alarm rate');
    expect(idiom.combined).toMatchObject({ k: 0, n: 2 });

    const report = formatReport(rows, { file: 'synthetic.jsonl', model: 'nope-edge', adapterVersion: '0.1.0', patternsVersion: 'x' });
    expect(report).toContain('Crisis recall');
    expect(report).toContain('local only: 1/2');
    expect(report).toContain('combined:   2/2');
    expect(report).toContain('Second opinion: ok 5, error 1; degraded 1/6');
    expect(report).toContain('c2 [crisis_positive]: none -> crisis');
    for (const v of vectors) expect(report).not.toContain(v.text);
    expect(report).not.toContain(INPUT_MARKER);
    expect(report).not.toContain(REFLECTION_MARKER);
  });
});
