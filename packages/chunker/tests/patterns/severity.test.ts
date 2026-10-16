import { describe, it, expect } from 'vitest';
import {
  detectSeverity,
  SEVERITY_PATTERNS,
  SEVERITY_CONFIDENCE,
} from '../../src/patterns/severity';
import { NOTE_WITH_MEDICATIONS } from '../fixtures/sample-notes';

describe('Severity Detection', () => {
  describe('Levels', () => {
    it.each([
      ['Mild edema.', 'mild', 'Mild', 'edema'],
      ['Slightly elevated troponin.', 'mild', 'Slightly', 'elevated troponin'],
      ['Minimal tenderness.', 'mild', 'Minimal', 'tenderness'],
      ['Minor abrasion on knee.', 'mild', 'Minor', 'abrasion on knee'],
      ['Moderate dyspnea on exertion.', 'moderate', 'Moderate', 'dyspnea on exertion'],
      ['Mild-to-moderate pain.', 'moderate', 'Mild-to-moderate', 'pain'],
      ['Mild to moderate pain.', 'moderate', 'Mild to moderate', 'pain'],
      ['Severe chest pain.', 'severe', 'Severe', 'chest pain'],
      ['Markedly elevated lactate.', 'severe', 'Markedly', 'elevated lactate'],
      ['Significant weight loss.', 'severe', 'Significant', 'weight loss'],
      ['Extreme fatigue.', 'severe', 'Extreme', 'fatigue'],
      ['Excruciating back pain.', 'severe', 'Excruciating', 'back pain'],
      ['Moderate to severe dyspnea.', 'severe', 'Moderate to severe', 'dyspnea'],
      ['Critical aortic stenosis.', 'critical', 'Critical', 'aortic stenosis'],
      ['Life-threatening hemorrhage.', 'critical', 'Life-threatening', 'hemorrhage'],
      ['Profound hypotension.', 'critical', 'Profound', 'hypotension'],
    ])('should detect "%s"', (text, level, term, modifiedText) => {
      const severity = detectSeverity(text);

      expect(severity).toHaveLength(1);
      expect(severity[0]).toMatchObject({
        level,
        term,
        modifiedText,
        startOffset: 0,
        confidence: SEVERITY_CONFIDENCE[level as keyof typeof SEVERITY_CONFIDENCE],
      });
      expect(severity[0].endOffset).toBe(text.indexOf('.'));
    });

    it('should capture the finding in "worst ... of life"', () => {
      const text = 'Reports the worst headache of her life.';
      const severity = detectSeverity(text);

      expect(severity).toHaveLength(1);
      expect(severity[0]).toMatchObject({
        level: 'severe',
        term: 'worst headache of her life',
        modifiedText: 'headache',
      });
      expect(text.slice(severity[0].startOffset, severity[0].endOffset)).toBe(
        'worst headache of her life'
      );
    });
  });

  describe('Modified text extraction', () => {
    it('should stop at the next severity term', () => {
      const severity = detectSeverity('Severe chest pain with mild nausea.');

      expect(severity.map((s) => [s.level, s.modifiedText])).toEqual([
        ['severe', 'chest pain'],
        ['mild', 'nausea'],
      ]);
      expect(severity[0].endOffset).toBeLessThanOrEqual(severity[1].startOffset);
    });

    it('should stop at a line break', () => {
      const text = '- Severe headache\n- Mild nausea\n- Plan: rest';
      const severity = detectSeverity(text);

      expect(severity.map((s) => [s.level, s.modifiedText])).toEqual([
        ['severe', 'headache'],
        ['mild', 'nausea'],
      ]);
      severity.forEach((s) => {
        expect(text.slice(s.startOffset, s.endOffset)).not.toContain('\n');
      });
    });

    it('should not match "worst ... of life" across lines', () => {
      expect(detectSeverity('worst headache\nof her life')).toHaveLength(0);
    });

    it('should stop at punctuation', () => {
      const [mod] = detectSeverity('Severe headache, photophobia.');
      expect(mod.modifiedText).toBe('headache');
    });

    it('should cap length at a whole word', () => {
      const [mod] = detectSeverity(
        'Severe crushing substernal pressure radiating down the left arm into the hand'
      );
      expect(mod.modifiedText!.length).toBeLessThanOrEqual(40);
      expect(
        'crushing substernal pressure radiating down the left arm'.startsWith(
          mod.modifiedText!
        )
      ).toBe(true);
      expect(mod.modifiedText!.endsWith(' ')).toBe(false);
    });

    it('should leave modifiedText undefined when nothing follows', () => {
      const text = 'Pain is severe.';
      const [mod] = detectSeverity(text);

      expect(mod.modifiedText).toBeUndefined();
      expect(text.slice(mod.startOffset, mod.endOffset)).toBe('severe');
    });

    it('should detect severity in NOTE_WITH_MEDICATIONS', () => {
      const severity = detectSeverity(NOTE_WITH_MEDICATIONS);

      expect(severity.map((s) => [s.level, s.modifiedText])).toEqual([
        ['severe', 'chest pain for 3 days'],
        ['mild', 'nausea since yesterday'],
      ]);
    });
  });

  describe('Negative cases', () => {
    it.each([
      'Creatinine not significantly changed.',
      'No significant joint swelling.',
      'Non-significant findings.',
      'Without marked distress.',
      'Pain 7/10.',
      'Tumor marker pending.',
      'A minority of patients respond.',
      'Clinical significance unclear.',
      'Insignificant change.',
      'Severity assessed.',
      'Critical care consult placed.',
      'Transferred from a critical access hospital.',
      'Difference was statistically significant.',
      'No clinically significant bleeding.',
      'Clinically significant arrhythmia.',
      'PMH significant for HTN.',
      'Accompanied by her significant other.',
      'Site marked with surgical pen.',
      '',
    ])('should not detect severity in "%s"', (text) => {
      expect(detectSeverity(text)).toHaveLength(0);
    });

    it('should still match severity uses next to excluded collocations', () => {
      expect(detectSeverity('Critically ill on arrival.')[0]).toMatchObject({
        level: 'critical',
        modifiedText: 'ill on arrival',
      });
      expect(detectSeverity('Significantly worse today.')[0].level).toBe('severe');
      expect(detectSeverity('Marked edema.')[0].modifiedText).toBe('edema');
    });

    it('should match generic uses (documented behavior)', () => {
      expect(detectSeverity('Moderate-intensity exercise.')[0]).toMatchObject({
        level: 'moderate',
        modifiedText: 'intensity exercise',
      });
      expect(detectSeverity('History of minor surgery.')[0].level).toBe('mild');
    });
  });

  describe('Exports', () => {
    it('should export global, case-insensitive patterns for every level', () => {
      for (const patterns of Object.values(SEVERITY_PATTERNS)) {
        expect(patterns.length).toBeGreaterThan(0);
        for (const pattern of patterns) {
          expect(pattern.flags).toContain('g');
          expect(pattern.flags).toContain('i');
        }
      }
    });
  });
});
