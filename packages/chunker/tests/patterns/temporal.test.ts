import { describe, it, expect } from 'vitest';
import {
  detectTemporal,
  TEMPORAL_PATTERNS,
  TEMPORAL_CONFIDENCE,
} from '../../src/patterns/temporal';
import { LONG_NOTE, NOTE_WITH_MEDICATIONS } from '../fixtures/sample-notes';

describe('Temporal Detection', () => {
  describe('Duration', () => {
    it.each([
      ['Cough for 3 days.', 'for 3 days', 3, 'day'],
      ['Fever x 2 weeks.', 'x 2 weeks', 2, 'week'],
      ['Fever x2 weeks.', 'x2 weeks', 2, 'week'],
      ['A 3-day history of cough.', '3-day history', 3, 'day'],
      ['Weight loss over the past 2 months.', 'over the past 2 months', 2, 'month'],
      ['Fatigue for the past 3 months.', 'for the past 3 months', 3, 'month'],
      ['Chest pain for 30 minutes.', 'for 30 minutes', 30, 'minute'],
      ['Diabetic for 10 years.', 'for 10 years', 10, 'year'],
      ['Symptoms within the last 24 hours.', 'within the last 24 hours', 24, 'hour'],
      ['Cough for a couple of weeks.', 'for a couple of weeks', 2, 'week'],
    ])('should detect duration in "%s"', (text, raw, value, unit) => {
      const temporal = detectTemporal(text);

      expect(temporal).toHaveLength(1);
      expect(temporal[0]).toMatchObject({
        type: 'duration',
        raw,
        value,
        unit,
        confidence: TEMPORAL_CONFIDENCE.duration,
      });
      expect(text.slice(temporal[0].startOffset, temporal[0].endOffset)).toBe(raw);
    });

    it('should leave value undefined for vague quantities', () => {
      const temporal = detectTemporal('Congestion for several days.');

      expect(temporal).toHaveLength(1);
      expect(temporal[0]).toMatchObject({ type: 'duration', unit: 'day' });
      expect(temporal[0].value).toBeUndefined();
    });
  });

  describe('Onset', () => {
    it.each([
      ['Pain started 2 days ago.', 'started 2 days ago', 2, 'day'],
      ['Onset 2 hours ago.', 'Onset 2 hours ago', 2, 'hour'],
      ['Symptoms began about a week ago.', 'began about a week ago', 1, 'week'],
    ])('should detect quantified onset in "%s"', (text, raw, value, unit) => {
      const temporal = detectTemporal(text);

      expect(temporal).toHaveLength(1);
      expect(temporal[0]).toMatchObject({ type: 'onset', raw, value, unit });
    });

    it.each([
      ['Headache began this morning.', 'began this morning'],
      ['Nausea since yesterday.', 'since yesterday'],
      ['Vomiting since last night.', 'since last night'],
      ['Rash started yesterday.', 'started yesterday'],
      ['Cough since Monday.', 'since Monday'],
    ])('should detect anchored onset in "%s"', (text, raw) => {
      const temporal = detectTemporal(text);

      expect(temporal).toHaveLength(1);
      expect(temporal[0].type).toBe('onset');
      expect(temporal[0].raw).toBe(raw);
      expect(temporal[0].value).toBeUndefined();
    });
  });

  describe('Relative', () => {
    it.each([
      ['Seen in the ED yesterday.', 'yesterday'],
      ['Fell last night.', 'last night'],
      ['Took a dose this morning.', 'this morning'],
      ['Similar episode 2 weeks ago.', '2 weeks ago'],
      ['Called earlier today.', 'earlier today'],
      ['Worse overnight.', 'overnight'],
    ])('should detect relative time in "%s"', (text, raw) => {
      const temporal = detectTemporal(text);

      expect(temporal).toHaveLength(1);
      expect(temporal[0]).toMatchObject({
        type: 'relative',
        raw,
        confidence: TEMPORAL_CONFIDENCE.relative,
      });
    });

    it('should parse value/unit for "N units ago"', () => {
      const [expr] = detectTemporal('Similar episode 2 weeks ago.');
      expect(expr.value).toBe(2);
      expect(expr.unit).toBe('week');
    });

    it('should not duplicate a relative inside an onset match', () => {
      const temporal = detectTemporal('Nausea since yesterday, began this morning.');

      expect(temporal.map((t) => [t.type, t.raw])).toEqual([
        ['onset', 'since yesterday'],
        ['onset', 'began this morning'],
      ]);
    });

    it('should prefer onset over relative for "started 2 days ago"', () => {
      const temporal = detectTemporal('Pain started 2 days ago.');

      expect(temporal).toHaveLength(1);
      expect(temporal[0].type).toBe('onset');
    });
  });

  describe('Course', () => {
    it.each([
      'intermittent',
      'constant',
      'worsening',
      'improving',
      'progressive',
      'chronically',
      'episodic',
      'acute onset',
      'sudden onset',
    ])('should detect course term "%s"', (term) => {
      const temporal = detectTemporal(`Pain is ${term}.`);

      expect(temporal).toHaveLength(1);
      expect(temporal[0]).toMatchObject({
        type: 'course',
        raw: term,
        confidence: TEMPORAL_CONFIDENCE.course,
      });
      expect(temporal[0].value).toBeUndefined();
      expect(temporal[0].unit).toBeUndefined();
    });
  });

  describe('Acute/chronic rule', () => {
    it('should match "chronic pain" as course', () => {
      const temporal = detectTemporal('History of chronic pain.');

      expect(temporal).toHaveLength(1);
      expect(temporal[0]).toMatchObject({ type: 'course', raw: 'chronic pain' });
    });

    it.each([
      'Pain is chronic.',
      'Stage 3 chronic kidney disease.',
      'Acute kidney injury resolved.',
      'Pain is acute.',
    ])('should not match bare acute/chronic in "%s"', (text) => {
      expect(detectTemporal(text)).toHaveLength(0);
    });
  });

  describe('Line breaks', () => {
    it('should not join expressions across list lines', () => {
      const text = '- Fever x 2\nweeks of cough\n- Seen last\nnight shift';
      expect(detectTemporal(text)).toHaveLength(0);
    });

    it('should detect expressions on separate lines independently', () => {
      const text = '- Cough for 3 days\n- Fever since yesterday';
      expect(detectTemporal(text).map((t) => t.raw)).toEqual([
        'for 3 days',
        'since yesterday',
      ]);
    });
  });

  describe('Negative cases', () => {
    it.each([
      'aspirin 2 mg',
      'BP 120/80',
      'Chest x-ray clear.',
      'Follow up in clinic.',
      'Follow up in 2 weeks.',
      'Alert and oriented x3.',
      'Acute distress absent.',
      'Pain 7/10.',
      '',
    ])('should not detect temporal expressions in "%s"', (text) => {
      expect(detectTemporal(text)).toHaveLength(0);
    });
  });

  describe('Clinical notes', () => {
    it('should detect expressions in NOTE_WITH_MEDICATIONS in order', () => {
      const temporal = detectTemporal(NOTE_WITH_MEDICATIONS);

      expect(temporal.map((t) => t.raw)).toEqual([
        'for 3 days',
        'started 2 days ago',
        'intermittent',
        'since yesterday',
        'worsening',
      ]);
      for (let i = 1; i < temporal.length; i++) {
        expect(temporal[i].startOffset).toBeGreaterThanOrEqual(
          temporal[i - 1].endOffset
        );
      }
    });

    it('should detect duration and course in LONG_NOTE', () => {
      const temporal = detectTemporal(LONG_NOTE);
      const raws = temporal.map((t) => t.raw);

      expect(raws).toContain('for the past 3 months');
      expect(raws).toContain('intermittent');
    });

    it('should export global, case-insensitive patterns for every type', () => {
      for (const patterns of Object.values(TEMPORAL_PATTERNS)) {
        expect(patterns.length).toBeGreaterThan(0);
        for (const pattern of patterns) {
          expect(pattern.flags).toContain('g');
          expect(pattern.flags).toContain('i');
        }
      }
    });
  });
});
