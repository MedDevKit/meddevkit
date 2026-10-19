import { describe, it, expect } from 'vitest';
import { mapNopeRisks, riskLevel, riskImmediacy, parseNopeOutput } from '../src';
import type { NopeRisk, NopeImminence, NopeRiskType, NopeSeverity, NopeSubject } from '../src';
import { INPUT_MARKER, REFLECTION_MARKER, nopeOutput, risksXml } from './helpers';

const risk = (
  type: NopeRiskType,
  subject: NopeSubject,
  severity: NopeSeverity,
  imminence: NopeImminence = 'not_applicable'
): NopeRisk => ({ type, subject, severity, imminence });

describe('mapping table (README "Mapping")', () => {
  const rows: [NopeRiskType[], NopeSubject[], NopeSeverity[], 'none' | 'concern' | 'crisis'][] = [
    [['suicide', 'self_harm'], ['self'], ['moderate', 'high', 'critical'], 'crisis'],
    [['suicide', 'self_harm'], ['self'], ['mild', 'unrecognised'], 'concern'],
    [['suicide', 'self_harm'], ['other'], ['mild', 'moderate', 'high', 'critical', 'unrecognised'], 'concern'],
    [['suicide', 'self_harm'], ['unknown'], ['mild', 'moderate', 'high', 'critical', 'unrecognised'], 'concern'],
    [['self_neglect'], ['self', 'other', 'unknown'], ['mild', 'moderate', 'high', 'critical', 'unrecognised'], 'concern'],
    [
      ['violence', 'abuse', 'sexual_violence', 'exploitation', 'stalking', 'neglect'],
      ['self', 'other', 'unknown'],
      ['mild', 'moderate', 'high', 'critical', 'unrecognised'],
      'none',
    ],
  ];

  for (const [types, subjects, severities, expected] of rows) {
    it(`${types.join('/')} + subject ${subjects.join('/')} + severity ${severities.join('/')} -> ${expected}`, () => {
      for (const type of types) {
        for (const subject of subjects) {
          for (const severity of severities) {
            const r = risk(type, subject, severity);
            expect(riskLevel(r), `${type}/${subject}/${severity}`).toBe(expected);
            const mapped = mapNopeRisks([r]);
            expect(mapped.level).toBe(expected);
            if (expected === 'none') expect(mapped.subject).toBeUndefined();
            else expect(mapped.subject).toBe(subject);
          }
        }
      }
    });
  }

  it('<risks/> maps to none with no subject and no immediacy', () => {
    expect(mapNopeRisks([])).toEqual({ level: 'none', immediacy: false, providerScores: { risks: 0 }, raw: { risks: [] } });
  });

  it('subject other never reaches crisis (Q-A2) and unknown never reaches crisis (Q-A3)', () => {
    expect(mapNopeRisks([risk('suicide', 'other', 'critical', 'emergency')])).toMatchObject({ level: 'concern', subject: 'other' });
    expect(mapNopeRisks([risk('suicide', 'unknown', 'critical', 'emergency')])).toMatchObject({ level: 'concern', subject: 'unknown' });
  });

  it('risk to others raises nothing but is recorded in providerScores', () => {
    const r = mapNopeRisks([risk('violence', 'other', 'critical', 'emergency'), risk('abuse', 'self', 'high', 'urgent')]);
    expect(r.level).toBe('none');
    expect(r.immediacy).toBe(false);
    expect(r.subject).toBeUndefined();
    expect(r.providerScores).toEqual({
      risks: 2,
      'risk.0.type': 'violence',
      'risk.0.subject': 'other',
      'risk.0.severity': 'critical',
      'risk.0.imminence': 'emergency',
      'risk.1.type': 'abuse',
      'risk.1.subject': 'self',
      'risk.1.severity': 'high',
      'risk.1.imminence': 'urgent',
    });
  });
});

