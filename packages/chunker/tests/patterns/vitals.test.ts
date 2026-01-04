import { describe, it, expect } from 'vitest';
import {
  detectVitals,
  isWithinVitalPattern,
} from '../../src/patterns/vitals';
import { VITALS_VARIATIONS } from '../fixtures/sample-notes';

describe('Vital Signs Detection', () => {
  describe('Blood Pressure', () => {
    it('should detect standard BP format', () => {
      const text = 'Vital signs: BP: 120/80';
      const vitals = detectVitals(text);

      expect(vitals).toHaveLength(1);
      expect(vitals[0].type).toBe('blood_pressure');
      expect(vitals[0].raw).toContain('BP');
      expect(vitals[0].value).toBe(120);
      expect(vitals[0].value2).toBe(80);
    });

    it('should detect BP with mmHg unit', () => {
      const text = 'Blood pressure 138/82 mmHg recorded';
      const vitals = detectVitals(text);

      expect(vitals).toHaveLength(1);
      expect(vitals[0].type).toBe('blood_pressure');
      expect(vitals[0].unit).toBe('mmHg');
    });

    it('should detect B/P format', () => {
      const text = 'B/P 140/90';
      const vitals = detectVitals(text);

      expect(vitals).toHaveLength(1);
      expect(vitals[0].type).toBe('blood_pressure');
    });

    it('should not split on BP pattern', () => {
      const text = 'Patient BP: 120/80 mmHg stable';
      expect(isWithinVitalPattern(text, 15)).toBe(true); // Inside BP
    });

    it('should detect blood pressure with "over" format', () => {
      const text = 'blood pressure 120 over 80';
      const vitals = detectVitals(text);

      expect(vitals).toHaveLength(1);
      expect(vitals[0].type).toBe('blood_pressure');
      expect(vitals[0].value).toBe(120);
      expect(vitals[0].value2).toBe(80);
    });
  });

  describe('Heart Rate', () => {
    it('should detect HR with bpm', () => {
      const text = 'HR 72 bpm, regular rhythm';
      const vitals = detectVitals(text);

      expect(vitals).toHaveLength(1);
      expect(vitals[0].type).toBe('heart_rate');
      expect(vitals[0].value).toBe(72);
    });

    it('should detect pulse', () => {
      const text = 'Pulse 68';
      const vitals = detectVitals(text);

      expect(vitals).toHaveLength(1);
      expect(vitals[0].type).toBe('heart_rate');
    });

    it('should detect heart rate written out', () => {
      const text = 'Heart rate 76 beats per minute';
      const vitals = detectVitals(text);

      expect(vitals).toHaveLength(1);
      expect(vitals[0].type).toBe('heart_rate');
    });

    it('should detect heart rate with "of" preposition', () => {
      const text = 'heart rate of 72';
      const vitals = detectVitals(text);

      expect(vitals).toHaveLength(1);
      expect(vitals[0].type).toBe('heart_rate');
      expect(vitals[0].value).toBe(72);
    });
  });

  describe('Temperature', () => {
    it('should detect temperature in Fahrenheit', () => {
      const text = 'T: 98.6°F';
      const vitals = detectVitals(text);

      expect(vitals).toHaveLength(1);
      expect(vitals[0].type).toBe('temperature');
      expect(vitals[0].value).toBe(98.6);
    });

    it('should detect temperature in Celsius', () => {
      const text = 'Temp 37.0 C';
      const vitals = detectVitals(text);

      expect(vitals).toHaveLength(1);
      expect(vitals[0].type).toBe('temperature');
    });

    it('should detect temperature without degree symbol', () => {
      const text = 'Temperature 99.1 F';
      const vitals = detectVitals(text);

      expect(vitals).toHaveLength(1);
      expect(vitals[0].type).toBe('temperature');
    });

    it('should detect temperature with "of" preposition', () => {
      const text = 'temperature of 98.6';
      const vitals = detectVitals(text);

      expect(vitals).toHaveLength(1);
      expect(vitals[0].type).toBe('temperature');
      expect(vitals[0].value).toBe(98.6);
    });
  });

  describe('Oxygen Saturation', () => {
    it('should detect O2 sat percentage', () => {
      const text = 'O2 sat 98% on room air';
      const vitals = detectVitals(text);

      expect(vitals).toHaveLength(1);
      expect(vitals[0].type).toBe('oxygen_saturation');
      expect(vitals[0].value).toBe(98);
    });

    it('should detect SpO2 format', () => {
      const text = 'SpO2: 96% on 2L';
      const vitals = detectVitals(text);

      expect(vitals).toHaveLength(1);
      expect(vitals[0].type).toBe('oxygen_saturation');
    });

    it('should detect O2 sat with "percent" spelled out', () => {
      const text = 'O2 sat 98 percent';
      const vitals = detectVitals(text);

      expect(vitals).toHaveLength(1);
      expect(vitals[0].type).toBe('oxygen_saturation');
      expect(vitals[0].value).toBe(98);
    });
  });

  describe('Respiratory Rate', () => {
    it('should detect RR', () => {
      const text = 'RR 16';
      const vitals = detectVitals(text);

      expect(vitals).toHaveLength(1);
      expect(vitals[0].type).toBe('respiratory_rate');
      expect(vitals[0].value).toBe(16);
    });

    it('should detect respiratory rate written out', () => {
      const text = 'Respiratory rate 18/min';
      const vitals = detectVitals(text);

      expect(vitals).toHaveLength(1);
      expect(vitals[0].type).toBe('respiratory_rate');
    });

    it('should detect "respirations" as respiratory rate', () => {
      const text = 'respirations 16';
      const vitals = detectVitals(text);

      expect(vitals).toHaveLength(1);
      expect(vitals[0].type).toBe('respiratory_rate');
      expect(vitals[0].value).toBe(16);
    });
  });

  describe('Multiple Vitals', () => {
    it('should detect all vitals in a typical vital signs string', () => {
      const text = 'Vital signs: BP 132/78, HR 72, RR 16, T 98.6°F, O2 sat 98%';
      const vitals = detectVitals(text);

      expect(vitals.length).toBeGreaterThanOrEqual(5);
      const types = vitals.map((v) => v.type);
      expect(types).toContain('blood_pressure');
      expect(types).toContain('heart_rate');
      expect(types).toContain('respiratory_rate');
      expect(types).toContain('temperature');
      expect(types).toContain('oxygen_saturation');
    });

    it('should detect vitals from sample with variations', () => {
      const vitals = detectVitals(VITALS_VARIATIONS);

      // Should find multiple vitals of each type
      expect(vitals.length).toBeGreaterThan(10);
    });
  });

  describe('Weight and Height', () => {
    it('should detect weight in lbs', () => {
      const text = 'Wt: 180 lbs';
      const vitals = detectVitals(text);

      expect(vitals).toHaveLength(1);
      expect(vitals[0].type).toBe('weight');
      expect(vitals[0].value).toBe(180);
    });

    it('should detect weight in kg', () => {
      const text = 'Weight 81.6 kg';
      const vitals = detectVitals(text);

      expect(vitals).toHaveLength(1);
      expect(vitals[0].type).toBe('weight');
    });

    it('should detect "weighs" as weight', () => {
      const text = 'Patient weighs 180 lbs';
      const vitals = detectVitals(text);

      expect(vitals).toHaveLength(1);
      expect(vitals[0].type).toBe('weight');
      expect(vitals[0].value).toBe(180);
    });
  });

  describe('Pain Scale', () => {
    it('should detect pain scale', () => {
      const text = 'Pain 7/10';
      const vitals = detectVitals(text);

      expect(vitals).toHaveLength(1);
      expect(vitals[0].type).toBe('pain_scale');
      expect(vitals[0].value).toBe(7);
    });
  });

  describe('Conversational Speech Patterns', () => {
    it('should detect blood pressure with "is" in conversational speech', () => {
      const text = 'blood pressure is 100 over 65';
      const vitals = detectVitals(text);

      expect(vitals).toHaveLength(1);
      expect(vitals[0].type).toBe('blood_pressure');
      expect(vitals[0].value).toBe(100);
      expect(vitals[0].value2).toBe(65);
    });

    it('should detect BP with "was" in conversational speech', () => {
      const text = 'BP was 120/80';
      const vitals = detectVitals(text);

      expect(vitals).toHaveLength(1);
      expect(vitals[0].type).toBe('blood_pressure');
      expect(vitals[0].value).toBe(120);
      expect(vitals[0].value2).toBe(80);
    });

    it('should detect heart rate with "is" in conversational speech', () => {
      const text = 'heart rate is 88';
      const vitals = detectVitals(text);

      expect(vitals).toHaveLength(1);
      expect(vitals[0].type).toBe('heart_rate');
      expect(vitals[0].value).toBe(88);
    });

    it('should detect pulse with "is" in conversational speech', () => {
      const text = 'pulse is 72';
      const vitals = detectVitals(text);

      expect(vitals).toHaveLength(1);
      expect(vitals[0].type).toBe('heart_rate');
      expect(vitals[0].value).toBe(72);
    });

    it('should detect temperature with "is" in conversational speech', () => {
      const text = 'temperature is 98.6';
      const vitals = detectVitals(text);

      expect(vitals).toHaveLength(1);
      expect(vitals[0].type).toBe('temperature');
      expect(vitals[0].value).toBe(98.6);
    });

    it('should detect respiratory rate with "is" in conversational speech', () => {
      const text = 'respiratory rate is 18';
      const vitals = detectVitals(text);

      expect(vitals).toHaveLength(1);
      expect(vitals[0].type).toBe('respiratory_rate');
      expect(vitals[0].value).toBe(18);
    });

    it('should detect oxygen with "is" in conversational speech', () => {
      const text = 'oxygen is 97';
      const vitals = detectVitals(text);

      expect(vitals).toHaveLength(1);
      expect(vitals[0].type).toBe('oxygen_saturation');
      expect(vitals[0].value).toBe(97);
    });

    it('should detect BP in full conversational sentence', () => {
      const text =
        "I'm not sure what's going on right now but just looking at the patient I can see that their blood pressure is 100 over 65";
      const vitals = detectVitals(text);

      expect(vitals).toHaveLength(1);
      expect(vitals[0].type).toBe('blood_pressure');
      expect(vitals[0].value).toBe(100);
      expect(vitals[0].value2).toBe(65);
    });
  });
});
