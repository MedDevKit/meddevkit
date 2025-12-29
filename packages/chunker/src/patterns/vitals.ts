/**
 * Vital Signs Pattern Detection
 *
 * Patterns designed to identify and preserve vital signs measurements.
 * These patterns prevent chunking from splitting on medical measurements.
 *
 * OPEN SOURCE: Basic patterns for common vitals
 * PRIVATE (Cloud): Extended patterns, edge cases, and production thresholds
 *
 * @packageDocumentation
 */

import type { VitalSign, VitalType } from '../types';

// ============================================================================
// Vital Sign Patterns
// ============================================================================

/**
 * Regular expressions for detecting vital signs
 * Patterns use case-insensitive matching and capture key values
 */
export const VITAL_PATTERNS: Record<VitalType, RegExp> = {
  /**
   * Blood Pressure patterns:
   * - "BP: 120/80"
   * - "BP 120/80 mmHg"
   * - "blood pressure 120 over 80"
   * - "B/P: 120/80"
   */
  blood_pressure:
    /\b(?:BP|B\/P|blood\s+pressure)[:\s]*(\d{2,3})\s*[\/\\](?:over\s*)?(\d{2,3})(?:\s*(?:mmHg|mm\s*Hg))?\b/gi,

  /**
   * Heart Rate patterns:
   * - "HR: 72"
   * - "HR 72 bpm"
   * - "heart rate 72"
   * - "pulse 72"
   */
  heart_rate:
    /\b(?:HR|heart\s+rate|pulse)[:\s]*(\d{2,3})(?:\s*(?:bpm|beats?\s*(?:per\s*)?min(?:ute)?|\/min))?\b/gi,

  /**
   * Respiratory Rate patterns:
   * - "RR: 16"
   * - "RR 16/min"
   * - "respiratory rate 16"
   * - "resp rate 16"
   */
  respiratory_rate:
    /\b(?:RR|resp(?:iratory)?\s*rate)[:\s]*(\d{1,2})(?:\s*(?:\/min|per\s*min(?:ute)?|breaths?\s*(?:per\s*)?min))?\b/gi,

  /**
   * Temperature patterns:
   * - "T: 98.6"
   * - "temp 98.6 F"
   * - "temperature 37.0 C"
   * - "T 98.6°F"
   */
  temperature:
    /\b(?:T(?:emp)?|temperature)[:\s]*(\d{2,3}(?:\.\d{1,2})?)(?:\s*(?:°\s*)?(?:F(?:ahrenheit)?|C(?:elsius)?)|(?:\s+degrees?\s*(?:Fahrenheit|Celsius)?))?\b/gi,

  /**
   * Oxygen Saturation patterns:
   * - "O2 sat 98%"
   * - "SpO2: 98"
   * - "oxygen saturation 98%"
   * - "sat 98% on RA"
   * - "O2 sat 94% on 2L NC"
   */
  oxygen_saturation:
    /\b(?:O2\s*sat(?:uration)?|SpO2|pulse\s*ox|oxygen\s+sat(?:uration)?)[:\s]*(\d{2,3})(?:\s*%)?(?:\s*(?:on\s+(?:RA|room\s+air|\d+\s*L(?:\s*NC)?)))?\b/gi,

  /**
   * Weight patterns:
   * - "Wt: 180 lbs"
   * - "weight 81.6 kg"
   * - "Wt 180#"
   */
  weight:
    /\b(?:Wt|weight)[:\s]*(\d{2,3}(?:\.\d{1,2})?)(?:\s*(?:lbs?|#|kg|kilograms?|pounds?))?\b/gi,

  /**
   * Height patterns:
   * - "Ht: 5'10""
   * - "height 178 cm"
   * - "Ht 70 in"
   */
  height:
    /\b(?:Ht|height)[:\s]*(?:(\d)['\s]*(\d{1,2})"?|(\d{2,3})(?:\s*(?:cm|in(?:ches)?)))\b/gi,

  /**
   * BMI patterns:
   * - "BMI: 24.5"
   * - "BMI 24.5 kg/m2"
   */
  bmi: /\b(?:BMI|body\s+mass\s+index)[:\s]*(\d{1,2}(?:\.\d{1,2})?)(?:\s*(?:kg\/m2?))?\b/gi,

  /**
   * Pain Scale patterns:
   * - "pain 7/10"
   * - "pain scale 7 out of 10"
   * - "pain level: 7"
   */
  pain_scale:
    /\b(?:pain)(?:\s+(?:scale|level))?[:\s]*(\d{1,2})(?:\s*(?:\/|out\s+of)\s*10)?\b/gi,
};

// ============================================================================
// Detection Functions
// ============================================================================

/**
 * Detect all vital signs in text
 *
 * @param text - Clinical text to analyze
 * @returns Array of detected vital signs with positions
 *
 * @example
 * ```typescript
 * const vitals = detectVitals('BP: 120/80 mmHg, HR 72 bpm');
 * // Returns [{ type: 'blood_pressure', raw: 'BP: 120/80 mmHg', ... }, ...]
 * ```
 */
export function detectVitals(text: string): VitalSign[] {
  const vitals: VitalSign[] = [];

  for (const [type, pattern] of Object.entries(VITAL_PATTERNS)) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match;

    while ((match = regex.exec(text)) !== null) {
      const vital = parseVitalMatch(type as VitalType, match);
      if (vital) {
        vitals.push(vital);
      }
    }
  }

  // Sort by position
  return vitals.sort((a, b) => a.startOffset - b.startOffset);
}

/**
 * Check if a position is within a vital sign pattern
 *
 * @param text - Text to check
 * @param position - Character position
 * @returns True if position is inside a vital sign measurement
 */
export function isWithinVitalPattern(text: string, position: number): boolean {
  const vitals = detectVitals(text);
  return vitals.some(
    (v) => position >= v.startOffset && position <= v.endOffset
  );
}

/**
 * Get protected ranges for all vital signs
 * These ranges should not be split during chunking
 *
 * @param text - Text to analyze
 * @returns Array of start/end positions
 */
export function getVitalProtectedRanges(
  text: string
): Array<{ start: number; end: number }> {
  return detectVitals(text).map((v) => ({
    start: v.startOffset,
    end: v.endOffset,
  }));
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Parse a regex match into a VitalSign object
 */
function parseVitalMatch(
  type: VitalType,
  match: RegExpExecArray
): VitalSign | null {
  const raw = match[0];
  const startOffset = match.index;
  const endOffset = match.index + raw.length;

  // Parse values based on vital type
  let value: number | string | undefined;
  let value2: number | undefined;
  let unit: string | undefined;

  switch (type) {
    case 'blood_pressure':
      // match[1] = systolic, match[2] = diastolic
      value = parseInt(match[1], 10);
      value2 = parseInt(match[2], 10);
      unit = extractUnit(raw, ['mmHg', 'mm Hg']);
      break;

    case 'heart_rate':
      value = parseInt(match[1], 10);
      unit = extractUnit(raw, ['bpm', 'beats per minute', '/min']);
      break;

    case 'respiratory_rate':
      value = parseInt(match[1], 10);
      unit = extractUnit(raw, ['/min', 'per minute', 'breaths per minute']);
      break;

    case 'temperature':
      value = parseFloat(match[1]);
      unit = extractUnit(raw, ['°F', '°C', 'F', 'C', 'Fahrenheit', 'Celsius']);
      break;

    case 'oxygen_saturation':
      value = parseInt(match[1], 10);
      unit = '%';
      break;

    case 'weight':
      value = parseFloat(match[1]);
      unit = extractUnit(raw, ['lbs', 'lb', 'kg', 'kilograms', 'pounds', '#']);
      break;

    case 'height':
      // Could be feet/inches or cm
      if (match[1] && match[2]) {
        // Feet and inches format
        value = `${match[1]}'${match[2]}"`;
        unit = 'ft/in';
      } else if (match[3]) {
        value = parseInt(match[3], 10);
        unit = extractUnit(raw, ['cm', 'in', 'inches']);
      }
      break;

    case 'bmi':
      value = parseFloat(match[1]);
      unit = extractUnit(raw, ['kg/m2', 'kg/m']);
      break;

    case 'pain_scale':
      value = parseInt(match[1], 10);
      unit = '/10';
      break;
  }

  return {
    type,
    raw,
    value,
    value2,
    unit,
    startOffset,
    endOffset,
  };
}

/**
 * Extract unit from vital sign text
 */
function extractUnit(text: string, possibleUnits: string[]): string | undefined {
  const lowerText = text.toLowerCase();
  for (const unit of possibleUnits) {
    if (lowerText.includes(unit.toLowerCase())) {
      return unit;
    }
  }
  return undefined;
}

