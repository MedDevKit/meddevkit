import { describe, it, expect } from 'vitest';
import { parseNopeOutput, NopeEdgeError, NOPE_RISK_TYPES, MAX_OUTPUT_CHARS } from '../src';
import type { NopeRisk } from '../src';
import { INPUT_MARKER, REFLECTION_MARKER, expectNoLeak, nopeOutput, risksXml } from './helpers';

/** The card's own example answer (model card "Usage" output). */
const CARD_EXAMPLE = `<reflection>The user directly expresses intent to end their life with a specific timeline ("tonight"), indicating acute suicidal ideation with imminent risk.</reflection>
<risks>
  <risk subject="self" type="suicide" severity="high" imminence="urgent"/>
</risks>`;

function parseFails(output: string): NopeEdgeError {
  let caught: unknown;
  try {
    parseNopeOutput(output);
  } catch (err) {
    caught = err;
  }
  expect(caught).toBeInstanceOf(NopeEdgeError);
  const err = caught as NopeEdgeError;
  expect(err.code).toBe('ParseError');
  expectNoLeak(err);
  return err;
}

describe('parseNopeOutput: documented format', () => {
  it('parses the model card example', () => {
    expect(parseNopeOutput(CARD_EXAMPLE)).toEqual<NopeRisk[]>([
      { subject: 'self', type: 'suicide', severity: 'high', imminence: 'urgent' },
    ]);
  });

  it('keeps features as labels (informational only)', () => {
    const out = nopeOutput(
      risksXml({ subject: 'self', type: 'suicide', severity: 'high', imminence: 'urgent', features: 'active_ideation,intent_stated' })
    );
    expect(parseNopeOutput(out)[0].features).toEqual(['active_ideation', 'intent_stated']);
  });

  it('returns no risks for an empty <risks/> in any spelling', () => {
    for (const empty of ['<risks/>', '<risks />', '<risks></risks>', '<risks>\n  </risks>', '<RISKS/>']) {
      expect(parseNopeOutput(nopeOutput(empty))).toEqual([]);
    }
  });

  it('parses multiple risks in order', () => {
    const out = nopeOutput(
      risksXml(
        { subject: 'self', type: 'self_harm', severity: 'moderate', imminence: 'chronic' },
        { subject: 'other', type: 'violence', severity: 'high', imminence: 'urgent' },
        { subject: 'unknown', type: 'self_neglect', severity: 'mild', imminence: 'subacute' }
      )
    );
    expect(parseNopeOutput(out)).toEqual([
      { subject: 'self', type: 'self_harm', severity: 'moderate', imminence: 'chronic' },
      { subject: 'other', type: 'violence', severity: 'high', imminence: 'urgent' },
      { subject: 'unknown', type: 'self_neglect', severity: 'mild', imminence: 'subacute' },
    ]);
  });

  it('accepts all 9 documented types', () => {
    const out = nopeOutput(risksXml(...NOPE_RISK_TYPES.map((type) => ({ subject: 'self', type, severity: 'mild' }))));
    expect(parseNopeOutput(out).map((r) => r.type)).toEqual([...NOPE_RISK_TYPES]);
    expect(NOPE_RISK_TYPES).toHaveLength(9);
  });

  it('never returns the reflection', () => {
    const risks = parseNopeOutput(nopeOutput(risksXml({ subject: 'self', type: 'suicide', severity: 'high' })));
    expect(JSON.stringify(risks)).not.toContain(REFLECTION_MARKER);
    expect(JSON.stringify(risks)).not.toContain(INPUT_MARKER);
  });
});

describe('parseNopeOutput: dropping non-risks (as NOPE’s parser does)', () => {
  it('drops a type outside the 9, including type="none"', () => {
    const out = nopeOutput(
      risksXml(
        { subject: 'self', type: 'none', severity: 'none' },
        { subject: 'self', type: 'harassment', severity: 'high' },
        { subject: 'self', type: 'self-harm', severity: 'high' },
        { subject: 'self', severity: 'high' },
        { subject: 'self', type: 'suicide', severity: 'mild' }
      )
    );
    expect(parseNopeOutput(out)).toEqual([{ subject: 'self', type: 'suicide', severity: 'mild', imminence: 'not_applicable' }]);
  });

  it('drops a real type with severity="none" or no severity', () => {
    const out = nopeOutput(
      risksXml({ subject: 'self', type: 'suicide', severity: 'none', imminence: 'urgent' }, { subject: 'self', type: 'self_harm' })
    );
    expect(parseNopeOutput(out)).toEqual([]);
  });

  it('normalises unknown attribute values instead of passing model text through', () => {
    const out = nopeOutput(
      risksXml(
        { subject: 'my friend', type: 'suicide', severity: 'severe', imminence: 'soon' },
        { type: 'self_harm', severity: '' }
      )
    );
    expect(parseNopeOutput(out)).toEqual([
      { subject: 'unknown', type: 'suicide', severity: 'unrecognised', imminence: 'unrecognised' },
      { subject: 'unknown', type: 'self_harm', severity: 'unrecognised', imminence: 'not_applicable' },
    ]);
  });

  it('keeps only label-like features', () => {
    const out = nopeOutput(
      `<risks><risk subject="self" type="suicide" severity="high" features="active_ideation, quotes the user ${INPUT_MARKER}, Plan, intent_stated"/></risks>`
    );
    const [risk] = parseNopeOutput(out);
    expect(risk.features).toEqual(['active_ideation', 'plan', 'intent_stated']);

    const none = parseNopeOutput(nopeOutput('<risks><risk subject="self" type="suicide" severity="high" features="  "/></risks>'));
    expect(none[0].features).toBeUndefined();
  });
});

