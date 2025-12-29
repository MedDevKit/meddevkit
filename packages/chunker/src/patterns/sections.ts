/**
 * Clinical Section Pattern Detection
 *
 * Identifies standard clinical note sections like CC, HPI, PE, Assessment, Plan.
 * Section boundaries are preferred split points during chunking.
 *
 * OPEN SOURCE: Common section headers
 * PRIVATE (Cloud): Specialty-specific sections, confidence tuning
 *
 * @packageDocumentation
 */

import type { ClinicalSection, ClinicalSectionType } from '../types';

// ============================================================================
// Section Header Patterns
// ============================================================================

/**
 * Regular expressions for detecting clinical section headers
 * Each section type can have multiple pattern variations
 */
export const SECTION_PATTERNS: Record<ClinicalSectionType, RegExp[]> = {
  chief_complaint: [
    /^(?:CHIEF\s+COMPLAINT|CC|C\.C\.|PRESENTING\s+COMPLAINT)[:\s]*/gim,
    /^(?:REASON\s+FOR\s+(?:VISIT|CONSULTATION))[:\s]*/gim,
  ],

  hpi: [
    /^(?:HISTORY\s+OF\s+PRESENT\s+ILLNESS|HPI|H\.P\.I\.)[:\s]*/gim,
    /^(?:PRESENT\s+ILLNESS|HISTORY\s+OF\s+ILLNESS)[:\s]*/gim,
  ],

  past_medical_history: [
    /^(?:PAST\s+MEDICAL\s+HISTORY|PMH|P\.M\.H\.|MEDICAL\s+HISTORY)[:\s]*/gim,
    /^(?:PMHx|PAST\s+HISTORY)[:\s]*/gim,
  ],

  past_surgical_history: [
    /^(?:PAST\s+SURGICAL\s+HISTORY|PSH|P\.S\.H\.|SURGICAL\s+HISTORY)[:\s]*/gim,
    /^(?:PSHx|PRIOR\s+SURGERIES)[:\s]*/gim,
  ],

  medications: [
    /^(?:MEDICATIONS|MEDS|CURRENT\s+MEDICATIONS|HOME\s+MEDICATIONS)[:\s]*/gim,
    /^(?:MEDICATION\s+LIST|ACTIVE\s+MEDICATIONS)[:\s]*/gim,
  ],

  allergies: [
    /^(?:ALLERGIES|DRUG\s+ALLERGIES|ALLERGY|MEDICATION\s+ALLERGIES)[:\s]*/gim,
    /^(?:NKDA|NKMA|NO\s+KNOWN\s+(?:DRUG\s+)?ALLERGIES)[:\s]*/gim,
  ],

  family_history: [
    /^(?:FAMILY\s+HISTORY|FH|F\.H\.|FHx)[:\s]*/gim,
    /^(?:FAMILY\s+MEDICAL\s+HISTORY)[:\s]*/gim,
  ],

  social_history: [
    /^(?:SOCIAL\s+HISTORY|SH|S\.H\.|SHx)[:\s]*/gim,
    /^(?:SOCIAL|HABITS)[:\s]*/gim,
  ],

  review_of_systems: [
    /^(?:REVIEW\s+OF\s+SYSTEMS|ROS|R\.O\.S\.)[:\s]*/gim,
    /^(?:SYSTEMS\s+REVIEW|CONSTITUTIONAL)[:\s]*/gim,
  ],

  physical_exam: [
    /^(?:PHYSICAL\s+EXAM(?:INATION)?|PE|P\.E\.|EXAM(?:INATION)?)[:\s]*/gim,
    /^(?:OBJECTIVE|PHYSICAL\s+FINDINGS)[:\s]*/gim,
  ],

  vitals: [
    /^(?:VITAL\s+SIGNS|VITALS|VS)[:\s]*/gim,
  ],

  assessment: [
    /^(?:ASSESSMENT|IMPRESSION|DIAGNOSIS|DX)[:\s]*/gim,
    /^(?:CLINICAL\s+IMPRESSION|ASSESSMENT\s*(?:AND|&)\s*PLAN|A\s*[\/&]\s*P)[:\s]*/gim,
  ],

  plan: [
    /^(?:PLAN|TREATMENT\s+PLAN|MANAGEMENT)[:\s]*/gim,
    /^(?:RECOMMENDATIONS|DISPOSITION)[:\s]*/gim,
  ],

  labs: [
    /^(?:LABORATORY|LAB(?:S)?|LABORATORY\s+RESULTS?|LAB\s+VALUES)[:\s]*/gim,
    /^(?:DIAGNOSTIC\s+LABS?|BLOODWORK)[:\s]*/gim,
  ],

  imaging: [
    /^(?:IMAGING|RADIOLOGY|DIAGNOSTIC\s+IMAGING)[:\s]*/gim,
    /^(?:X-?RAY|CT|MRI|ULTRASOUND)[:\s]*/gim,
  ],

  procedures: [
    /^(?:PROCEDURES?|INTERVENTIONS?)[:\s]*/gim,
    /^(?:OPERATIONS?|SURGICAL\s+PROCEDURES?)[:\s]*/gim,
  ],

  unknown: [],
};

// ============================================================================
// Detection Functions
// ============================================================================

