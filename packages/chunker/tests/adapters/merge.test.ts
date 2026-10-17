import { describe, it, expect } from 'vitest';
import {
  mergeEntities,
  remapRelations,
  resolveNegation,
  providerNegationOf,
  type MergeInput,
} from '../../src/adapters/merge';
import type { MedicalEntity, EntityRelation } from '../../src/adapters/types';
import type { ClinicalSection, NegationContext } from '../../src/types';

const PROVIDER = 'fake-health';

function local(partial: Partial<MedicalEntity> & Pick<MedicalEntity, 'category' | 'startOffset' | 'endOffset'>): MedicalEntity {
  return {
    text: 'x'.repeat(partial.endOffset - partial.startOffset),
    confidence: 0.8,
    isNegated: false,
    sources: ['meddevkit-local'],
    ...partial,
  };
}

function prov(partial: Partial<MedicalEntity> & Pick<MedicalEntity, 'category' | 'startOffset' | 'endOffset'>): MedicalEntity {
  return {
    text: 'y'.repeat(partial.endOffset - partial.startOffset),
    confidence: 0.7,
    isNegated: false,
    sources: [PROVIDER],
    ...partial,
  };
}

function neg(startOffset: number, endOffset: number): NegationContext {
  return { negatedText: 'finding', type: 'denied', startOffset, endOffset, confidence: 0.85 };
}

function run(partial: Partial<MergeInput>) {
  return mergeEntities({
    local: [],
    negations: [],
    sections: [],
    negationPolicy: 'either',
    ...partial,
  });
}

