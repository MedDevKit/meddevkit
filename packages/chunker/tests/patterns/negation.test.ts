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

  describe('Ruled Out Type - completed "ruled out X"', () => {
    it('should not negate "need to rule out MI" (plan form: MI is still under consideration)', () => {
      expect(detectNegations('Need to rule out MI given presentation.')).toHaveLength(0);
    });

    it.each([
      'Rule out PE.',
      'R/O sepsis.',
      'Need to r/o pulmonary embolism given symptoms.',
      'Plan to rule out MI with serial troponins.',
      'Will rule out pneumonia with chest x-ray.',
    ])('should not negate the plan form (still under consideration): %s', (text) => {
      expect(detectNegations(text)).toHaveLength(0);
    });

    it('should detect "MI was ruled out"', () => {
      const negations = detectNegations('MI was ruled out.');

      expect(negations).toHaveLength(1);
      expect(negations[0].type).toBe('ruled_out');
      expect(negations[0].negatedText).toBe('MI');
    });

    it('should detect "Ruled out for PE"', () => {
      const negations = detectNegations('Ruled out for PE.');

      expect(negations).toHaveLength(1);
      expect(negations[0].type).toBe('ruled_out');
      expect(negations[0].negatedText).toBe('PE');
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

    it('should not treat "normal" as a negation cue', () => {
      // "normal X" asserts a normal finding; it does not negate one
      expect(detectNegations('Normal neurological examination.')).toHaveLength(0);
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

  describe('Line breaks', () => {
    it('should not extend a ruled-out span into the next list item', () => {
      const text = '1. Chest pain - ruled out acute coronary syndrome\n2. Headache';
      const negations = detectNegations(text);

      expect(negations).toHaveLength(1);
      expect(negations[0].type).toBe('ruled_out');
      expect(negations[0].negatedText).toBe('acute coronary syndrome');
      expect(text.slice(negations[0].startOffset, negations[0].endOffset)).not.toContain('\n');
    });

    it('should not extend a "without" span into the next bullet', () => {
      const text = '- CT head without contrast\n- Continue home Metoprolol 25 mg PO BID';
      const negations = detectNegations(text);

      expect(negations).toHaveLength(1);
      expect(negations[0].type).toBe('without');
      expect(negations[0].negatedText).toBe('contrast');
    });

    it('should keep each list line separate', () => {
      const text = '- Denies fever\n- No chest pain\n- Negative for malignancy\nPlan: follow up';
      const negations = detectNegations(text);

      expect(negations.map((n) => n.negatedText)).toEqual([
        'fever',
        'chest pain',
        'malignancy',
      ]);
      negations.forEach((n) => {
        expect(text.slice(n.startOffset, n.endOffset)).not.toContain('\n');
      });
    });
  });

  describe('Real-note precision', () => {
    const terms = (text: string) => detectNegations(text).map((n) => n.negatedText);
    const span = (text: string, n: { startOffset: number; endOffset: number }) =>
      text.slice(n.startOffset, n.endOffset);

    describe('"normal" is not a negation cue', () => {
      it.each([
        'Bolus of 1 L normal saline given.',
        'Transferred to the normal ward.',
        'Electrolytes within normal range.',
      ])('ignores %s', (text) => {
        expect(detectNegations(text)).toHaveLength(0);
      });
    });

    describe('pseudo-negations ("could not exclude") keep the finding possible', () => {
      it.each([
        'CT could not exclude the presence of an advanced malignant lesion.',
        'We cannot exclude pulmonary embolism.',
        'Could not rule out pneumonia on this film.',
        "Exam can't rule out appendicitis.",
        'Unable to rule out sepsis at this time.',
        'Malignancy is not excluded.',
        'Pulmonary embolism has not been ruled out.',
        'Strep test was not negative.',
      ])('does not negate: %s', (text) => {
        expect(detectNegations(text)).toHaveLength(0);
      });

      it('still detects a plain exclusion', () => {
        const negations = detectNegations('Stroke was excluded based on imaging.');
        expect(negations).toHaveLength(1);
        expect(negations[0].type).toBe('ruled_out');
        expect(negations[0].negatedText).toBe('Stroke');
      });
    });

    describe('"negative" needs a finding', () => {
      it('ignores "negative pressure wound therapy"', () => {
        expect(detectNegations('Started negative pressure wound therapy.')).toHaveLength(0);
      });

      it('ignores "gram negative rods"', () => {
        expect(detectNegations('Culture grew gram negative rods.')).toHaveLength(0);
      });

      it('negates the finding after "negative for", not the test before it', () => {
        const negations = detectNegations('Biopsy negative for malignancy.');
        expect(negations).toHaveLength(1);
        expect(negations[0].negatedText).toBe('malignancy');
      });

      it('detects "Test: negative"', () => {
        const negations = detectNegations('Influenza A: negative.');
        expect(negations).toHaveLength(1);
        expect(negations[0].type).toBe('negative');
        expect(negations[0].negatedText).toBe('Influenza A');
      });
    });

    describe('clause boundaries end the scope', () => {
      it('negates only the finding after "but negative for"', () => {
        const text = 'Swab positive for SARS-CoV-2 but negative for influenza A.';
        const negations = detectNegations(text);
        expect(negations).toHaveLength(1);
        expect(negations[0].negatedText).toBe('influenza A');
        expect(span(text, negations[0])).not.toContain('SARS');
      });

      it('starts a postfix target after "but"', () => {
        const text = 'Swab positive for SARS-CoV-2 but influenza A negative.';
        const negations = detectNegations(text);
        expect(negations).toHaveLength(1);
        expect(negations[0].negatedText).toBe('influenza A');
        expect(span(text, negations[0])).toBe('influenza A negative');
      });

      it('stops a forward scope at "but"', () => {
        expect(terms('No chest pain but reports palpitations.')).toEqual(['chest pain']);
      });

      it('drops the label before a dash ("Chest pain - ruled out MI")', () => {
        const negations = detectNegations('1. Chest pain - ruled out MI, likely musculoskeletal');
        expect(negations).toHaveLength(1);
        expect(negations[0].type).toBe('ruled_out');
        expect(negations[0].negatedText).toBe('MI');
      });
    });

    describe('"not" + finding', () => {
      it('detects "does not have fever"', () => {
        const negations = detectNegations('She does not have fever.');
        expect(negations).toHaveLength(1);
        expect(negations[0].type).toBe('absent');
        expect(negations[0].negatedText).toBe('fever');
      });

      it.each([
        ['He did not have any chest pain.', 'chest pain'],
        ['Abdomen is not tender.', 'tender'],
        ['The rash was not pruritic.', 'pruritic'],
        ["Patient doesn't report nausea.", 'nausea'],
      ])('detects %s', (text, expected) => {
        expect(terms(text)).toEqual([expected]);
      });

      it.each([
        'This is not only painful but also swollen.',
        'She is not sure when the symptoms began.',
        'He is not able to walk far.',
        'She did not tolerate the medication.',
      ])('does not negate: %s', (text) => {
        expect(detectNegations(text)).toHaveLength(0);
      });

      it('ends the scope at a new clause', () => {
        expect(terms('She does not have fever and is eating well.')).toEqual(['fever']);
      });
    });

    it('detects "never smoked"', () => {
      const negations = detectNegations('He has never smoked.');
      expect(negations).toHaveLength(1);
      expect(negations[0].type).toBe('absent');
      expect(negations[0].negatedText).toBe('smoked');
    });

    describe('field value "None"', () => {
      it('negates the field name', () => {
        const text = 'COMPLICATIONS: None.\nALLERGIES: None\nEBL: Minimal';
        const negations = detectNegations(text);
        expect(negations.map((n) => n.negatedText)).toEqual(['COMPLICATIONS', 'ALLERGIES']);
        negations.forEach((n) => expect(n.type).toBe('absent'));
        expect(span(text, negations[0])).toBe('COMPLICATIONS: None');
      });

      it('ignores "None" that is not the whole value', () => {
        expect(detectNegations('Comment: None of the above applied.')).toHaveLength(0);
      });
    });

    describe('postfix "absent"', () => {
      it('detects "pedal pulses absent"', () => {
        const text = 'Extremities: pedal pulses absent bilaterally.';
        const negations = detectNegations(text);
        expect(negations).toHaveLength(1);
        expect(negations[0].type).toBe('absent');
        expect(negations[0].negatedText).toBe('pedal pulses');
        expect(span(text, negations[0])).toBe('pedal pulses absent');
      });
    });

    describe('"nor" and "neither"', () => {
      it('negates both findings in "no fever nor chills"', () => {
        expect(isTermNegated('No fever nor chills.', 'fever')).toBe(true);
        expect(isTermNegated('No fever nor chills.', 'chills')).toBe(true);
      });

      it('negates both findings in "neither fever nor chills"', () => {
        expect(terms('Reports neither fever nor chills.')).toEqual(['fever nor chills']);
      });
    });

    describe('coordinated lists', () => {
      it('negates every item in "No cyanosis, clubbing or edema" as one span', () => {
        const text = 'Extremities: No cyanosis, clubbing or edema. Pulses 2+.';
        const negations = detectNegations(text);
        expect(negations).toHaveLength(1);
        expect(negations[0].negatedText).toBe('cyanosis, clubbing or edema');
        expect(span(text, negations[0])).toBe('No cyanosis, clubbing or edema');
        for (const term of ['cyanosis', 'clubbing', 'edema']) {
          expect(isTermNegated(text, term)).toBe(true);
        }
      });

      it('handles an Oxford-comma list with "and"', () => {
        expect(terms('Denies fever, chills, and night sweats.')).toEqual([
          'fever, chills, and night sweats',
        ]);
      });

      it('ends the list at a sentence boundary', () => {
        expect(terms('No cyanosis, clubbing or edema. Mild tremor, rigidity or both.')).toEqual([
          'cyanosis, clubbing or edema',
        ]);
      });

      it('ends the list at "but"', () => {
        expect(terms('No cyanosis, clubbing or edema but has rash.')).toEqual([
          'cyanosis, clubbing or edema',
        ]);
      });

      it('does not extend past a comma into a new clause', () => {
        expect(terms('No fever, patient is well.')).toEqual(['fever']);
        expect(terms('No acute distress, alert and oriented.')).toEqual(['acute distress']);
      });

      it('keeps separately cued items separate', () => {
        expect(terms('No fever, no chills, no night sweats.')).toEqual([
          'fever',
          'chills',
          'night sweats',
        ]);
      });
    });

    describe('ROS-style "Negative X" (cue before the finding)', () => {
      it('negates each item of "Negative A, negative B, negative C"', () => {
        const text = 'GASTROINTESTINAL: Negative heartburn, negative nausea, negative vomiting.';
        const negations = detectNegations(text);
        expect(negations.map((n) => n.negatedText)).toEqual(['heartburn', 'nausea', 'vomiting']);
        negations.forEach((n) => expect(n.type).toBe('negative'));
        expect(span(text, negations[0])).toBe('Negative heartburn');
      });

      it('treats an unrepeated list after "Negative" like "No A, B or C"', () => {
        const text = 'CARDIOVASCULAR: Negative chest pain, palpitations or leg swelling.';
        expect(terms(text)).toEqual(['chest pain, palpitations or leg swelling']);
      });

      it.each([
        ['EYES: Negative blurred vision, negative double vision.', ['blurred vision', 'double vision']],
        ['- Negative Romberg\n- Negative Babinski', ['Romberg', 'Babinski']],
        ['Gait steady. Negative Romberg sign.', ['Romberg sign']],
        ['Urinalysis showed pH 6, negative nitrites.', ['nitrites']],
        ['MUSCULOSKELETAL:\nNegative myalgia, negative joint stiffness.', ['myalgia', 'joint stiffness']],
      ])('detects %s', (text, expected) => {
        expect(terms(text)).toEqual(expected);
      });

      it.each([
        'Negative pressure wound therapy was applied to the sacral wound.',
        'Continue negative-pressure dressing changes.',
        'The assay has a high negative predictive value.',
        'Negative predictive value was 98%.',
        'Negative inspiratory force measured at the bedside.',
        'Culture grew gram-negative bacilli.',
        'Gram negative rods on the smear.',
        'Gram-negative rods were isolated.',
        'Mother is Rh negative.',
        'Rh negative mother, RhoGAM given.',
      ])('does not negate: %s', (text) => {
        expect(detectNegations(text)).toHaveLength(0);
      });

      it('keeps "HIV negative" as the postfix form', () => {
        expect(terms('Screening: HIV negative, hepatitis C negative.')).toEqual(['HIV', 'hepatitis C']);
        expect(terms('HIV negative patient admitted for observation.')).toEqual(['HIV']);
      });

      it('still negates the header for "Header: Negative" without a finding', () => {
        expect(terms('REVIEW OF SYSTEMS: Negative except as noted in the HPI.')).toEqual([
          'REVIEW OF SYSTEMS',
        ]);
        expect(terms('GI: Negative.')).toEqual(['GI']);
      });

      it('keeps "Test: negative for X" on the finding', () => {
        expect(terms('Biopsy: negative for malignancy.')).toEqual(['malignancy']);
      });
    });

    describe('"Header:" then "Negative" on the next line', () => {
      it.each([
        ['REVIEW OF SYSTEMS:\nNegative.', 'REVIEW OF SYSTEMS'],
        ['PAST MEDICAL HISTORY:\n  Negative\nMEDICATIONS: None', 'PAST MEDICAL HISTORY'],
        ['GI:\nNegative', 'GI'],
      ])('negates the header in %j', (text, header) => {
        const negations = detectNegations(text);
        expect(negations[0].type).toBe('negative');
        expect(negations[0].negatedText).toBe(header);
        expect(span(text, negations[0])).toMatch(/Negative$/);
      });

      it('does not join a header to a later line', () => {
        expect(detectNegations('ASSESSMENT:\nStable.\nNegative')).toHaveLength(0);
      });
    });

    describe('"not" only negates inside a finding frame', () => {
      it.each([
        ['She does not have chest pain.', 'chest pain'],
        ['He is not experiencing shortness of breath.', 'shortness of breath'],
        ['She is not complaining of headache.', 'headache'],
        ['The patient did not report nausea.', 'nausea'],
        ["He hasn't had any fevers.", 'fevers'],
        ['She has not been febrile overnight.', 'febrile overnight'],
        ['Abdomen was not distended.', 'distended'],
        ['Abdomen soft, not tender.', 'tender'],
        ['He is not in any acute distress.', 'in any acute distress'],
        ['He did not lose consciousness.', 'lose consciousness'],
        ['The pain does not radiate to the jaw.', 'radiate to the jaw'],
        ['She does not use illicit drugs.', 'use illicit drugs'],
        ['He is not a smoker.', 'a smoker'],
        ['He was never hospitalized.', 'hospitalized'],
        ['I do not appreciate any murmur.', 'murmur'],
        ['We did not see a tear on the images.', 'a tear on the images'],
      ])('detects %s', (text, expected) => {
        const negations = detectNegations(text);
        expect(negations.map((n) => n.negatedText)).toEqual([expected]);
        expect(negations[0].type).toBe('absent');
      });

      it.each([
        // pseudo-negations
        'He could not say whether or not the swelling had improved.',
        'Return to clinic if not better in two days.',
        'The lesion is not only red but also warm.',
        'I did not think the outside result was accurate.',
        'I do not see a need for antibiotics today.',
        'The team is not certain of the diagnosis.',
        'It is not clear when the cough began.',
        'Fever is not necessarily present in older adults.',
        'She does not want surgery at this time.',
        'He does not wish to proceed with the biopsy.',
        'The father does not know his blood type.',
        'He does not recall the name of the inhaler.',
        'The patient has not been seen since spring.',
        'Prior records are not available.',
        'Rectal exam was not done.',
        // action frames
        'The mother did not measure his temperature.',
        'The family did not go to the emergency room.',
        'She did not call the clinic over the weekend.',
        'Her temperature was not measured at home.',
        'He could not repeat the phrase.',
        'He is not taking a shower daily.',
        // admin
        'I do not have the outside imaging report.',
        'Risks include but are not limited to bleeding.',
        'Gender: Not provided.',
      ])('does not negate: %s', (text) => {
        expect(detectNegations(text)).toHaveLength(0);
      });
    });

    describe('scope never ends mid-word', () => {
      const endsOnWord = (text: string) =>
        detectNegations(text).forEach((n) => {
          expect(text[n.endOffset] ?? ' ').toMatch(/\W/);
          expect(n.negatedText).not.toMatch(/\s(?:or|and|of|the|to|is)$/);
        });

      it('cuts a long first item at the last whole word', () => {
        const text = 'He never used tobacco products or illicit/intravenous drugs.';
        expect(terms(text)).toEqual(['used tobacco products']);
        endsOnWord(text);
      });

      it('drops a dangling function word at the cut', () => {
        const text = 'There was no new hemorrhage or any other intracerebral pathology on the scan.';
        expect(terms(text)).toEqual(['new hemorrhage']);
        endsOnWord(text);
      });

      it('keeps a single token longer than the limit whole', () => {
        const text = 'No pneumonoultramicroscopicsilicovolcanoconiosis.';
        expect(terms(text)).toEqual(['pneumonoultramicroscopicsilicovolcanoconiosis']);
      });

      it('ends a very long list at a word boundary', () => {
        const text =
          'She denies fever, chills, sweats, nausea, vomiting, diarrhea, constipation, abdominal pain, ' +
          'chest pain, shortness of breath, difficulty breathing, dyspnea on exertion or change in ' +
          'exercise tolerance. She is otherwise well.';
        endsOnWord(text);
        expect(isTermNegated(text, 'dyspnea on exertion')).toBe(true);
      });
    });
  });
});
