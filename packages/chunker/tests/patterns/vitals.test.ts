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

  describe('Real-note precision fixes', () => {
    /** Detect and keep only one vital type. */
    const ofType = (text: string, type: string) =>
      detectVitals(text).filter((v) => v.type === type);

    describe('Temperature vs spinal levels and lab values (item 1)', () => {
      it.each([
        ['T 98.6', 98.6],
        ['T: 37.2C', 37.2],
        ['Temp 101.2 F', 101.2],
        ['T 36.8 C', 36.8],
        ['T 104', 104],
      ])('should detect plausible temperature in "%s"', (text, value) => {
        const temps = ofType(text, 'temperature');
        expect(temps).toHaveLength(1);
        expect(temps[0].value).toBe(value);
        expect(temps[0].raw).toBe(text);
      });

      it('should keep the Celsius unit on "T: 37.2C"', () => {
        expect(ofType('T: 37.2C', 'temperature')[0].unit).toBe('C');
      });

      it.each([
        'PREOPERATIVE DIAGNOSIS: T11 compression fracture',
        'Fracture of the T12 vertebra',
        'Karyotype consistent with T18',
        'Troponin T 564 ng/L',
        'Troponin T 39 ng/L',
        'MRI showed T 5 lesion',
        'Stored at temperature 25 C',
      ])('should not detect temperature in "%s"', (text) => {
        expect(ofType(text, 'temperature')).toHaveLength(0);
      });

      it('should not read a "(rectal)" qualifier as a Celsius unit', () => {
        const temps = ofType('Temp (rectal) 101.4', 'temperature');
        expect(temps).toHaveLength(1);
        expect(temps[0].unit).toBeUndefined();
      });
    });

    describe('Oxygen flow rate is not saturation (item 2)', () => {
      it.each([
        'Patient on oxygen 10 L/min via mask',
        'on high flow oxygen 60 L/min',
        'oxygen 50 lpm via high flow',
        'placed on 40% oxygen by face mask',
      ])('should not detect saturation in "%s"', (text) => {
        expect(ofType(text, 'oxygen_saturation')).toHaveLength(0);
      });

      it('should still detect saturation next to a flow rate', () => {
        const sats = ofType('O2 sat 94% on 2L NC', 'oxygen_saturation');
        expect(sats).toHaveLength(1);
        expect(sats[0].raw).toBe('O2 sat 94% on 2L NC');
      });
    });

    describe('Full spans (items 3-5)', () => {
      it('should keep the % in "oxygen saturation 95%" (item 3)', () => {
        const sats = ofType('Her oxygen saturation 95% today', 'oxygen_saturation');
        expect(sats).toHaveLength(1);
        expect(sats[0].raw).toBe('oxygen saturation 95%');
        expect(sats[0].value).toBe(95);
      });

      it('should keep the % at end of text', () => {
        expect(ofType('O2 sat 98%', 'oxygen_saturation')[0].raw).toBe('O2 sat 98%');
      });

      it('should keep the unit in "Temperature: 100.4 degrees F" (item 4)', () => {
        const temps = ofType('Temperature: 100.4 degrees F, febrile', 'temperature');
        expect(temps).toHaveLength(1);
        expect(temps[0].raw).toBe('Temperature: 100.4 degrees F');
        expect(temps[0].value).toBe(100.4);
        expect(temps[0].unit).toBe('F');
      });

      it('should capture a whole heart rate range "HR of 30-40" (item 5)', () => {
        const hrs = ofType('Bradycardic with HR of 30-40 overnight', 'heart_rate');
        expect(hrs).toHaveLength(1);
        expect(hrs[0].raw).toBe('HR of 30-40');
        expect(hrs[0].value).toBe(30);
        expect(hrs[0].value2).toBe(40);
      });

      it('should capture a heart rate range written with "to"', () => {
        const hrs = ofType('pulse 60 to 70 bpm', 'heart_rate');
        expect(hrs).toHaveLength(1);
        expect(hrs[0].raw).toBe('pulse 60 to 70 bpm');
        expect(hrs[0].value2).toBe(70);
      });
    });

    describe('New label variants (items 6-8)', () => {
      it.each([
        ['pulse oximetry of 98%', 98],
        ['SaO2 98%', 98],
        ['saturating 79%', 79],
        ['saturating 92% on room air', 92],
      ])('should detect saturation in "%s" (item 6)', (text, value) => {
        const sats = ofType(text, 'oxygen_saturation');
        expect(sats).toHaveLength(1);
        expect(sats[0].value).toBe(value);
        expect(sats[0].raw).toBe(text);
      });

      it('should not read "pulse oximetry" as a heart rate', () => {
        expect(ofType('pulse oximetry of 98%', 'heart_rate')).toHaveLength(0);
      });

      it.each([
        ['Pulse rate of 55', 55],
        ['pulse 88', 88],
      ])('should detect heart rate in "%s" (item 7)', (text, value) => {
        const hrs = ofType(text, 'heart_rate');
        expect(hrs).toHaveLength(1);
        expect(hrs[0].value).toBe(value);
        expect(hrs[0].raw).toBe(text);
      });

      it.each([
        ['Respirations are 26', 26],
        ['Respiration: 16', 16],
      ])('should detect respiratory rate in "%s" (item 8)', (text, value) => {
        const rrs = ofType(text, 'respiratory_rate');
        expect(rrs).toHaveLength(1);
        expect(rrs[0].value).toBe(value);
        expect(rrs[0].raw).toBe(text);
      });
    });

    describe('Separators and word order (items 9-12)', () => {
      it('should detect vitals with "=" separators (item 9)', () => {
        const vitals = detectVitals('Temp = 38.3C BP =146/52 HR= 113 RR = 18 SaO2 = 98%');

        expect(vitals.map((v) => [v.type, v.raw])).toEqual([
          ['temperature', 'Temp = 38.3C'],
          ['blood_pressure', 'BP =146/52'],
          ['heart_rate', 'HR= 113'],
          ['respiratory_rate', 'RR = 18'],
          ['oxygen_saturation', 'SaO2 = 98%'],
        ]);
        expect(vitals[0].value).toBe(38.3);
        expect(vitals[1].value).toBe(146);
        expect(vitals[1].value2).toBe(52);
        expect(vitals[2].value).toBe(113);
        expect(vitals[3].value).toBe(18);
        expect(vitals[4].value).toBe(98);
      });

      it('should detect a value before its label "95% O2 saturation" (item 10)', () => {
        const sats = ofType('She was 95% O2 saturation at rest', 'oxygen_saturation');
        expect(sats).toHaveLength(1);
        expect(sats[0].raw).toBe('95% O2 saturation');
        expect(sats[0].value).toBe(95);
      });

      it('should allow filler words "Blood pressure today is 182/78" (item 11)', () => {
        const bps = ofType('Blood pressure today is 182/78.', 'blood_pressure');
        expect(bps).toHaveLength(1);
        expect(bps[0].raw).toBe('Blood pressure today is 182/78');
        expect(bps[0].value).toBe(182);
        expect(bps[0].value2).toBe(78);
      });

      it('should allow a parenthetical qualifier "BP (supine) 182/113" (item 12)', () => {
        const bps = ofType('BP (supine) 182/113, BP (standing) 150/90', 'blood_pressure');
        expect(bps).toHaveLength(2);
        expect(bps[0].raw).toBe('BP (supine) 182/113');
        expect(bps[0].value).toBe(182);
        expect(bps[0].value2).toBe(113);
        expect(bps[1].raw).toBe('BP (standing) 150/90');
      });
    });

    describe('Labelled hypothermia and filler phrases', () => {
      it.each([
        ['temperature of 87.1 Fahrenheit', 87.1, 'Fahrenheit'],
        ['Temp 30.5 C', 30.5, 'C'],
        ['Tmax 101.2 F', 101.2, 'F'],
        ['T-max is 99.3', 99.3, undefined],
      ])('should detect labelled temperature "%s"', (text, value, unit) => {
        const temps = ofType(text, 'temperature');
        expect(temps).toHaveLength(1);
        expect(temps[0].raw).toBe(text);
        expect(temps[0].value).toBe(value);
        expect(temps[0].unit).toBe(unit);
      });

      it.each([
        'T11',
        'T 87.1',
        'T 30.5 C',
        'lesioned with a temperature of 80 degrees for 90 seconds',
        'lesioned with a temperature of 85 degrees Celsius for 90 seconds',
      ])('should not detect temperature in "%s"', (text) => {
        expect(ofType(text, 'temperature')).toHaveLength(0);
      });

      it.each([
        ['His blood pressure was noted to be 180/95 mmHg.', 'blood pressure was noted to be 180/95 mmHg', 180, 95],
        ['Her blood pressure today in office was 132/80 mm Hg.', 'blood pressure today in office was 132/80 mm Hg', 132, 80],
        ['Her blood pressure in the office was 188/94, HR 70', 'blood pressure in the office was 188/94', 188, 94],
      ])('should allow filler phrases in "%s"', (text, raw, systolic, diastolic) => {
        const bps = ofType(text, 'blood_pressure');
        expect(bps).toHaveLength(1);
        expect(bps[0].raw).toBe(raw);
        expect(bps[0].value).toBe(systolic);
        expect(bps[0].value2).toBe(diastolic);
      });
    });
  });
});
