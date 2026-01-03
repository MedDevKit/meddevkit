import { describe, it, expect } from 'vitest';
import {
  detectSections,
  getSectionAtPosition,
  getSectionBoundaries,
  isAtSectionBoundary,
  createSectionIndex,
  SECTION_PATTERNS,
} from '../../src/patterns/sections';
import { SIMPLE_NOTE, LONG_NOTE } from '../fixtures/sample-notes';

describe('Clinical Section Detection', () => {
  describe('Chief Complaint', () => {
    it('should detect CHIEF COMPLAINT header', () => {
      const text = 'CHIEF COMPLAINT: Chest pain';
      const sections = detectSections(text);

      expect(sections).toHaveLength(1);
      expect(sections[0].type).toBe('chief_complaint');
      expect(sections[0].header).toContain('CHIEF COMPLAINT');
    });

    it('should detect CC abbreviation', () => {
      const text = 'CC: Headache and dizziness';
      const sections = detectSections(text);

      expect(sections).toHaveLength(1);
      expect(sections[0].type).toBe('chief_complaint');
    });

    it('should detect REASON FOR VISIT', () => {
      const text = 'REASON FOR VISIT: Annual physical';
      const sections = detectSections(text);

      expect(sections).toHaveLength(1);
      expect(sections[0].type).toBe('chief_complaint');
    });
  });

  describe('History of Present Illness', () => {
    it('should detect HISTORY OF PRESENT ILLNESS', () => {
      const text = 'HISTORY OF PRESENT ILLNESS:\nPatient presents with...';
      const sections = detectSections(text);

      expect(sections).toHaveLength(1);
      expect(sections[0].type).toBe('hpi');
    });

    it('should detect HPI abbreviation', () => {
      const text = 'HPI: 55 year old male with chest pain';
      const sections = detectSections(text);

      expect(sections).toHaveLength(1);
      expect(sections[0].type).toBe('hpi');
    });
  });

  describe('Past Medical History', () => {
    it('should detect PAST MEDICAL HISTORY', () => {
      const text = 'PAST MEDICAL HISTORY:\n1. Diabetes\n2. Hypertension';
      const sections = detectSections(text);

      expect(sections).toHaveLength(1);
      expect(sections[0].type).toBe('past_medical_history');
    });

    it('should detect PMH abbreviation', () => {
      const text = 'PMH: HTN, DM2, HLD';
      const sections = detectSections(text);

      expect(sections).toHaveLength(1);
      expect(sections[0].type).toBe('past_medical_history');
    });

    it('should detect PMHx variant', () => {
      const text = 'PMHx: Significant for coronary artery disease';
      const sections = detectSections(text);

      expect(sections).toHaveLength(1);
      expect(sections[0].type).toBe('past_medical_history');
    });
  });

  describe('Past Surgical History', () => {
    it('should detect PAST SURGICAL HISTORY', () => {
      const text = 'PAST SURGICAL HISTORY:\n1. Appendectomy 2010';
      const sections = detectSections(text);

      expect(sections).toHaveLength(1);
      expect(sections[0].type).toBe('past_surgical_history');
    });

    it('should detect PSH abbreviation', () => {
      const text = 'PSH: Cholecystectomy, knee replacement';
      const sections = detectSections(text);

      expect(sections).toHaveLength(1);
      expect(sections[0].type).toBe('past_surgical_history');
    });
  });

  describe('Medications', () => {
    it('should detect MEDICATIONS header', () => {
      const text = 'MEDICATIONS:\n1. Metformin 500mg BID';
      const sections = detectSections(text);

      expect(sections).toHaveLength(1);
      expect(sections[0].type).toBe('medications');
    });

    it('should detect CURRENT MEDICATIONS', () => {
      const text = 'CURRENT MEDICATIONS: Lisinopril 10mg daily';
      const sections = detectSections(text);

      expect(sections).toHaveLength(1);
      expect(sections[0].type).toBe('medications');
    });

    it('should detect HOME MEDICATIONS', () => {
      const text = 'HOME MEDICATIONS:\nAspirin 81mg daily';
      const sections = detectSections(text);

      expect(sections).toHaveLength(1);
      expect(sections[0].type).toBe('medications');
    });
  });

  describe('Allergies', () => {
    it('should detect ALLERGIES header', () => {
      const text = 'ALLERGIES: Penicillin - rash';
      const sections = detectSections(text);

      expect(sections).toHaveLength(1);
      expect(sections[0].type).toBe('allergies');
    });

    it('should detect NKDA', () => {
      const text = 'NKDA';
      const sections = detectSections(text);

      expect(sections).toHaveLength(1);
      expect(sections[0].type).toBe('allergies');
    });

    it('should detect NO KNOWN DRUG ALLERGIES', () => {
      const text = 'NO KNOWN DRUG ALLERGIES';
      const sections = detectSections(text);

      expect(sections).toHaveLength(1);
      expect(sections[0].type).toBe('allergies');
    });
  });

  describe('Family History', () => {
    it('should detect FAMILY HISTORY', () => {
      const text = 'FAMILY HISTORY:\nFather - heart disease';
      const sections = detectSections(text);

      expect(sections).toHaveLength(1);
      expect(sections[0].type).toBe('family_history');
    });

    it('should detect FH abbreviation', () => {
      const text = 'FH: Mother with diabetes';
      const sections = detectSections(text);

      expect(sections).toHaveLength(1);
      expect(sections[0].type).toBe('family_history');
    });
  });

  describe('Social History', () => {
    it('should detect SOCIAL HISTORY', () => {
      const text = 'SOCIAL HISTORY:\nNon-smoker, occasional alcohol';
      const sections = detectSections(text);

      expect(sections).toHaveLength(1);
      expect(sections[0].type).toBe('social_history');
    });

    it('should detect SH abbreviation', () => {
      const text = 'SH: Retired teacher, no tobacco use';
      const sections = detectSections(text);

      expect(sections).toHaveLength(1);
      expect(sections[0].type).toBe('social_history');
    });
  });

  describe('Review of Systems', () => {
    it('should detect REVIEW OF SYSTEMS', () => {
      const text = 'REVIEW OF SYSTEMS:\nGeneral: No fever or chills';
      const sections = detectSections(text);

      expect(sections.length).toBeGreaterThanOrEqual(1);
      expect(sections[0].type).toBe('review_of_systems');
    });

    it('should detect ROS abbreviation', () => {
      const text = 'ROS: Negative except as noted in HPI';
      const sections = detectSections(text);

      expect(sections).toHaveLength(1);
      expect(sections[0].type).toBe('review_of_systems');
    });
  });

  describe('Physical Exam', () => {
    it('should detect PHYSICAL EXAMINATION', () => {
      const text = 'PHYSICAL EXAMINATION:\nGeneral: Alert and oriented';
      const sections = detectSections(text);

      expect(sections).toHaveLength(1);
      expect(sections[0].type).toBe('physical_exam');
    });

    it('should detect PE abbreviation', () => {
      const text = 'PE: Well-appearing, NAD';
      const sections = detectSections(text);

      expect(sections).toHaveLength(1);
      expect(sections[0].type).toBe('physical_exam');
    });

    it('should detect OBJECTIVE header', () => {
      const text = 'OBJECTIVE:\nExam findings normal';
      const sections = detectSections(text);

      expect(sections.length).toBeGreaterThanOrEqual(1);
      expect(sections[0].type).toBe('physical_exam');
    });
  });

  describe('Vitals', () => {
    it('should detect VITAL SIGNS header', () => {
      const text = 'VITAL SIGNS:\nBP 120/80, HR 72';
      const sections = detectSections(text);

      expect(sections).toHaveLength(1);
      expect(sections[0].type).toBe('vitals');
    });

    it('should detect VS abbreviation', () => {
      const text = 'VS: T 98.6, BP 130/85, HR 78';
      const sections = detectSections(text);

      expect(sections).toHaveLength(1);
      expect(sections[0].type).toBe('vitals');
    });
  });

  describe('Assessment', () => {
    it('should detect ASSESSMENT header', () => {
      const text = 'ASSESSMENT:\n1. Chest pain - likely musculoskeletal';
      const sections = detectSections(text);

      expect(sections).toHaveLength(1);
      expect(sections[0].type).toBe('assessment');
    });

    it('should detect IMPRESSION header', () => {
      const text = 'IMPRESSION: Acute bronchitis';
      const sections = detectSections(text);

      expect(sections).toHaveLength(1);
      expect(sections[0].type).toBe('assessment');
    });

    it('should detect ASSESSMENT AND PLAN', () => {
      const text = 'ASSESSMENT AND PLAN:\n1. Hypertension - continue current meds';
      const sections = detectSections(text);

      expect(sections).toHaveLength(1);
      expect(sections[0].type).toBe('assessment');
    });

    it('should detect A/P abbreviation', () => {
      const text = 'A/P:\n1. DM2 - check HbA1c';
      const sections = detectSections(text);

      expect(sections).toHaveLength(1);
      expect(sections[0].type).toBe('assessment');
    });
  });

  describe('Plan', () => {
    it('should detect PLAN header', () => {
      const text = 'PLAN:\n1. Order labs\n2. Follow up in 2 weeks';
      const sections = detectSections(text);

      expect(sections).toHaveLength(1);
      expect(sections[0].type).toBe('plan');
    });

    it('should detect TREATMENT PLAN', () => {
      const text = 'TREATMENT PLAN:\nStart antibiotics';
      const sections = detectSections(text);

      expect(sections).toHaveLength(1);
      expect(sections[0].type).toBe('plan');
    });

    it('should detect RECOMMENDATIONS', () => {
      const text = 'RECOMMENDATIONS:\nIncrease fluid intake';
      const sections = detectSections(text);

      expect(sections).toHaveLength(1);
      expect(sections[0].type).toBe('plan');
    });
  });

  describe('Labs', () => {
    it('should detect LABORATORY header', () => {
      const text = 'LABORATORY:\nCBC within normal limits';
      const sections = detectSections(text);

      expect(sections).toHaveLength(1);
      expect(sections[0].type).toBe('labs');
    });

    it('should detect LABS header', () => {
      const text = 'LABS: BMP unremarkable';
      const sections = detectSections(text);

      expect(sections).toHaveLength(1);
      expect(sections[0].type).toBe('labs');
    });
  });

  describe('Imaging', () => {
    it('should detect IMAGING header', () => {
      const text = 'IMAGING:\nChest X-ray shows no acute findings';
      const sections = detectSections(text);

      expect(sections).toHaveLength(1);
      expect(sections[0].type).toBe('imaging');
    });

    it('should detect RADIOLOGY header', () => {
      const text = 'RADIOLOGY: CT abdomen unremarkable';
      const sections = detectSections(text);

      expect(sections).toHaveLength(1);
      expect(sections[0].type).toBe('imaging');
    });
  });

  describe('Procedures', () => {
    it('should detect PROCEDURES header', () => {
      const text = 'PROCEDURES:\nEKG performed, normal sinus rhythm';
      const sections = detectSections(text);

      expect(sections).toHaveLength(1);
      expect(sections[0].type).toBe('procedures');
    });
  });

  describe('Multiple Sections', () => {
    it('should detect all sections in SIMPLE_NOTE', () => {
      const sections = detectSections(SIMPLE_NOTE);

      const types = sections.map((s) => s.type);
      expect(types).toContain('chief_complaint');
      expect(types).toContain('vitals');
      expect(types).toContain('hpi');
      expect(types).toContain('assessment');
    });

    it('should detect all sections in LONG_NOTE', () => {
      const sections = detectSections(LONG_NOTE);

      expect(sections.length).toBeGreaterThan(10);

      const types = sections.map((s) => s.type);
      expect(types).toContain('chief_complaint');
      expect(types).toContain('hpi');
      expect(types).toContain('past_medical_history');
      expect(types).toContain('past_surgical_history');
      expect(types).toContain('medications');
      expect(types).toContain('allergies');
      expect(types).toContain('family_history');
      expect(types).toContain('social_history');
      expect(types).toContain('review_of_systems');
      expect(types).toContain('physical_exam');
      expect(types).toContain('assessment');
      expect(types).toContain('plan');
    });

    it('should maintain section order by position', () => {
      const sections = detectSections(SIMPLE_NOTE);

      for (let i = 1; i < sections.length; i++) {
        expect(sections[i].startOffset).toBeGreaterThan(sections[i - 1].startOffset);
      }
    });
  });

  describe('getSectionAtPosition', () => {
    it('should return the section containing the position', () => {
      const text = `CHIEF COMPLAINT: Headache
HPI: Patient reports...`;
      const sections = detectSections(text);

      // Position in HPI section
      const section = getSectionAtPosition(sections, 30);
      expect(section?.type).toBe('hpi');
    });

    it('should return undefined for position before any section', () => {
      const text = `Some preamble text
CHIEF COMPLAINT: Headache`;
      const sections = detectSections(text);

      const section = getSectionAtPosition(sections, 5);
      expect(section).toBeUndefined();
    });
  });

  describe('getSectionBoundaries', () => {
    it('should return start positions of all sections', () => {
      const boundaries = getSectionBoundaries(SIMPLE_NOTE);

      expect(boundaries.length).toBeGreaterThan(0);
      expect(boundaries[0]).toBe(0); // First section at start
    });
  });

  describe('isAtSectionBoundary', () => {
    it('should return true at section start', () => {
      const text = `CHIEF COMPLAINT: Headache
HPI: Patient reports...`;

      expect(isAtSectionBoundary(text, 0)).toBe(true);
    });

    it('should return true near section boundary with tolerance', () => {
      const text = `CHIEF COMPLAINT: Headache
HPI: Patient reports...`;
      const sections = detectSections(text);
      const hpiStart = sections.find((s) => s.type === 'hpi')?.startOffset || 0;

      expect(isAtSectionBoundary(text, hpiStart + 2, 5)).toBe(true);
    });

    it('should return false away from boundaries', () => {
      const text = `CHIEF COMPLAINT: Headache for 3 days with visual changes and nausea
HPI: Patient reports...`;

      // Position in middle of CC content
      expect(isAtSectionBoundary(text, 40, 5)).toBe(false);
    });
  });

  describe('createSectionIndex', () => {
    it('should create index with common abbreviations', () => {
      const index = createSectionIndex();

      expect(index.get('CC')).toBe('chief_complaint');
      expect(index.get('HPI')).toBe('hpi');
      expect(index.get('PMH')).toBe('past_medical_history');
      expect(index.get('PE')).toBe('physical_exam');
      expect(index.get('A/P')).toBe('assessment');
    });
  });

  describe('Confidence Scores', () => {
    it('should have higher confidence for uppercase headers', () => {
      const uppercase = detectSections('CHIEF COMPLAINT: Pain');
      const mixedCase = detectSections('Chief Complaint: Pain');

      expect(uppercase[0].confidence).toBeGreaterThanOrEqual(mixedCase[0].confidence);
    });

    it('should have confidence between 0 and 1', () => {
      const sections = detectSections(LONG_NOTE);

      for (const section of sections) {
        expect(section.confidence).toBeGreaterThan(0);
        expect(section.confidence).toBeLessThanOrEqual(1);
      }
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty text', () => {
      const sections = detectSections('');
      expect(sections).toHaveLength(0);
    });

    it('should handle text with no sections', () => {
      const sections = detectSections('Just some regular text without any section headers.');
      expect(sections).toHaveLength(0);
    });

    it('should not match section headers mid-line', () => {
      const text = 'The patient said CC is fine';
      const sections = detectSections(text);
      // Should not detect "CC" in the middle of a sentence
      expect(sections).toHaveLength(0);
    });
  });
});
