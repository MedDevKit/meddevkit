import { describe, it, expect } from 'vitest';
import {
  LocalAdapter,
  extractLocalEntities,
  LOCAL_ADAPTER_NAME,
  overlapsNegation,
} from '../../src/adapters/LocalAdapter';
import type { NegationContext } from '../../src/types';

const adapter = new LocalAdapter();

describe('LocalAdapter', () => {
  describe('identity and capabilities', () => {
    it('has the expected name, capabilities and cost', async () => {
      expect(adapter.name).toBe('meddevkit-local');
      expect(adapter.version).toMatch(/^\d+\.\d+\.\d+$/);
      expect(adapter.capabilities).toMatchObject({
        entityExtraction: false,
        negationDetection: true,
        assertionDetection: false,
        relationExtraction: false,
        ontologyLinking: false,
        phiDetection: false,
        offline: true,
        requiresNetwork: false,
      });
      expect(await adapter.isAvailable()).toBe(true);
      expect(adapter.estimateCost()).toEqual({
        units: 0,
        unitType: 'documents',
        estimatedCost: 0,
        currency: 'USD',
      });
    });
  });

  describe('vital signs', () => {
    it('maps vitals to VitalSign entities with parsed attributes', async () => {
      const text = 'BP 120/80 mmHg, HR 72 bpm';
      const { entities } = await adapter.analyze(text);
      const bp = entities.find((e) => e.attributes?.type === 'blood_pressure');

      expect(bp).toBeDefined();
      expect(bp!.category).toBe('VitalSign');
      expect(bp!.text).toBe('BP 120/80 mmHg');
      expect(bp!.text).toBe(text.slice(bp!.startOffset, bp!.endOffset));
      expect(bp!.attributes).toEqual({
        type: 'blood_pressure',
        value: 120,
        value2: 80,
        unit: 'mmHg',
      });
      expect(bp!.confidence).toBe(0.9);
      expect(bp!.sources).toEqual([LOCAL_ADAPTER_NAME]);

      const hr = entities.find((e) => e.attributes?.type === 'heart_rate');
      expect(hr!.attributes).not.toHaveProperty('value2');
    });
  });

  describe('medications', () => {
    it('maps medications to MedicationName spanning the full mention', async () => {
      const text = 'Lisinopril 10 mg PO daily';
      const { entities } = await adapter.analyze(text);
      const med = entities.find((e) => e.category === 'MedicationName');

      expect(med).toBeDefined();
      expect(med!.text).toBe('Lisinopril 10 mg PO daily');
      expect(med!.attributes).toMatchObject({
        name: 'Lisinopril',
        dose: 10,
        unit: 'mg',
        route: 'oral',
        frequency: 'daily',
      });
      expect(med!.confidence).toBeGreaterThan(0);
      expect(med!.isNegated).toBe(false);
      expect(med!.negation).toEqual({ local: false, agreement: true });
    });

    it('flags a medication inside a negation span', async () => {
      const text = 'No metoprolol 25 mg PO BID.';
      const { entities } = await adapter.analyze(text);
      const med = entities.find((e) => e.category === 'MedicationName');

      expect(med!.isNegated).toBe(true);
      expect(med!.negation).toEqual({ local: true, agreement: true });
    });
  });

  describe('temporal and severity', () => {
    it('maps temporal expressions to Time', async () => {
      const { entities } = await adapter.analyze('Headache for 3 days.');
      const time = entities.find((e) => e.category === 'Time');

      expect(time).toBeDefined();
      expect(time!.text).toBe('for 3 days');
      expect(time!.attributes).toEqual({ type: 'duration', value: 3, unit: 'day' });
    });

    it('maps severity modifiers to Severity', async () => {
      const { entities } = await adapter.analyze('Severe headache.');
      const sev = entities.find((e) => e.category === 'Severity');

      expect(sev).toBeDefined();
      expect(sev!.attributes).toMatchObject({ level: 'severe', term: 'Severe' });
      expect(sev!.isNegated).toBe(false);
    });

    it('flags severity inside a denial as negated', async () => {
      const { entities } = await adapter.analyze('Patient denies severe chest pain.');
      const sev = entities.find((e) => e.category === 'Severity');

      expect(sev).toBeDefined();
      expect(sev!.isNegated).toBe(true);
    });
  });

  describe('sections and ordering', () => {
    it('assigns the section containing the entity start', async () => {
      const text = 'HPI: Severe headache for 3 days.\nMedications: Lisinopril 10 mg PO daily\nVitals: BP 120/80 mmHg';
      const { entities } = await adapter.analyze(text);

      expect(entities.find((e) => e.category === 'Severity')!.section).toBe('hpi');
      expect(entities.find((e) => e.category === 'MedicationName')!.section).toBe('medications');
      expect(entities.find((e) => e.category === 'VitalSign')!.section).toBe('vitals');
    });

    it('leaves section unset when no section precedes the entity', async () => {
      const { entities } = await adapter.analyze('BP 120/80 mmHg');
      expect(entities[0].section).toBeUndefined();
    });

    it('sorts entities by startOffset', async () => {
      const text = 'Severe headache for 3 days. Lisinopril 10 mg PO daily. BP 120/80 mmHg';
      const { entities } = await adapter.analyze(text);
      const starts = entities.map((e) => e.startOffset);
      expect(starts).toEqual([...starts].sort((a, b) => a - b));
      expect(entities.length).toBeGreaterThanOrEqual(4);
    });
  });

  describe('negative cases', () => {
    it('returns no entities for text without patterns', async () => {
      const result = await adapter.analyze('The patient is here for follow up.');
      expect(result.entities).toEqual([]);
      expect(result.processingTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('returns no entities for empty text', async () => {
      expect((await adapter.analyze('')).entities).toEqual([]);
    });

    it('rejects when the signal is already aborted', async () => {
      const controller = new AbortController();
      controller.abort();
      await expect(adapter.analyze('BP 120/80', { signal: controller.signal })).rejects.toThrow();
    });
  });

  describe('extractLocalEntities', () => {
    it('uses precomputed sections and negations when provided', () => {
      const text = 'Lisinopril 10 mg PO daily';
      const entities = extractLocalEntities(text, {
        sections: [{ type: 'plan', header: 'Plan', startOffset: 0, confidence: 1 }],
        negations: [
          { negatedText: 'x', type: 'absent', startOffset: 0, endOffset: 5, confidence: 1 },
        ],
      });
      expect(entities[0].section).toBe('plan');
      expect(entities[0].isNegated).toBe(true);
    });
  });

  describe('overlapsNegation', () => {
    // "Patient appears in no acute distress." -> span [19,36) "no acute distress"
    const span: NegationContext[] = [
      { negatedText: 'acute distress', type: 'absent', startOffset: 19, endOffset: 36, confidence: 0.85 },
    ];
    const cueAware = { ignoreCueInside: true };

    it('plain overlap (default) applies whenever the spans overlap', () => {
      expect(overlapsNegation(19, 36, span)).toBe(true);
      expect(overlapsNegation(10, 36, span)).toBe(true);
      expect(overlapsNegation(22, 36, span)).toBe(true);
    });

    it('ignoreCueInside ignores a negation whose cue lies inside the entity', () => {
      expect(overlapsNegation(19, 36, span, cueAware)).toBe(false); // "no acute distress"
      expect(overlapsNegation(10, 36, span, cueAware)).toBe(false); // entity starts before the cue
    });

    it('ignoreCueInside ignores the negation when the entity starts exactly at the cue start', () => {
      expect(overlapsNegation(19, 21, span, cueAware)).toBe(false);
    });

    it('ignoreCueInside applies the negation when the entity starts one char after the cue start', () => {
      expect(overlapsNegation(20, 36, span, cueAware)).toBe(true);
    });

    it('ignoreCueInside applies the negation when the cue is outside the entity', () => {
      expect(overlapsNegation(22, 36, span, cueAware)).toBe(true); // "acute distress"
    });

    it('does not apply a negation that does not overlap, in either mode', () => {
      expect(overlapsNegation(0, 19, span)).toBe(false);
      expect(overlapsNegation(36, 40, span)).toBe(false);
      expect(overlapsNegation(0, 19, span, cueAware)).toBe(false);
      expect(overlapsNegation(36, 40, span, cueAware)).toBe(false);
    });
  });
});
