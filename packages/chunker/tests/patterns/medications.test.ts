import { describe, it, expect } from 'vitest';
import {
  detectMedications,
  getMedicationProtectedRanges,
  normalizeRoute,
  MEDICATION_PATTERNS,
  MEDICATION_CONFIDENCE,
} from '../../src/patterns/medications';
import { LONG_NOTE, NOTE_WITH_MEDICATIONS } from '../fixtures/sample-notes';

describe('Medication Detection', () => {
  describe('Dose, unit, route, and frequency parsing', () => {
    it('should parse "Metoprolol 25 mg PO BID"', () => {
      const meds = detectMedications('Metoprolol 25 mg PO BID');

      expect(meds).toHaveLength(1);
      expect(meds[0]).toMatchObject({
        name: 'Metoprolol',
        raw: 'Metoprolol 25 mg PO BID',
        dose: 25,
        unit: 'mg',
        route: 'oral',
        frequency: 'BID',
        startOffset: 0,
        endOffset: 23,
        confidence: MEDICATION_CONFIDENCE.withRouteAndFrequency,
      });
    });

    it('should parse "lisinopril 10mg daily" (no space before unit)', () => {
      const meds = detectMedications('lisinopril 10mg daily');

      expect(meds).toHaveLength(1);
      expect(meds[0]).toMatchObject({
        name: 'lisinopril',
        dose: 10,
        unit: 'mg',
        frequency: 'daily',
        confidence: MEDICATION_CONFIDENCE.withRouteOrFrequency,
      });
      expect(meds[0].route).toBeUndefined();
    });

    it('should parse "aspirin 81 mg" with dose-only confidence', () => {
      const meds = detectMedications('aspirin 81 mg');

      expect(meds).toHaveLength(1);
      expect(meds[0]).toMatchObject({ name: 'aspirin', dose: 81, unit: 'mg' });
      expect(meds[0].frequency).toBeUndefined();
      expect(meds[0].confidence).toBe(MEDICATION_CONFIDENCE.doseOnly);
    });

    it('should parse "Metformin 1000mg twice daily"', () => {
      const meds = detectMedications('Metformin 1000mg twice daily');

      expect(meds[0]).toMatchObject({
        name: 'Metformin',
        dose: 1000,
        unit: 'mg',
        frequency: 'twice daily',
      });
    });

    it('should parse a two-word name "insulin glargine 20 units qHS"', () => {
      const meds = detectMedications('insulin glargine 20 units qHS');

      expect(meds[0]).toMatchObject({
        name: 'insulin glargine',
        dose: 20,
        unit: 'units',
        frequency: 'qHS',
      });
    });

    it('should parse "albuterol 2 puffs q4h prn" with compound frequency', () => {
      const meds = detectMedications('albuterol 2 puffs q4h prn');

      expect(meds[0]).toMatchObject({
        name: 'albuterol',
        dose: 2,
        unit: 'puffs',
        frequency: 'q4h prn',
      });
    });

    it('should parse "acetaminophen 650mg as needed"', () => {
      const meds = detectMedications('acetaminophen 650mg as needed');

      expect(meds[0]).toMatchObject({
        name: 'acetaminophen',
        dose: 650,
        frequency: 'as needed',
      });
    });

    it('should parse "ceftriaxone 1 g IV q24h"', () => {
      const meds = detectMedications('ceftriaxone 1 g IV q24h');

      expect(meds[0]).toMatchObject({
        name: 'ceftriaxone',
        dose: 1,
        unit: 'g',
        route: 'intravenous',
        frequency: 'q24h',
      });
    });

    it('should leave "x 10 days" out of the medication span', () => {
      const text = 'amoxicillin 500 mg PO TID x 10 days';
      const meds = detectMedications(text);

      expect(meds).toHaveLength(1);
      expect(meds[0].raw).toBe('amoxicillin 500 mg PO TID');
      expect(meds[0].frequency).toBe('TID');
    });

    it('should parse dose ranges into dose and doseMax', () => {
      const meds = detectMedications('oxycodone 1-2 tabs PO q4-6h prn');

      expect(meds[0]).toMatchObject({
        name: 'oxycodone',
        dose: 1,
        doseMax: 2,
        unit: 'tabs',
        route: 'oral',
        frequency: 'q4-6h prn',
      });
    });

    it('should parse decimals and thousands separators', () => {
      expect(detectMedications('nitroglycerin 0.4 mg SL')[0]).toMatchObject({
        dose: 0.4,
        route: 'sublingual',
      });
      expect(detectMedications('cyanocobalamin 1,000 mcg IM monthly')[0]).toMatchObject({
        dose: 1000,
        unit: 'mcg',
        route: 'intramuscular',
        frequency: 'monthly',
      });
    });

    it('should recognize additional units', () => {
      const units = [
        ['heparin 5000 units SQ', 'units'],
        ['vitamin D 2000 IU daily', 'IU'],
        ['potassium chloride 20 mEq PO', 'mEq'],
        ['lactulose 30 mL PO TID', 'mL'],
        ['timolol 1 drop BID', 'drop'],
        ['fentanyl 1 patch q72h', 'patch'],
        ['amoxicillin 1 capsule TID', 'capsule'],
      ];
      for (const [text, unit] of units) {
        const meds = detectMedications(text);
        expect(meds, text).toHaveLength(1);
        expect(meds[0].unit, text).toBe(unit);
      }
    });

    it('should strip leading verbs/stopwords from the name and adjust offsets', () => {
      const text = 'Patient takes aspirin 81 mg daily.';
      const meds = detectMedications(text);

      expect(meds).toHaveLength(1);
      expect(meds[0].name).toBe('aspirin');
      expect(meds[0].startOffset).toBe(text.indexOf('aspirin'));
      expect(text.slice(meds[0].startOffset, meds[0].endOffset)).toBe(
        'aspirin 81 mg daily'
      );
      expect(meds[0].raw).toBe('aspirin 81 mg daily');
    });

    it.each([
      ['Continue home Metoprolol 25 mg PO BID', 'Metoprolol'],
      ['Resume home Metoprolol 25 mg PO BID', 'Metoprolol'],
      ['Hold lisinopril 10 mg daily', 'lisinopril'],
      ['Restart aspirin 81 mg daily', 'aspirin'],
      ['Stopped atorvastatin 40 mg', 'atorvastatin'],
      ['Discontinued metformin 500 mg BID', 'metformin'],
      ['New amlodipine 5 mg daily', 'amlodipine'],
      ['Current sertraline 50 mg daily', 'sertraline'],
    ])('should strip "home"/management words in "%s"', (text, name) => {
      const meds = detectMedications(text);

      expect(meds).toHaveLength(1);
      expect(meds[0].name).toBe(name);
      expect(text.slice(meds[0].startOffset, meds[0].endOffset)).toBe(meds[0].raw);
      expect(meds[0].raw.startsWith(name)).toBe(true);
    });

    it('should never span a line break', () => {
      const text = '- Lisinopril 10 mg daily\nWeekly labs\n- Aspirin 81\nmg tabs';
      const meds = detectMedications(text);

      expect(meds).toHaveLength(1);
      expect(meds[0].raw).toBe('Lisinopril 10 mg daily');
      expect(meds[0].frequency).toBe('daily');
    });

    it('should detect multiple medications in sorted order', () => {
      const text = 'Started lisinopril 10 mg daily and metoprolol 25 mg BID.';
      const meds = detectMedications(text);

      expect(meds.map((m) => m.name)).toEqual(['lisinopril', 'metoprolol']);
      expect(meds[0].startOffset).toBeLessThan(meds[1].startOffset);
    });

    it('should detect every medication in LONG_NOTE', () => {
      const meds = detectMedications(LONG_NOTE);

      expect(meds.map((m) => m.name)).toEqual([
        'Metformin',
        'Lisinopril',
        'Atorvastatin',
        'Levothyroxine',
        'Acetaminophen',
      ]);
      expect(meds[3]).toMatchObject({ dose: 75, unit: 'mcg', frequency: 'daily' });
    });

    it('should detect medications but not labs/vitals in NOTE_WITH_MEDICATIONS', () => {
      const meds = detectMedications(NOTE_WITH_MEDICATIONS);

      expect(meds.map((m) => m.name)).toEqual([
        'Metoprolol',
        'Aspirin',
        'Albuterol',
        'Insulin glargine',
      ]);
      expect(meds[3].route).toBe('subcutaneous');
    });
  });

  describe('Route written before the name', () => {
    it('should move a leading route out of the name: "IV Furosemide 40mg"', () => {
      const text = '- IV Furosemide 40mg';
      const meds = detectMedications(text);

      expect(meds).toHaveLength(1);
      expect(meds[0]).toMatchObject({
        name: 'Furosemide',
        route: 'intravenous',
        dose: 40,
        unit: 'mg',
        raw: 'IV Furosemide 40mg',
        confidence: MEDICATION_CONFIDENCE.withRouteOrFrequency,
      });
      expect(text.slice(meds[0].startOffset, meds[0].endOffset)).toBe(
        'IV Furosemide 40mg'
      );
    });

    it('should move a route between name and dose: "Furosemide IV 40 mg BID"', () => {
      const [med] = detectMedications('Furosemide IV 40 mg BID');
      expect(med).toMatchObject({ name: 'Furosemide', route: 'intravenous' });
    });

    it('should prefer a trailing route over a leading one', () => {
      const [med] = detectMedications('IV Furosemide 40mg PO daily');
      expect(med).toMatchObject({ name: 'Furosemide', route: 'oral' });
    });
  });

  describe('Leading negation cue', () => {
    it.each([
      ['No metoprolol 25 mg PO BID.', 'metoprolol'],
      ['not metoprolol 25 mg PO BID', 'metoprolol'],
      ['Denies aspirin 81 mg daily', 'aspirin'],
      ['denied aspirin 81 mg daily', 'aspirin'],
      ['without aspirin 81 mg daily', 'aspirin'],
      ['Holding lisinopril 10 mg daily', 'lisinopril'],
      ['hold lisinopril 10 mg daily', 'lisinopril'],
      ['Stopped lisinopril 10 mg daily', 'lisinopril'],
      ['discontinue lisinopril 10 mg daily', 'lisinopril'],
    ])('strips the cue from the name and span: %s', (text, name) => {
      const [med] = detectMedications(text);
      expect(med.name).toBe(name);
      expect(text.slice(med.startOffset, med.endOffset).startsWith(name)).toBe(true);
      expect(med.raw.startsWith(name)).toBe(true);
    });

    it('keeps a real two-word drug name: "insulin glargine 10 units"', () => {
      const text = 'insulin glargine 10 units qHS';
      const [med] = detectMedications(text);
      expect(med.name).toBe('insulin glargine');
      expect(med.startOffset).toBe(0);
    });

    it('keeps a name that only starts with cue letters: "Nortriptyline 25 mg"', () => {
      const [med] = detectMedications('Nortriptyline 25 mg PO nightly');
      expect(med.name).toBe('Nortriptyline');
      expect(med.startOffset).toBe(0);
    });
  });

  describe('Dose-first phrasing', () => {
    it.each([
      ['Gave 2 mg morphine IV', '2 mg morphine IV', 'morphine', 2, 'mg', 'intravenous'],
      ['Patient received 4 mg of ondansetron', '4 mg of ondansetron', 'ondansetron', 4, 'mg', undefined],
      ['administered 1 g ceftriaxone IV', '1 g ceftriaxone IV', 'ceftriaxone', 1, 'g', 'intravenous'],
      ['received 40 mg IV furosemide', '40 mg IV furosemide', 'furosemide', 40, 'mg', 'intravenous'],
      ['took 2 tabs of ibuprofen', '2 tabs of ibuprofen', 'ibuprofen', 2, 'tabs', undefined],
    ])('should detect "%s"', (text, raw, name, dose, unit, route) => {
      const meds = detectMedications(text);

      expect(meds).toHaveLength(1);
      expect(meds[0]).toMatchObject({
        raw,
        name,
        dose,
        unit,
        confidence: MEDICATION_CONFIDENCE.doseFirst,
      });
      expect(meds[0].route).toBe(route);
      expect(text.slice(meds[0].startOffset, meds[0].endOffset)).toBe(raw);
    });

    it('should allow up to 3 words between the verb and the dose', () => {
      const [med] = detectMedications(
        'Patient was given a total of 4 mg of ondansetron IV q6h prn'
      );
      expect(med).toMatchObject({
        name: 'ondansetron',
        route: 'intravenous',
        frequency: 'q6h prn',
      });
    });

    it('should parse two-word names: "started on 10 units insulin glargine qHS"', () => {
      const [med] = detectMedications('started on 10 units insulin glargine qHS');
      expect(med).toMatchObject({ name: 'insulin glargine', dose: 10, frequency: 'qHS' });
    });

    it('should require an administration verb', () => {
      expect(detectMedications('Plan: 2 mg morphine IV')).toHaveLength(0);
      expect(detectMedications('Ordered: 4 mg of ondansetron')).toHaveLength(0);
    });

    it('should score dose-first lower than name-first', () => {
      expect(MEDICATION_CONFIDENCE.doseFirst).toBeLessThan(
        MEDICATION_CONFIDENCE.doseOnly
      );
    });

    it('should deduplicate overlaps with name-first matches', () => {
      const text = 'took Lisinopril 10 mg Metformin 500 mg';
      const meds = detectMedications(text);

      // dose-first "10 mg Metformin" overlaps both name-first mentions
      expect(meds.map((m) => m.raw)).toEqual([
        'Lisinopril 10 mg',
        'Metformin 500 mg',
      ]);
    });

    it('should not duplicate a name-first match after a verb', () => {
      const meds = detectMedications('took Metoprolol 25 mg PO BID');

      expect(meds).toHaveLength(1);
      expect(meds[0]).toMatchObject({
        name: 'Metoprolol',
        confidence: MEDICATION_CONFIDENCE.withRouteAndFrequency,
      });
    });
  });

  describe('Route normalization', () => {
    it.each([
      ['PO', 'oral'],
      ['by mouth', 'oral'],
      ['IV', 'intravenous'],
      ['IVPB', 'intravenous'],
      ['IM', 'intramuscular'],
      ['SQ', 'subcutaneous'],
      ['SC', 'subcutaneous'],
      ['subcut', 'subcutaneous'],
      ['SL', 'sublingual'],
      ['PR', 'rectal'],
      ['topical', 'topical'],
      ['inhaled', 'inhaled'],
      ['neb', 'inhaled'],
      ['transdermal', 'other'],
    ])('should normalize %s to %s', (raw, expected) => {
      expect(normalizeRoute(raw)).toBe(expected);
    });

    it('should normalize routes inside a mention', () => {
      expect(detectMedications('enoxaparin 40 mg SQ daily')[0].route).toBe(
        'subcutaneous'
      );
      expect(detectMedications('ipratropium 0.5 mg neb q6h')[0].route).toBe(
        'inhaled'
      );
      expect(detectMedications('acetaminophen 650 mg PR q6h')[0].route).toBe(
        'rectal'
      );
    });

    it('should not read "PRN" as the rectal route', () => {
      const meds = detectMedications('morphine 2 mg PRN');

      expect(meds[0].route).toBeUndefined();
      expect(meds[0].frequency).toBe('PRN');
    });
  });

  describe('Frequencies', () => {
    it.each([
      ['drug 10 mg daily', 'daily'],
      ['drug 10 mg TID', 'TID'],
      ['drug 10 mg QID', 'QID'],
      ['drug 10 mg qAM', 'qAM'],
      ['drug 10 mg qPM', 'qPM'],
      ['drug 10 mg q6h', 'q6h'],
      ['drug 10 mg once', 'once'],
      ['drug 10 mg weekly', 'weekly'],
      ['drug 10 mg three times daily', 'three times daily'],
      ['drug 10 mg every 6 hours', 'every 6 hours'],
    ])('should parse frequency in "%s"', (text, frequency) => {
      expect(detectMedications(text)[0].frequency).toBe(frequency);
    });
  });

  describe('Negative cases - vitals, labs, demographics', () => {
    it.each([
      'weight 80 kg',
      'Wt 180 lbs',
      'temp 38 C',
      'pain 7/10',
      'BP 120/80',
      'glucose 180 mg/dL',
      'Hemoglobin 12.5 g/dL',
      'Sodium 140 mEq/L',
      'GFR 60 mL/min',
      'HR 72',
      'age 45',
      'O2 sat 98%',
      'O2 at 2 L nasal cannula',
      'Received 2 units PRBC',
      'She drinks 3 units of alcohol weekly',
      'He took 2 units of EtOH last night',
      'Patient drinks 3 units weekly',
      'Patient smokes 10 cigarettes daily',
      'gave 2 mg and then repeated',
      'Return visit in 4-6 weeks',
    ])('should not detect a medication in "%s"', (text) => {
      expect(detectMedications(text)).toHaveLength(0);
    });

    it('should not detect anything in empty text', () => {
      expect(detectMedications('')).toHaveLength(0);
    });
  });

  describe('Utilities and exports', () => {
    it('should return protected ranges matching mention offsets', () => {
      const text = 'Plan: aspirin 81 mg daily.';
      const ranges = getMedicationProtectedRanges(text);

      expect(ranges).toEqual([{ start: 6, end: 25 }]);
      expect(text.slice(ranges[0].start, ranges[0].end)).toBe(
        'aspirin 81 mg daily'
      );
    });

    it('should export global, case-insensitive patterns', () => {
      for (const pattern of Object.values(MEDICATION_PATTERNS)) {
        expect(pattern.flags).toContain('g');
        expect(pattern.flags).toContain('i');
      }
    });

    it('should order confidence by evidence', () => {
      expect(MEDICATION_CONFIDENCE.doseOnly).toBeLessThan(
        MEDICATION_CONFIDENCE.withRouteOrFrequency
      );
      expect(MEDICATION_CONFIDENCE.withRouteOrFrequency).toBeLessThan(
        MEDICATION_CONFIDENCE.withRouteAndFrequency
      );
    });
  });
});
