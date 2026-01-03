import { describe, it, expect, vi } from 'vitest';
import {
  detectPhi,
  containsPhi,
  getPhiFreeRanges,
  BASIC_PHI_PATTERNS,
  PHI_CONFIDENCE,
} from '../../src/patterns/phi';
import { NOTE_WITH_PHI } from '../fixtures/sample-notes';

describe('PHI Detection', () => {
  describe('Date Detection', () => {
    it('should detect MM/DD/YYYY format', () => {
      const text = 'Visit date: 01/15/2024';
      const markers = detectPhi(text);

      expect(markers.length).toBeGreaterThanOrEqual(1);
      const dateMarker = markers.find((m) => m.type === 'date');
      expect(dateMarker).toBeDefined();
    });

    it('should detect MM-DD-YYYY format', () => {
      const text = 'DOB: 03-22-1985';
      const markers = detectPhi(text);

      const dateMarker = markers.find((m) => m.type === 'date');
      expect(dateMarker).toBeDefined();
    });

    it('should detect written dates', () => {
      const text = 'Patient was seen on January 15, 2024.';
      const markers = detectPhi(text);

      const dateMarker = markers.find((m) => m.type === 'date');
      expect(dateMarker).toBeDefined();
    });

    it('should detect DOB with label', () => {
      const text = 'DOB: 05/20/1960';
      const markers = detectPhi(text);

      expect(markers.length).toBeGreaterThanOrEqual(1);
    });

    it('should detect Date of Birth written out', () => {
      const text = 'Date of Birth: 1960-05-20';
      const markers = detectPhi(text);

      expect(markers.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('MRN Detection', () => {
    it('should detect MRN with label', () => {
      const text = 'MRN: 12345678';
      const markers = detectPhi(text);

      expect(markers).toHaveLength(1);
      expect(markers[0].type).toBe('mrn');
    });

    it('should detect Medical Record Number', () => {
      const text = 'Medical Record Number: 87654321';
      const markers = detectPhi(text);

      expect(markers).toHaveLength(1);
      expect(markers[0].type).toBe('mrn');
    });

    it('should detect Patient ID', () => {
      const text = 'Patient ID: 11223344';
      const markers = detectPhi(text);

      expect(markers).toHaveLength(1);
      expect(markers[0].type).toBe('mrn');
    });

    it('should detect Acct#', () => {
      const text = 'Acct# 99887766';
      const markers = detectPhi(text);

      expect(markers).toHaveLength(1);
      expect(markers[0].type).toBe('mrn');
    });

    it('should detect alphanumeric MRN', () => {
      const text = 'MRN: ABC123456';
      const markers = detectPhi(text);

      expect(markers).toHaveLength(1);
      expect(markers[0].type).toBe('mrn');
    });
  });

  describe('Phone Number Detection', () => {
    it('should detect (XXX) XXX-XXXX format', () => {
      const text = 'Contact: (555) 123-4567';
      const markers = detectPhi(text);

      const phoneMarker = markers.find((m) => m.type === 'phone');
      expect(phoneMarker).toBeDefined();
    });

    it('should detect XXX-XXX-XXXX format', () => {
      const text = 'Phone: 555-123-4567';
      const markers = detectPhi(text);

      const phoneMarker = markers.find((m) => m.type === 'phone');
      expect(phoneMarker).toBeDefined();
    });

    it('should detect XXX.XXX.XXXX format', () => {
      const text = 'Cell: 555.123.4567';
      const markers = detectPhi(text);

      const phoneMarker = markers.find((m) => m.type === 'phone');
      expect(phoneMarker).toBeDefined();
    });

    it('should detect phone with +1 prefix', () => {
      const text = 'Tel: +1-555-123-4567';
      const markers = detectPhi(text);

      const phoneMarker = markers.find((m) => m.type === 'phone');
      expect(phoneMarker).toBeDefined();
    });

    it('should detect labeled phone numbers', () => {
      const text = 'telephone: 555-987-6543';
      const markers = detectPhi(text);

      const phoneMarker = markers.find((m) => m.type === 'phone');
      expect(phoneMarker).toBeDefined();
    });
  });

  describe('Email Detection', () => {
    it('should detect standard email format', () => {
      const text = 'Email: patient@example.com';
      const markers = detectPhi(text);

      expect(markers).toHaveLength(1);
      expect(markers[0].type).toBe('email');
    });

    it('should detect email with subdomain', () => {
      const text = 'Send to user@mail.hospital.org please';
      const markers = detectPhi(text);

      const emailMarker = markers.find((m) => m.type === 'email');
      expect(emailMarker).toBeDefined();
    });

    it('should detect email with special characters', () => {
      const text = 'Send to: john.doe+medical@healthcare.net';
      const markers = detectPhi(text);

      expect(markers).toHaveLength(1);
      expect(markers[0].type).toBe('email');
    });
  });

  describe('SSN Detection', () => {
    it('should detect SSN with dashes', () => {
      const text = 'SSN: 123-45-6789';
      const markers = detectPhi(text);

      const ssnMarker = markers.find((m) => m.type === 'ssn');
      expect(ssnMarker).toBeDefined();
    });

    it('should detect Social Security Number written out', () => {
      const text = 'Social Security Number: 987-65-4321';
      const markers = detectPhi(text);

      const ssnMarker = markers.find((m) => m.type === 'ssn');
      expect(ssnMarker).toBeDefined();
    });

    it('should detect standalone SSN format', () => {
      const text = 'ID provided: 111-22-3333';
      const markers = detectPhi(text);

      const ssnMarker = markers.find((m) => m.type === 'ssn');
      expect(ssnMarker).toBeDefined();
    });
  });

  describe('Age Over 89 Detection', () => {
    it('should detect age 90 year old', () => {
      const text = 'Patient is a 90 year old female.';
      const markers = detectPhi(text);

      const ageMarker = markers.find((m) => m.type === 'age_over_89');
      expect(ageMarker).toBeDefined();
    });

    it('should detect age 95 year old', () => {
      const text = '95 year old male with chest pain.';
      const markers = detectPhi(text);

      const ageMarker = markers.find((m) => m.type === 'age_over_89');
      expect(ageMarker).toBeDefined();
    });

    it('should detect age over 100', () => {
      const text = '102 year old patient.';
      const markers = detectPhi(text);

      const ageMarker = markers.find((m) => m.type === 'age_over_89');
      expect(ageMarker).toBeDefined();
    });

    it('should not flag age under 90', () => {
      const text = 'Patient is a 85 year old male.';
      const markers = detectPhi(text);

      const ageMarker = markers.find((m) => m.type === 'age_over_89');
      expect(ageMarker).toBeUndefined();
    });

    it('should detect age with label', () => {
      const text = 'Age: 91';
      const markers = detectPhi(text);

      const ageMarker = markers.find((m) => m.type === 'age_over_89');
      expect(ageMarker).toBeDefined();
    });
  });

  describe('Name Detection', () => {
    it('should detect Dr. followed by name', () => {
      const text = 'Seen by Dr. Smith today.';
      const markers = detectPhi(text);

      const nameMarker = markers.find((m) => m.type === 'name');
      expect(nameMarker).toBeDefined();
    });

    it('should detect Patient Name with label', () => {
      const text = 'Patient Name: John Doe';
      const markers = detectPhi(text);

      const nameMarker = markers.find((m) => m.type === 'name');
      expect(nameMarker).toBeDefined();
    });

    it('should detect Attn name', () => {
      const text = 'Attn: Jane Wilson';
      const markers = detectPhi(text);

      const nameMarker = markers.find((m) => m.type === 'name');
      expect(nameMarker).toBeDefined();
    });
  });

  describe('Address Detection', () => {
    it('should detect street address', () => {
      const text = 'Lives at 123 Main Street';
      const markers = detectPhi(text);

      const addressMarker = markers.find((m) => m.type === 'address');
      expect(addressMarker).toBeDefined();
    });

    it('should detect address with Avenue', () => {
      const text = 'Address: 456 Oak Avenue, Apt 2B';
      const markers = detectPhi(text);

      const addressMarker = markers.find((m) => m.type === 'address');
      expect(addressMarker).toBeDefined();
    });

    it('should detect PO Box', () => {
      const text = 'Mail to: P.O. Box 789';
      const markers = detectPhi(text);

      const addressMarker = markers.find((m) => m.type === 'address');
      expect(addressMarker).toBeDefined();
    });

    it('should detect Post Office Box', () => {
      const text = 'Post Office Box 123';
      const markers = detectPhi(text);

      const addressMarker = markers.find((m) => m.type === 'address');
      expect(addressMarker).toBeDefined();
    });

    it('should detect address with label', () => {
      const text = 'Address: 789 Elm Drive, Suite 100';
      const markers = detectPhi(text);

      const addressMarker = markers.find((m) => m.type === 'address');
      expect(addressMarker).toBeDefined();
    });
  });

  describe('Multiple PHI Types', () => {
    it('should detect all PHI in NOTE_WITH_PHI', () => {
      const markers = detectPhi(NOTE_WITH_PHI);

      expect(markers.length).toBeGreaterThan(3);

      const types = markers.map((m) => m.type);
      expect(types).toContain('mrn');
      expect(types).toContain('phone');
      expect(types).toContain('email');
    });

    it('should detect multiple PHI in single text', () => {
      const text = `Patient: John Smith
DOB: 01/15/1960
MRN: 12345678
Phone: (555) 123-4567
Email: jsmith@email.com`;

      const markers = detectPhi(text);
      expect(markers.length).toBeGreaterThanOrEqual(4);
    });

    it('should maintain order by position', () => {
      const markers = detectPhi(NOTE_WITH_PHI);

      for (let i = 1; i < markers.length; i++) {
        expect(markers[i].startOffset).toBeGreaterThanOrEqual(markers[i - 1].startOffset);
      }
    });
  });

  describe('containsPhi', () => {
    it('should return true when PHI is present', () => {
      const text = 'Patient MRN: 12345678';
      expect(containsPhi(text)).toBe(true);
    });

    it('should return false when no PHI is present', () => {
      const text = 'Patient presents with chest pain and shortness of breath.';
      expect(containsPhi(text)).toBe(false);
    });

    it('should return true for NOTE_WITH_PHI', () => {
      expect(containsPhi(NOTE_WITH_PHI)).toBe(true);
    });
  });

  describe('getPhiFreeRanges', () => {
    it('should return ranges without PHI', () => {
      const text = 'Text before MRN: 12345678 text after';
      const ranges = getPhiFreeRanges(text);

      expect(ranges.length).toBeGreaterThanOrEqual(1);
    });

    it('should return full text range when no PHI', () => {
      const text = 'No PHI in this clinical text.';
      const ranges = getPhiFreeRanges(text);

      expect(ranges).toHaveLength(1);
      expect(ranges[0].start).toBe(0);
      expect(ranges[0].end).toBe(text.length);
    });

    it('should return multiple ranges for text with multiple PHI', () => {
      const text = 'Start MRN: 12345678 middle SSN: 123-45-6789 end';
      const ranges = getPhiFreeRanges(text);

      expect(ranges.length).toBeGreaterThanOrEqual(2);
    });

    it('should have non-overlapping ranges', () => {
      const ranges = getPhiFreeRanges(NOTE_WITH_PHI);

      for (let i = 1; i < ranges.length; i++) {
        expect(ranges[i].start).toBeGreaterThanOrEqual(ranges[i - 1].end);
      }
    });
  });

  describe('Confidence Scores', () => {
    it('should have highest confidence for SSN and email', () => {
      expect(PHI_CONFIDENCE.ssn).toBe(0.95);
      expect(PHI_CONFIDENCE.email).toBe(0.95);
    });

    it('should have lower confidence for names', () => {
      expect(PHI_CONFIDENCE.name).toBe(0.50);
    });

    it('should have moderate confidence for dates', () => {
      expect(PHI_CONFIDENCE.date).toBe(0.60);
    });

    it('should include confidence in detection results', () => {
      const text = 'MRN: 12345678 Email: test@test.com';
      const markers = detectPhi(text);

      for (const marker of markers) {
        expect(marker.confidence).toBeDefined();
        expect(marker.confidence).toBeGreaterThan(0);
        expect(marker.confidence).toBeLessThanOrEqual(1);
      }
    });
  });

  describe('Position Tracking', () => {
    it('should track start and end offsets', () => {
      const text = 'MRN: 12345678';
      const markers = detectPhi(text);

      expect(markers[0].startOffset).toBeDefined();
      expect(markers[0].endOffset).toBeDefined();
      expect(markers[0].endOffset).toBeGreaterThan(markers[0].startOffset);
    });

    it('should have correct offsets for extraction', () => {
      const text = 'Patient email: test@example.com is on file.';
      const markers = detectPhi(text);

      const emailMarker = markers.find((m) => m.type === 'email');
      expect(emailMarker).toBeDefined();

      const extracted = text.substring(emailMarker!.startOffset, emailMarker!.endOffset);
      expect(extracted).toBe('test@example.com');
    });
  });

  describe('Enhanced Mode Warning', () => {
    it('should warn when enhanced mode requested', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      detectPhi('Some text', 'enhanced');

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Enhanced PHI detection requires')
      );

      consoleSpy.mockRestore();
    });

    it('should still detect PHI in enhanced mode fallback', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const markers = detectPhi('MRN: 12345678', 'enhanced');
      expect(markers.length).toBeGreaterThan(0);

      consoleSpy.mockRestore();
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty text', () => {
      const markers = detectPhi('');
      expect(markers).toHaveLength(0);
    });

    it('should handle text with no PHI', () => {
      const text = 'Patient presents with chest pain of two hours duration.';
      const markers = detectPhi(text);
      expect(markers).toHaveLength(0);
    });

    it('should deduplicate overlapping markers', () => {
      // Some patterns might overlap
      const text = 'SSN: 123-45-6789';
      const markers = detectPhi(text);

      // Check no overlapping ranges
      for (let i = 1; i < markers.length; i++) {
        expect(markers[i].startOffset).toBeGreaterThanOrEqual(markers[i - 1].endOffset);
      }
    });

    it('should not match partial phone numbers', () => {
      const text = 'Room 123 on floor 4';
      const markers = detectPhi(text);

      const phoneMarker = markers.find((m) => m.type === 'phone');
      expect(phoneMarker).toBeUndefined();
    });

    it('should not match clinical values as SSN', () => {
      const text = 'BP 120/80, HR 72';
      const markers = detectPhi(text);

      const ssnMarker = markers.find((m) => m.type === 'ssn');
      expect(ssnMarker).toBeUndefined();
    });
  });

  describe('Clinical Scenarios', () => {
    it('should detect PHI in patient header', () => {
      const text = `PATIENT: Jane Doe
MRN: 98765432
DOB: 04/22/1955
Phone: (555) 999-8888`;

      const markers = detectPhi(text);
      expect(markers.length).toBeGreaterThanOrEqual(3);
    });

    it('should handle mixed content with PHI and clinical data', () => {
      const text = `Patient John Smith (MRN: 12345678) presents with BP 140/90.
Email: jsmith@hospital.org for follow-up.
Labs: WBC 8.5, Hgb 14.2, Plt 250`;

      const markers = detectPhi(text);
      const types = markers.map((m) => m.type);

      expect(types).toContain('mrn');
      expect(types).toContain('email');
    });

    it('should not flag clinical measurements as PHI', () => {
      const text = `Vitals: BP 120/80, HR 72, RR 16, T 98.6F
Labs: Glucose 95, HbA1c 6.2%, eGFR 90`;

      const markers = detectPhi(text);
      // Should be minimal or no PHI detected
      expect(markers.length).toBeLessThan(3);
    });
  });

  describe('Pattern Coverage', () => {
    it('should have patterns for all PHI types except unknown', () => {
      const patternTypes = Object.keys(BASIC_PHI_PATTERNS);

      expect(patternTypes).toContain('date');
      expect(patternTypes).toContain('mrn');
      expect(patternTypes).toContain('phone');
      expect(patternTypes).toContain('email');
      expect(patternTypes).toContain('ssn');
      expect(patternTypes).toContain('age_over_89');
      expect(patternTypes).toContain('name');
      expect(patternTypes).toContain('address');
    });

    it('should have confidence scores for all PHI types', () => {
      expect(PHI_CONFIDENCE.date).toBeDefined();
      expect(PHI_CONFIDENCE.mrn).toBeDefined();
      expect(PHI_CONFIDENCE.phone).toBeDefined();
      expect(PHI_CONFIDENCE.email).toBeDefined();
      expect(PHI_CONFIDENCE.ssn).toBeDefined();
      expect(PHI_CONFIDENCE.age_over_89).toBeDefined();
      expect(PHI_CONFIDENCE.name).toBeDefined();
      expect(PHI_CONFIDENCE.address).toBeDefined();
      expect(PHI_CONFIDENCE.unknown).toBeDefined();
    });
  });
});