describe('mergeEntities', () => {
  describe('provider-owned categories', () => {
    it('takes Diagnosis/SymptomOrSign/etc. from the provider', () => {
      const { entities } = run({
        provider: [
          prov({ category: 'Diagnosis', startOffset: 0, endOffset: 5, codes: [{ system: 'ICD10CM', code: 'I10' }] }),
          prov({ category: 'SymptomOrSign', startOffset: 10, endOffset: 20 }),
          prov({ category: 'Allergen', startOffset: 30, endOffset: 35 }),
        ],
      });
      expect(entities.map((e) => e.category)).toEqual(['Diagnosis', 'SymptomOrSign', 'Allergen']);
      expect(entities[0].codes).toEqual([{ system: 'ICD10CM', code: 'I10' }]);
      expect(entities.every((e) => e.sources[0] === PROVIDER)).toBe(true);
    });

    it('returns local entities unchanged in shape when there is no provider', () => {
      const l = local({ category: 'VitalSign', startOffset: 0, endOffset: 10 });
      const { entities, relations, negationDisagreements } = run({ local: [l] });
      expect(entities).toHaveLength(1);
      expect(entities[0]).not.toBe(l);
      expect(entities[0].sources).toEqual(['meddevkit-local']);
      expect(entities[0].negation).toEqual({ local: false, agreement: true });
      expect(relations).toEqual([]);
      expect(negationDisagreements).toBe(0);
    });
  });

  describe('vital signs', () => {
    it('keeps the local vital and absorbs overlapping provider measurements', () => {
      const vital = local({
        category: 'VitalSign',
        startOffset: 0,
        endOffset: 14,
        attributes: { type: 'blood_pressure', value: 120, value2: 80 },
      });
      const { entities } = run({
        local: [vital],
        provider: [
          prov({ category: 'TestName', startOffset: 0, endOffset: 2, codes: [{ system: 'UMLS', code: 'C0005823' }] }),
          prov({ category: 'MeasurementValue', startOffset: 3, endOffset: 9, codes: [{ system: 'UMLS', code: 'C0005823' }] }),
        ],
      });
      expect(entities).toHaveLength(1);
      expect(entities[0].startOffset).toBe(0);
      expect(entities[0].endOffset).toBe(14);
      expect(entities[0].attributes).toEqual(vital.attributes);
      expect(entities[0].codes).toEqual([{ system: 'UMLS', code: 'C0005823' }]);
      expect(entities[0].sources).toEqual(['meddevkit-local', PROVIDER]);
    });

    it('does not merge non-overlapping or unrelated provider entities', () => {
      const { entities } = run({
        local: [local({ category: 'VitalSign', startOffset: 0, endOffset: 10 })],
        provider: [
          prov({ category: 'MeasurementValue', startOffset: 20, endOffset: 25 }),
          prov({ category: 'Diagnosis', startOffset: 2, endOffset: 6 }),
        ],
      });
      expect(entities).toHaveLength(3);
      expect(entities[0].sources).toEqual(['meddevkit-local']);
    });
  });

  describe('medications', () => {
    it('merges into one entity with provider span/codes and local attributes', () => {
      const l = local({
        category: 'MedicationName',
        startOffset: 0,
        endOffset: 26,
        text: 'Metoprolol 25 mg PO BID',
        confidence: 0.95,
        attributes: { name: 'Metoprolol', dose: 25, unit: 'mg', route: 'oral', frequency: 'BID' },
      });
      const p = prov({
        category: 'MedicationName',
        startOffset: 0,
        endOffset: 10,
        text: 'Metoprolol',
        confidence: 0.99,
        providerCategory: 'MedicationName',
        normalizedText: 'metoprolol',
        codes: [{ system: 'RXNORM', code: '6918' }],
        assertion: { certainty: 'positive' },
        attributes: { form: 'tablet', dose: 999 },
      });
      const { entities } = run({ local: [l], provider: [p] });

      expect(entities).toHaveLength(1);
      const med = entities[0];
      expect(med.text).toBe('Metoprolol');
      expect(med.startOffset).toBe(0);
      expect(med.endOffset).toBe(10);
      expect(med.normalizedText).toBe('metoprolol');
      expect(med.providerCategory).toBe('MedicationName');
      expect(med.codes).toEqual([{ system: 'RXNORM', code: '6918' }]);
      expect(med.assertion).toEqual({ certainty: 'positive' });
      expect(med.attributes).toEqual({
        form: 'tablet',
        name: 'Metoprolol',
        dose: 25,
        unit: 'mg',
        route: 'oral',
        frequency: 'BID',
      });
      expect(med.sources).toEqual(['meddevkit-local', PROVIDER]);
      expect(med.confidence).toBe(0.99);
    });

    it('takes the higher confidence from the local side when larger', () => {
      const { entities } = run({
        local: [local({ category: 'MedicationName', startOffset: 0, endOffset: 10, confidence: 0.95 })],
        provider: [prov({ category: 'MedicationName', startOffset: 0, endOffset: 5, confidence: 0.5 })],
      });
      expect(entities[0].confidence).toBe(0.95);
    });

    it('keeps provider-only and local-only medications', () => {
      const { entities } = run({
        local: [local({ category: 'MedicationName', startOffset: 0, endOffset: 10 })],
        provider: [prov({ category: 'MedicationName', startOffset: 50, endOffset: 58 })],
      });
      expect(entities).toHaveLength(2);
      expect(entities[0].sources).toEqual(['meddevkit-local']);
      expect(entities[1].sources).toEqual([PROVIDER]);
    });

    it('keeps provider Dosage/Route/Frequency inside a merged medication', () => {
      const { entities } = run({
        local: [local({ category: 'MedicationName', startOffset: 0, endOffset: 23 })],
        provider: [
          prov({ category: 'MedicationName', startOffset: 0, endOffset: 10 }),
          prov({ category: 'Dosage', startOffset: 11, endOffset: 16 }),
          prov({ category: 'MedicationRoute', startOffset: 17, endOffset: 19 }),
          prov({ category: 'MedicationFrequency', startOffset: 20, endOffset: 23 }),
        ],
      });
      expect(entities.map((e) => e.category)).toEqual([
        'MedicationName',
        'Dosage',
        'MedicationRoute',
        'MedicationFrequency',
      ]);
    });

    it('matches only the first overlapping provider medication', () => {
      const { entities } = run({
        local: [local({ category: 'MedicationName', startOffset: 0, endOffset: 30 })],
        provider: [
          prov({ category: 'MedicationName', startOffset: 15, endOffset: 20 }),
          prov({ category: 'MedicationName', startOffset: 0, endOffset: 7 }),
        ],
      });
      expect(entities).toHaveLength(2);
      expect(entities[0]).toMatchObject({ startOffset: 0, endOffset: 7 });
      expect(entities[0].sources).toEqual(['meddevkit-local', PROVIDER]);
      expect(entities[1].sources).toEqual([PROVIDER]);
    });
  });

  describe('time and severity', () => {
    it('merges sources with an overlapping provider Time', () => {
      const { entities } = run({
        local: [local({ category: 'Time', startOffset: 5, endOffset: 15, attributes: { unit: 'day' } })],
        provider: [prov({ category: 'Time', startOffset: 9, endOffset: 15 })],
      });
      expect(entities).toHaveLength(1);
      expect(entities[0]).toMatchObject({ startOffset: 5, endOffset: 15, attributes: { unit: 'day' } });
      expect(entities[0].sources).toEqual(['meddevkit-local', PROVIDER]);
    });

    it('merges sources with an overlapping provider Severity', () => {
      const { entities } = run({
        local: [local({ category: 'Severity', startOffset: 0, endOffset: 15 })],
        provider: [
          prov({ category: 'Severity', startOffset: 0, endOffset: 6, normalizedText: 'severe' }),
          prov({ category: 'SymptomOrSign', startOffset: 7, endOffset: 15 }),
        ],
      });
      expect(entities).toHaveLength(2);
      expect(entities[0].category).toBe('Severity');
      expect(entities[0].sources).toEqual(['meddevkit-local', PROVIDER]);
      expect(entities[0].normalizedText).toBe('severe');
      expect(entities[1].category).toBe('SymptomOrSign');
    });

    it('keeps local Time/Severity when no provider match', () => {
      const { entities } = run({
        local: [
          local({ category: 'Time', startOffset: 0, endOffset: 5 }),
          local({ category: 'Severity', startOffset: 10, endOffset: 15 }),
        ],
        provider: [prov({ category: 'Time', startOffset: 20, endOffset: 25 })],
      });
      expect(entities).toHaveLength(3);
      expect(entities[0].sources).toEqual(['meddevkit-local']);
      expect(entities[1].sources).toEqual(['meddevkit-local']);
    });
  });

  describe('negation', () => {
    const negations = [neg(0, 20)];

    it("'either': negated when local OR provider says so", () => {
      const { entities, negationDisagreements } = run({
        negations,
        provider: [
          prov({ category: 'SymptomOrSign', startOffset: 5, endOffset: 15 }), // local only
          prov({ category: 'SymptomOrSign', startOffset: 30, endOffset: 40, assertion: { certainty: 'negative' } }), // provider only
          prov({ category: 'SymptomOrSign', startOffset: 50, endOffset: 60 }), // neither
        ],
      });
      expect(entities.map((e) => e.isNegated)).toEqual([true, true, false]);
      expect(entities[0].negation).toEqual({ local: true, provider: false, agreement: false });
      expect(entities[1].negation).toEqual({ local: false, provider: true, agreement: false });
      expect(entities[2].negation).toEqual({ local: false, provider: false, agreement: true });
      expect(negationDisagreements).toBe(2);
    });

    it("'provider': provider opinion wins when present, else local", () => {
      const { entities } = run({
        negations,
        negationPolicy: 'provider',
        local: [local({ category: 'VitalSign', startOffset: 2, endOffset: 4 })], // no provider data
        provider: [
          prov({ category: 'SymptomOrSign', startOffset: 5, endOffset: 15 }),
          prov({ category: 'SymptomOrSign', startOffset: 30, endOffset: 40, assertion: { certainty: 'negativePossible' } }),
        ],
      });
      expect(entities.map((e) => e.isNegated)).toEqual([true, false, true]);
      expect(entities[0].negation).toEqual({ local: true, agreement: true });
    });

    it("'local': only local negation counts", () => {
      const { entities, negationDisagreements } = run({
        negations,
        negationPolicy: 'local',
        provider: [
          prov({ category: 'SymptomOrSign', startOffset: 5, endOffset: 15 }),
          prov({ category: 'SymptomOrSign', startOffset: 30, endOffset: 40, assertion: { certainty: 'negative' } }),
        ],
      });
      expect(entities.map((e) => e.isNegated)).toEqual([true, false]);
      expect(negationDisagreements).toBe(2);
    });

    it('counts agreement when both sides say negated', () => {
      const { entities, negationDisagreements } = run({
        negations,
        provider: [prov({ category: 'SymptomOrSign', startOffset: 5, endOffset: 15, assertion: { certainty: 'negative' } })],
      });
      expect(entities[0].negation).toEqual({ local: true, provider: true, agreement: true });
      expect(negationDisagreements).toBe(0);
    });

    it('uses provider assertion on merged local entities', () => {
      const { entities } = run({
        local: [local({ category: 'MedicationName', startOffset: 30, endOffset: 50 })],
        provider: [prov({ category: 'MedicationName', startOffset: 30, endOffset: 40, assertion: { certainty: 'negative' } })],
      });
      expect(entities[0].isNegated).toBe(true);
      expect(entities[0].negation).toEqual({ local: false, provider: true, agreement: false });
    });

    it('overrides a stale isNegated on input entities', () => {
      const { entities } = run({
        local: [local({ category: 'Time', startOffset: 0, endOffset: 5, isNegated: true })],
      });
      expect(entities[0].isNegated).toBe(false);
    });
  });

  describe('sections and ordering', () => {
    it('assigns sections to every entity and sorts by start then end', () => {
      const sections: ClinicalSection[] = [
        { type: 'hpi', header: 'HPI:', startOffset: 0, confidence: 0.9 },
        { type: 'plan', header: 'Plan:', startOffset: 100, confidence: 0.9 },
      ];
      const { entities } = run({
        sections,
        local: [local({ category: 'Time', startOffset: 110, endOffset: 120 })],
        provider: [
          prov({ category: 'Diagnosis', startOffset: 10, endOffset: 30 }),
          prov({ category: 'BodyStructure', startOffset: 10, endOffset: 15 }),
          prov({ category: 'Diagnosis', startOffset: 5, endOffset: 8, section: 'labs' }),
        ],
      });
      expect(entities.map((e) => [e.startOffset, e.endOffset])).toEqual([
        [5, 8],
        [10, 15],
        [10, 30],
        [110, 120],
      ]);
      expect(entities.map((e) => e.section)).toEqual(['hpi', 'hpi', 'hpi', 'plan']);
    });

    it('removes a provider-supplied section when no local section applies', () => {
      const { entities } = run({
        provider: [prov({ category: 'Diagnosis', startOffset: 0, endOffset: 5, section: 'labs' })],
      });
      expect(entities[0].section).toBeUndefined();
    });
  });

  describe('relations', () => {
    it('remaps relation indices to final merged entities', () => {
      const relations: EntityRelation[] = [
        {
          type: 'DosageOfMedication',
          roles: [
            { role: 'Dosage', entityIndex: 0 },
            { role: 'Medication', entityIndex: 1 },
          ],
          source: PROVIDER,
        },
      ];
      const { entities, relations: out } = run({
        local: [local({ category: 'MedicationName', startOffset: 0, endOffset: 20 })],
        provider: [
          prov({ category: 'Dosage', startOffset: 11, endOffset: 16 }),
          prov({ category: 'MedicationName', startOffset: 0, endOffset: 10 }),
        ],
        relations,
      });
      expect(out).toHaveLength(1);
      const [dosage, med] = out[0].roles.map((r) => entities[r.entityIndex]);
      expect(dosage.category).toBe('Dosage');
      expect(med.category).toBe('MedicationName');
      expect(med.sources).toContain('meddevkit-local');
    });

    it('drops relations that collapse into a single merged entity', () => {
      const { relations } = run({
        local: [local({ category: 'VitalSign', startOffset: 0, endOffset: 14 })],
        provider: [
          prov({ category: 'TestName', startOffset: 0, endOffset: 2 }),
          prov({ category: 'MeasurementValue', startOffset: 3, endOffset: 9 }),
        ],
        relations: [
          {
            type: 'ValueOfExamination',
            roles: [
              { role: 'Examination', entityIndex: 0 },
              { role: 'Value', entityIndex: 1 },
            ],
            source: PROVIDER,
          },
        ],
      });
      expect(relations).toEqual([]);
    });
  });
});