describe('combining several risks', () => {
  it('takes the highest level', () => {
    expect(mapNopeRisks([risk('self_neglect', 'self', 'high'), risk('suicide', 'self', 'moderate')]).level).toBe('crisis');
    expect(mapNopeRisks([risk('violence', 'self', 'high'), risk('self_harm', 'self', 'mild')]).level).toBe('concern');
  });

  it('reports the subject of the deciding risk, preferring self, then unknown, then other', () => {
    expect(mapNopeRisks([risk('suicide', 'other', 'high'), risk('suicide', 'self', 'moderate')]).subject).toBe('self');
    expect(mapNopeRisks([risk('suicide', 'other', 'high'), risk('self_harm', 'unknown', 'mild')]).subject).toBe('unknown');
    expect(mapNopeRisks([risk('suicide', 'unknown', 'high'), risk('self_harm', 'self', 'mild')]).subject).toBe('self');
    expect(mapNopeRisks([risk('suicide', 'other', 'high'), risk('self_neglect', 'other', 'mild')]).subject).toBe('other');
    // A self crisis outranks an earlier other concern
    expect(mapNopeRisks([risk('suicide', 'other', 'critical'), risk('self_harm', 'self', 'high')])).toMatchObject({
      level: 'crisis',
      subject: 'self',
    });
  });
});

describe('immediacy', () => {
  it('is true for suicide/self_harm with imminence urgent or emergency, unless the subject is other', () => {
    for (const imminence of ['urgent', 'emergency'] as const) {
      expect(mapNopeRisks([risk('suicide', 'self', 'high', imminence)]).immediacy).toBe(true);
      expect(mapNopeRisks([risk('self_harm', 'self', 'moderate', imminence)]).immediacy).toBe(true);
      expect(mapNopeRisks([risk('suicide', 'unknown', 'high', imminence)]).immediacy).toBe(true);
      expect(mapNopeRisks([risk('suicide', 'other', 'high', imminence)]).immediacy).toBe(false);
    }
  });

  it('is false for other imminence values and other types', () => {
    for (const imminence of ['not_applicable', 'chronic', 'subacute', 'unrecognised'] as const) {
      expect(riskImmediacy(risk('suicide', 'self', 'critical', imminence))).toBe(false);
    }
    expect(riskImmediacy(risk('self_neglect', 'self', 'critical', 'emergency'))).toBe(false);
    expect(riskImmediacy(risk('violence', 'self', 'critical', 'emergency'))).toBe(false);
  });

  it('comes from any qualifying risk, not only the deciding one', () => {
    const r = mapNopeRisks([risk('suicide', 'self', 'high', 'chronic'), risk('self_harm', 'unknown', 'mild', 'urgent')]);
    expect(r).toMatchObject({ level: 'crisis', subject: 'self', immediacy: true });
  });
});

describe('result content', () => {
  it('providerScores has type, subject, severity and imminence per risk', () => {
    const r = mapNopeRisks([risk('suicide', 'self', 'high', 'urgent')]);
    expect(r.providerScores).toEqual({
      risks: 1,
      'risk.0.type': 'suicide',
      'risk.0.subject': 'self',
      'risk.0.severity': 'high',
      'risk.0.imminence': 'urgent',
    });
  });

  it('raw holds the parsed risks only, never the reflection; features never change the level', () => {
    const output = nopeOutput(
      risksXml({ subject: 'self', type: 'self_harm', severity: 'mild', imminence: 'chronic', features: 'active_ideation,plan,intent_stated' })
    );
    const r = mapNopeRisks(parseNopeOutput(output));
    expect(r.level).toBe('concern');
    expect(r.raw).toEqual({
      risks: [{ subject: 'self', type: 'self_harm', severity: 'mild', imminence: 'chronic', features: ['active_ideation', 'plan', 'intent_stated'] }],
    });
    const serialised = JSON.stringify(r);
    expect(serialised).not.toContain(REFLECTION_MARKER);
    expect(serialised).not.toContain(INPUT_MARKER);
  });

  it('raw is a copy', () => {
    const input = [{ ...risk('suicide', 'self', 'high'), features: ['plan'] }];
    const r = mapNopeRisks(input);
    (r.raw as { risks: NopeRisk[] }).risks[0].features!.push('x');
    expect(input[0].features).toEqual(['plan']);
  });
});