/**
 * Detect all clinical sections in text
 *
 * @param text - Clinical note text
 * @returns Array of detected sections with positions
 *
 * @example
 * ```typescript
 * const sections = detectSections(`
 *   CHIEF COMPLAINT: Chest pain
 *   HISTORY OF PRESENT ILLNESS:
 *   Patient is a 55 year old male...
 * `);
 * // Returns [{ type: 'chief_complaint', header: 'CHIEF COMPLAINT:', ... }, ...]
 * ```
 */
export function detectSections(text: string): ClinicalSection[] {
  const sections: ClinicalSection[] = [];
  const lines = text.split('\n');
  let position = 0;

  for (const line of lines) {
    const trimmedLine = line.trim();

    // Check each section type
    for (const [type, patterns] of Object.entries(SECTION_PATTERNS)) {
      if (type === 'unknown') continue;

      for (const pattern of patterns) {
        const regex = new RegExp(pattern.source, 'im'); // Single match per line
        const match = regex.exec(trimmedLine);

        if (match) {
          sections.push({
            type: type as ClinicalSectionType,
            header: trimmedLine,
            startOffset: position + (line.indexOf(trimmedLine)),
            confidence: calculateSectionConfidence(type as ClinicalSectionType, trimmedLine),
          });
          break; // Only match one pattern per line
        }
      }
    }

    position += line.length + 1; // +1 for newline
  }

  return sections;
}

/**
 * Get the section at a given text position
 *
 * @param sections - Array of detected sections
 * @param position - Character position in text
 * @returns The section containing the position, or undefined
 */
export function getSectionAtPosition(
  sections: ClinicalSection[],
  position: number
): ClinicalSection | undefined {
  // Sort sections by position
  const sorted = [...sections].sort((a, b) => a.startOffset - b.startOffset);

  // Find the section that contains or precedes this position
  let currentSection: ClinicalSection | undefined;
  for (const section of sorted) {
    if (section.startOffset <= position) {
      currentSection = section;
    } else {
      break;
    }
  }

  return currentSection;
}

/**
 * Find section boundaries for chunking
 * Returns positions where new sections begin
 *
 * @param text - Clinical text
 * @returns Array of section start positions
 */
export function getSectionBoundaries(text: string): number[] {
  const sections = detectSections(text);
  return sections.map((s) => s.startOffset);
}

/**
 * Check if a position is at a section boundary
 *
 * @param text - Clinical text
 * @param position - Character position
 * @param tolerance - Characters to look ahead/behind (default 5)
 * @returns True if near a section boundary
 */
export function isAtSectionBoundary(
  text: string,
  position: number,
  tolerance: number = 5
): boolean {
  const boundaries = getSectionBoundaries(text);
  return boundaries.some(
    (b) => Math.abs(b - position) <= tolerance
  );
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Calculate confidence score for section detection
 * Based on pattern specificity and common formatting
 */
function calculateSectionConfidence(
  type: ClinicalSectionType,
  header: string
): number {
  let confidence = 0.8; // Base confidence

  // Higher confidence for uppercase headers
  if (header === header.toUpperCase()) {
    confidence += 0.1;
  }

  // Higher confidence for exact matches
  const exactMatches: Partial<Record<ClinicalSectionType, string[]>> = {
    chief_complaint: ['CHIEF COMPLAINT', 'CC'],
    hpi: ['HISTORY OF PRESENT ILLNESS', 'HPI'],
    assessment: ['ASSESSMENT', 'ASSESSMENT AND PLAN', 'A/P'],
    plan: ['PLAN', 'TREATMENT PLAN'],
    physical_exam: ['PHYSICAL EXAM', 'PHYSICAL EXAMINATION', 'PE'],
  };

  const matches = exactMatches[type];
  if (matches) {
    const upperHeader = header.toUpperCase().replace(/[:\s]+$/, '');
    if (matches.some((m) => upperHeader === m || upperHeader.startsWith(m))) {
      confidence += 0.1;
    }
  }

  return Math.min(confidence, 1.0);
}

// ============================================================================
// Pattern Index for Section Headers
// ============================================================================

/**
 * Create index for fast section header lookup
 */
export function createSectionIndex(): Map<string, ClinicalSectionType> {
  const index = new Map<string, ClinicalSectionType>();

  // Common abbreviations and their section types
  const abbreviations: Array<[string[], ClinicalSectionType]> = [
    [['CC', 'C.C.'], 'chief_complaint'],
    [['HPI', 'H.P.I.'], 'hpi'],
    [['PMH', 'P.M.H.', 'PMHx'], 'past_medical_history'],
    [['PSH', 'P.S.H.', 'PSHx'], 'past_surgical_history'],
    [['FH', 'F.H.', 'FHx'], 'family_history'],
    [['SH', 'S.H.', 'SHx'], 'social_history'],
    [['ROS', 'R.O.S.'], 'review_of_systems'],
    [['PE', 'P.E.'], 'physical_exam'],
    [['VS'], 'vitals'],
    [['A/P', 'A&P'], 'assessment'],
  ];

  for (const [abbrs, type] of abbreviations) {
    for (const abbr of abbrs) {
      index.set(abbr.toUpperCase(), type);
    }
  }

  return index;
}