describe('parseNopeOutput: robustness', () => {
  it('handles code fences', () => {
    const fenced = '```xml\n' + CARD_EXAMPLE + '\n```';
    expect(parseNopeOutput(fenced)).toHaveLength(1);
    expect(parseNopeOutput('```\n<risks/>\n```')).toEqual([]);
  });

  it('ignores a <think> block, even one that mentions <risk> elements', () => {
    const out = `<think>\nMaybe <risk subject="self" type="suicide" severity="critical"/>? No, it is slang.\n</think>\n\n${nopeOutput('<risks/>')}`;
    expect(parseNopeOutput(out)).toEqual([]);
  });

  it('keeps only the answer after a stray </think> (opening tag stripped by the server)', () => {
    const out = `reasoning about <risks/> here\n</think>\n\n${CARD_EXAMPLE}`;
    expect(parseNopeOutput(out)).toHaveLength(1);
  });

  it('ignores <risk> text quoted inside the reflection', () => {
    const out = `<reflection>Not a <risk subject="self" type="suicide" severity="high"/>, just a quote. ${REFLECTION_MARKER}</reflection>\n<risks/>`;
    expect(parseNopeOutput(out)).toEqual([]);
  });

  it('tolerates missing and extra whitespace, single quotes and upper case', () => {
    const out = `<reflection>x</reflection><RISKS ><Risk subject = 'SELF'\n   TYPE="Suicide"severity="Moderate"   imminence="Emergency" / ></risks >`;
    expect(parseNopeOutput(out)).toEqual([{ subject: 'self', type: 'suicide', severity: 'moderate', imminence: 'emergency' }]);
  });

  it('accepts <risk ...></risk> pairs', () => {
    const out = '<risks><risk subject="other" type="self_harm" severity="moderate" imminence="chronic"></risk></risks>';
    expect(parseNopeOutput(out)).toEqual([{ subject: 'other', type: 'self_harm', severity: 'moderate', imminence: 'chronic' }]);
  });

  it('accepts bare <risk> elements without a <risks> wrapper (as NOPE’s parser does)', () => {
    const out = '<reflection>x</reflection>\n<risk subject="self" type="self_harm" severity="mild"/>';
    expect(parseNopeOutput(out)).toEqual([{ subject: 'self', type: 'self_harm', severity: 'mild', imminence: 'not_applicable' }]);
  });

  it('reads risks after an unclosed reflection', () => {
    const out = `<reflection>The user says ${INPUT_MARKER}\n<risks><risk subject="self" type="suicide" severity="high"/></risks>`;
    expect(parseNopeOutput(out)).toHaveLength(1);
  });

  it('collects risks from more than one <risks> block', () => {
    const out = '<risks><risk subject="self" type="suicide" severity="mild"/></risks>\n<risks><risk subject="self" type="self_harm" severity="high"/></risks>';
    expect(parseNopeOutput(out).map((r) => r.type)).toEqual(['suicide', 'self_harm']);
  });
});

describe('parseNopeOutput: malformed output throws (never "no risk")', () => {
  it('empty output', () => {
    expect(parseFails('').message).toBe('nope-edge: model output has no <risks> element');
    parseFails('   \n ');
  });

  it('prose with no XML', () => {
    parseFails(`I can't help with that. ${INPUT_MARKER} ${REFLECTION_MARKER}`);
  });

  it('a reflection only (cut off before <risks>)', () => {
    parseFails(`<reflection>The user wrote ${INPUT_MARKER} ${REFLECTION_MARKER}`);
    parseFails(nopeOutput(''));
  });

  it('an unterminated <risks>', () => {
    const err = parseFails(nopeOutput('<risks>\n  <risk subject="self" type="suicide" severity="high"/>\n'));
    expect(err.message).toBe('nope-edge: model output has an unterminated <risks> element');
  });

  it('a truncated or broken <risk> element', () => {
    const err = parseFails(nopeOutput('<risks>\n  <risk subject="self" type="suicide" severity="hi\n</risks>'));
    expect(err.message).toBe('nope-edge: model output has a malformed <risk> element');
    parseFails(nopeOutput('<risk subject="self" type="suicide"'));
  });

  it('an unclosed <think> (reasoning never finished)', () => {
    parseFails(`<think>\nThe user said ${INPUT_MARKER}. Should I output <risks/>?`);
  });

  it('output that is too long or not a string', () => {
    parseFails('<risks/>' + ' '.repeat(MAX_OUTPUT_CHARS));
    parseFails(undefined as unknown as string);
  });
});
