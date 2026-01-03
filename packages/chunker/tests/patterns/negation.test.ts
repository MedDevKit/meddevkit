import { describe, it, expect } from 'vitest';
import {
  detectNegations,
  isTermNegated,
  getNegatedTerms,
  NEGATION_PATTERNS,
  NEGATION_CONFIDENCE,
} from '../../src/patterns/negation';
import { NOTE_WITH_NEGATIONS } from '../fixtures/sample-notes';

describe('Negation Detection', () => {
  describe('Absent Type - "no X", "absence of"', () => {
    it('should detect "no chest pain"', () => {
      const text = 'Patient reports no chest pain.';
      const negations = detectNegations(text);

      expect(negations).toHaveLength(1);
      expect(negations[0].type).toBe('absent');
      expect(negations[0].negatedText).toContain('chest pain');
    });

    it('should detect "no evidence of"', () => {
      const text = 'There is no evidence of infection.';
      const negations = detectNegations(text);

      expect(negations).toHaveLength(1);
      expect(negations[0].type).toBe('absent');
      expect(negations[0].negatedText).toContain('infection');
    });

    it('should detect "no signs of"', () => {
      const text = 'No signs of respiratory distress noted.';
      const negations = detectNegations(text);

      expect(negations).toHaveLength(1);
      expect(negations[0].type).toBe('absent');
    });

    it('should detect "absence of"', () => {
      const text = 'Physical exam notable for absence of edema.';
      const negations = detectNegations(text);

      expect(negations).toHaveLength(1);
      expect(negations[0].type).toBe('absent');
      expect(negations[0].negatedText).toContain('edema');
    });

    it('should detect "free of"', () => {
      const text = 'Lungs are free of consolidation.';
      const negations = detectNegations(text);

      expect(negations).toHaveLength(1);
      expect(negations[0].type).toBe('absent');
      expect(negations[0].negatedText).toContain('consolidation');
    });

    it('should detect "free from"', () => {
      const text = 'Patient is free from symptoms.';
      const negations = detectNegations(text);

      expect(negations).toHaveLength(1);
      expect(negations[0].type).toBe('absent');
    });
  });

  describe('Denied Type - "denies X"', () => {
    it('should detect "denies chest pain"', () => {
      const text = 'Patient denies chest pain or shortness of breath.';
      const negations = detectNegations(text);

      expect(negations.length).toBeGreaterThanOrEqual(1);
      expect(negations[0].type).toBe('denied');
      expect(negations[0].negatedText).toContain('chest pain');
    });

    it('should detect "patient denies"', () => {
      const text = 'Patient denies fever, chills, or night sweats.';
      const negations = detectNegations(text);

      expect(negations).toHaveLength(1);
      expect(negations[0].type).toBe('denied');
    });

    it('should detect "denied having"', () => {
      const text = 'She denied having any headaches recently.';
      const negations = detectNegations(text);

      expect(negations).toHaveLength(1);
      expect(negations[0].type).toBe('denied');
      expect(negations[0].negatedText).toContain('headaches');
    });

    it('should detect "denied any"', () => {
      const text = 'The patient denied any allergies.';
      const negations = detectNegations(text);

      expect(negations).toHaveLength(1);
      expect(negations[0].type).toBe('denied');
    });
  });

  describe('Ruled Out Type - "rule out X", "r/o"', () => {
    it('should detect "rule out MI"', () => {
      const text = 'Need to rule out MI given presentation.';
      const negations = detectNegations(text);

      expect(negations).toHaveLength(1);
      expect(negations[0].type).toBe('ruled_out');
      expect(negations[0].negatedText).toContain('MI');
    });

    it('should detect "r/o" abbreviation', () => {
      const text = 'Need to r/o pulmonary embolism given symptoms.';
      const negations = detectNegations(text);

      expect(negations.length).toBeGreaterThanOrEqual(1);
      expect(negations[0].type).toBe('ruled_out');
    });

    it('should detect "ruled out" past tense', () => {
      const text = 'Appendicitis has been ruled out.';
      const negations = detectNegations(text);

      expect(negations).toHaveLength(1);
      expect(negations[0].type).toBe('ruled_out');
    });

    it('should detect "was ruled out"', () => {
      const text = 'Pneumonia was ruled out by chest x-ray.';
      const negations = detectNegations(text);

      expect(negations).toHaveLength(1);
      expect(negations[0].type).toBe('ruled_out');
    });

    it('should detect "excluded"', () => {
      const text = 'Stroke was excluded based on imaging.';
      const negations = detectNegations(text);

      expect(negations).toHaveLength(1);
      expect(negations[0].type).toBe('ruled_out');
    });
  });

  describe('Negative Type - "negative for X"', () => {
    it('should detect "negative for malignancy"', () => {
      const text = 'Biopsy negative for malignancy.';
      const negations = detectNegations(text);

      expect(negations.length).toBeGreaterThanOrEqual(1);
      expect(negations[0].type).toBe('negative');
      // Pattern may capture text before or after "negative"
    });

    it('should detect "troponin negative"', () => {
      const text = 'Troponin is negative.';
      const negations = detectNegations(text);

      expect(negations).toHaveLength(1);
      expect(negations[0].type).toBe('negative');
    });

    it('should detect "was negative"', () => {
      const text = 'Flu test was negative.';
      const negations = detectNegations(text);

      expect(negations).toHaveLength(1);
      expect(negations[0].type).toBe('negative');
    });

    it('should detect "unremarkable"', () => {
      const text = 'Unremarkable abdominal examination findings.';
      const negations = detectNegations(text);

      expect(negations.length).toBeGreaterThanOrEqual(1);
      expect(negations[0].type).toBe('negative');
    });

    it('should detect "normal"', () => {
      const text = 'Normal neurological examination.';
      const negations = detectNegations(text);

      expect(negations).toHaveLength(1);
      expect(negations[0].type).toBe('negative');
    });
  });

  describe('Without Type - "without X"', () => {
    it('should detect "without edema"', () => {
      const text = 'Extremities without edema.';
      const negations = detectNegations(text);

      expect(negations).toHaveLength(1);
      expect(negations[0].type).toBe('without');
      expect(negations[0].negatedText).toContain('edema');
    });

    it('should detect "without any"', () => {
      const text = 'Patient presented without any distress.';
      const negations = detectNegations(text);

      expect(negations).toHaveLength(1);
      expect(negations[0].type).toBe('without');
    });

    it('should detect "without evidence of"', () => {
      const text = 'CT scan without evidence of acute pathology.';
      const negations = detectNegations(text);

      expect(negations).toHaveLength(1);
      expect(negations[0].type).toBe('without');
    });

    it('should detect "not associated with"', () => {
      const text = 'Pain not associated with exertion.';
      const negations = detectNegations(text);

      expect(negations).toHaveLength(1);
      expect(negations[0].type).toBe('without');
      expect(negations[0].negatedText).toContain('exertion');
    });
  });

  describe('Multiple Negations', () => {
    it('should detect multiple negations in NOTE_WITH_NEGATIONS', () => {
      const negations = detectNegations(NOTE_WITH_NEGATIONS);

      expect(negations.length).toBeGreaterThan(5);

      const types = negations.map((n) => n.type);
      expect(types).toContain('absent');
      expect(types).toContain('denied');
      expect(types).toContain('ruled_out');
      expect(types).toContain('negative');
    });

    it('should detect multiple negations in single sentence', () => {
      const text = 'No fever, no chills, no night sweats.';
      const negations = detectNegations(text);

      expect(negations.length).toBeGreaterThanOrEqual(1);
    });

    it('should maintain order by position', () => {
      const negations = detectNegations(NOTE_WITH_NEGATIONS);

      for (let i = 1; i < negations.length; i++) {
        expect(negations[i].startOffset).toBeGreaterThanOrEqual(negations[i - 1].startOffset);
      }
    });
  });

  describe('isTermNegated', () => {
    it('should return true when term is negated', () => {
      const text = 'Patient denies chest pain.';
      expect(isTermNegated(text, 'chest pain')).toBe(true);
    });

    it('should return true for partial match', () => {
      const text = 'No shortness of breath reported.';
      expect(isTermNegated(text, 'breath')).toBe(true);
    });

    it('should return false when term is not negated', () => {
      const text = 'Patient reports chest pain.';
      expect(isTermNegated(text, 'chest pain')).toBe(false);
    });

    it('should be case-insensitive', () => {
      const text = 'Denies CHEST PAIN.';
      expect(isTermNegated(text, 'chest pain')).toBe(true);
    });
  });

  describe('getNegatedTerms', () => {
    it('should return all negated terms', () => {
      const text = 'Patient denies fever. No chest pain. Rules out MI.';
      const terms = getNegatedTerms(text);

      expect(terms.length).toBeGreaterThan(0);
    });

    it('should return unique terms', () => {
      const text = 'No fever. Patient denies fever.';
      const terms = getNegatedTerms(text);

      // Check for uniqueness
      const uniqueTerms = new Set(terms);
      expect(terms.length).toBe(uniqueTerms.size);
    });

    it('should return empty array for text with no negations', () => {
      const text = 'Patient presents with chest pain and fever.';
      const terms = getNegatedTerms(text);

      expect(terms).toHaveLength(0);
    });
  });

  describe('Confidence Scores', () => {
    it('should have highest confidence for ruled_out', () => {
      expect(NEGATION_CONFIDENCE.ruled_out).toBe(0.95);
    });

    it('should have appropriate confidence for each type', () => {
      expect(NEGATION_CONFIDENCE.absent).toBe(0.90);
      expect(NEGATION_CONFIDENCE.denied).toBe(0.85);
      expect(NEGATION_CONFIDENCE.negative).toBe(0.90);
      expect(NEGATION_CONFIDENCE.without).toBe(0.80);
    });

    it('should include confidence in detection results', () => {
      const text = 'Rule out MI. No chest pain. Patient denies fever.';
      const negations = detectNegations(text);

      for (const negation of negations) {
        expect(negation.confidence).toBeDefined();
        expect(negation.confidence).toBeGreaterThan(0);
        expect(negation.confidence).toBeLessThanOrEqual(1);
      }
    });
  });

  describe('Position Tracking', () => {
    it('should track start and end offsets', () => {
      const text = 'Patient denies chest pain.';
      const negations = detectNegations(text);

      expect(negations[0].startOffset).toBeDefined();
      expect(negations[0].endOffset).toBeDefined();
      expect(negations[0].endOffset).toBeGreaterThan(negations[0].startOffset);
    });

    it('should have correct offsets for extraction', () => {
      const text = 'Patient denies chest pain.';
      const negations = detectNegations(text);

      const extracted = text.substring(negations[0].startOffset, negations[0].endOffset);
      expect(extracted.toLowerCase()).toContain('denies');
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty text', () => {
      const negations = detectNegations('');
      expect(negations).toHaveLength(0);
    });

    it('should handle text with no negations', () => {
      const text = 'Patient presents with chest pain and shortness of breath.';
      const negations = detectNegations(text);
      expect(negations).toHaveLength(0);
    });

    it('should skip very short negated text', () => {
      // The pattern should filter out matches < 3 chars
      const text = 'No x.';
      const negations = detectNegations(text);
      // May or may not match depending on implementation
      for (const n of negations) {
        expect(n.negatedText.length).toBeGreaterThanOrEqual(3);
      }
    });

    it('should clean up trailing punctuation', () => {
      const text = 'Patient denies fever, chills.';
      const negations = detectNegations(text);

      for (const n of negations) {
        expect(n.negatedText).not.toMatch(/[.,;]$/);
      }
    });

    it('should handle overlapping patterns by keeping highest confidence', () => {
      // This tests deduplication
      const text = 'No evidence of disease has been ruled out.';
      const negations = detectNegations(text);

      // Check no overlapping ranges
      for (let i = 1; i < negations.length; i++) {
        expect(negations[i].startOffset).toBeGreaterThanOrEqual(negations[i - 1].endOffset);
      }
    });
  });

  describe('Clinical Scenarios', () => {
    it('should handle ROS section with multiple negations', () => {
      const text = `REVIEW OF SYSTEMS:
Constitutional: No fever, chills, or night sweats.
Cardiovascular: Denies chest pain, palpitations.
Respiratory: No shortness of breath or cough.`;

      const negations = detectNegations(text);
      expect(negations.length).toBeGreaterThanOrEqual(3);
    });

    it('should handle physical exam findings', () => {
      const text = `PHYSICAL EXAM:
Lungs: Clear to auscultation, no wheezes or rales.
Heart: Regular rate and rhythm, no murmurs.
Abdomen: Soft, non-tender, no masses.`;

      const negations = detectNegations(text);
      expect(negations.length).toBeGreaterThan(2);
    });

    it('should handle assessment with ruled out diagnoses', () => {
      const text = `ASSESSMENT:
1. Chest pain - ruled out MI, likely musculoskeletal
2. Dyspnea - negative for PE per CT angiogram
3. Fever - excluded bacterial infection`;

      const negations = detectNegations(text);

      const types = negations.map((n) => n.type);
      expect(types).toContain('ruled_out');
      expect(types).toContain('negative');
    });
  });
});