describe('remapRelations', () => {
  const rel = (...idx: number[]): EntityRelation => ({
    type: 't',
    roles: idx.map((entityIndex, i) => ({ role: `r${i}`, entityIndex })),
    source: PROVIDER,
  });

  it('remaps indices and drops relations with dropped entities', () => {
    const out = remapRelations([rel(0, 1), rel(1, 2), rel(0, 5)], [3, 0, undefined]);
    expect(out).toEqual([rel(3, 0)]);
  });

  it('drops relations with non-integer indices', () => {
    expect(remapRelations([rel(0.5, 1)], [0, 1])).toEqual([]);
  });

  it('keeps single-entity relations', () => {
    expect(remapRelations([rel(1)], [0, 4])).toEqual([rel(4)]);
  });
});

describe('resolveNegation', () => {
  it.each([
    ['either', false, undefined, false, true],
    ['either', true, undefined, true, true],
    ['either', false, true, true, false],
    ['provider', true, false, false, false],
    ['provider', true, undefined, true, true],
    ['local', false, true, false, false],
  ] as const)('%s local=%s provider=%s → negated=%s agreement=%s', (policy, l, p, isNegated, agreement) => {
    expect(resolveNegation(l, p, policy)).toEqual({ isNegated, agreement });
  });
});

describe('providerNegationOf', () => {
  const base = prov({ category: 'Diagnosis', startOffset: 0, endOffset: 1 });

  it('reads negative certainties as negated', () => {
    expect(providerNegationOf({ ...base, assertion: { certainty: 'negative' } })).toBe(true);
    expect(providerNegationOf({ ...base, assertion: { certainty: 'negativePossible' } })).toBe(true);
  });

  it('reads other certainties as not negated, even if isNegated is set', () => {
    expect(providerNegationOf({ ...base, isNegated: true, assertion: { certainty: 'positive' } })).toBe(false);
    expect(providerNegationOf({ ...base, assertion: { certainty: 'neutralPossible' } })).toBe(false);
  });

  it('falls back to isNegated when there is no certainty', () => {
    expect(providerNegationOf({ ...base, isNegated: true })).toBe(true);
    expect(providerNegationOf({ ...base, assertion: { association: 'other' } })).toBe(false);
  });
});
