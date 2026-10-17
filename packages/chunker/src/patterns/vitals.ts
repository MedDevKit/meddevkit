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

// ----------------------------------------------------------------------------
// Shared building blocks (regex source fragments)
// ----------------------------------------------------------------------------

/**
 * Optional parenthetical qualifier after a label, e.g. "BP (supine) 182/113"
 * or "Temp (oral) 98.6".
 */
const QUALIFIER = String.raw`(?:\s*\([^()\n]{1,20}\))?`;

/**
 * Up to three filler words (or short filler phrases) between a label and its
 * value, e.g. "blood pressure today is 182/78", "respirations are 26",
 * "HR of 30", "blood pressure was noted to be 180/95",
 * "blood pressure today in office was 132/80".
 */
const FILLER = String.raw`(?:\s+(?:is|are|was|were|of|at|today|now|reads?|shows?|measures?|measured|noted\s+to\s+be|in\s+(?:the\s+)?(?:office|clinic))){0,3}`;

/**
 * Label-to-value link: qualifier, filler words, then any mix of colon,
 * equals sign and whitespace ("HR: 72", "RR = 18", "HR= 113").
 */
const LINK = `${QUALIFIER}${FILLER}[:=\\s]*`;

/**
 * Guard after a number so it cannot stop part-way through a longer number
 * ("564" never yields "56"; "98.65" never yields "98").
 */
const NUM_END = String.raw`(?!\.?\d)`;

/**
 * End of a vital span. Unlike a trailing `\b`, this also succeeds after a
 * symbol unit, so "95%" and "98.6°" keep their unit in the span.
 */
const END = String.raw`(?!\w)`;

/**
 * Plausible body temperature after the bare "T" label: 90-110 °F or
 * 32-43 °C, optional decimals. Rejects spinal levels (T11, T12), trisomies
 * (T18) and lab values ("Troponin T 564") that share the bare "T" label.
 */
const TEMP_VALUE = String.raw`(?:110|10\d|9\d|3[2-9]|4[0-3])(?:\.\d{1,2})?`;

/**
 * Plausible body temperature after an explicit label (temperature, temp,
 * Tmax): 82-110 °F or 26-43 °C, optional decimals. Wider than
 * {@link TEMP_VALUE} so real hypothermia ("temperature of 87.1 Fahrenheit",
 * "Temp 30.5 C") is kept; the label already rules out spinal levels. The
 * floor stays at 82 °F so device settings such as radiofrequency lesioning
 * ("temperature of 80 degrees for 90 seconds") are not read as vitals.
 */
const TEMP_VALUE_LABELLED = String.raw`(?:110|10\d|9\d|8[2-9]|2[6-9]|3\d|4[0-3])(?:\.\d{1,2})?`;

/** Plausible oxygen saturation percentage: 40-100. */
const SAT_VALUE = String.raw`(?:100|[4-9]\d)`;

/** Oxygen saturation labels that may also follow the value ("95% O2 saturation"). */
const SAT_LABEL = String.raw`(?:O2\s*sat(?:uration)?s?|S[ap]O2|pulse\s*ox(?:imetry)?|oxygen\s+sat(?:uration)?s?)`;

/** Rejects an oxygen flow rate ("oxygen 10 L/min", "60 lpm") read as saturation. */
const NOT_FLOW = String.raw`(?!\s*(?:L|lpm|lit(?:er|re)s?)(?![a-z]))`;

/**
 * Regular expressions for detecting vital signs
 * Patterns use case-insensitive matching and capture key values
 * Supports both structured clinical docs and conversational speech transcription
 *
 * Blood pressure, heart rate, respiratory rate, temperature and oxygen
 * saturation share {@link LINK}: an optional parenthetical qualifier, up to
 * three filler words, and a `:`/`=`/space separator between label and value.
 */
export const VITAL_PATTERNS: Record<VitalType, RegExp> = {
  /**
   * Blood Pressure patterns:
   * - "BP: 120/80"
   * - "BP 120/80 mmHg"
   * - "blood pressure 120 over 80"
   * - "blood pressure is 120 over 80" (conversational)
   * - "Blood pressure today is 182/78" (filler words)
   * - "BP (supine) 182/113" (qualifier)
   * - "BP =146/52"
   * - "B/P: 120/80"
   */
  blood_pressure: new RegExp(
    String.raw`\b(?:BP|B\/P|blood\s+pressure)${LINK}(\d{2,3})\s*(?:[/\\]|over\s+)(\d{2,3})${NUM_END}(?:\s*(?:mmHg|mm\s*Hg))?${END}`,
    'gi'
  ),

  /**
   * Heart Rate patterns:
   * - "HR: 72", "HR= 113"
   * - "HR 72 bpm"
   * - "heart rate 72", "heart rate of 72", "heart rate is 72"
   * - "pulse 72", "pulse is 72", "Pulse rate of 55"
   * - "HR of 30-40" (range: group 1 = low, group 2 = high)
   */
  heart_rate: new RegExp(
    String.raw`\b(?:HR|heart\s+rate|pulse(?:\s+rate)?)${LINK}(\d{2,3})(?:\s*(?:-|–|to)\s*(\d{2,3}))?${NUM_END}(?:\s*(?:bpm|beats?\s*(?:per\s*)?min(?:ute)?|\/min))?${END}`,
    'gi'
  ),

  /**
   * Respiratory Rate patterns:
   * - "RR: 16", "RR = 18"
   * - "RR 16/min"
   * - "respiratory rate 16", "respiratory rate is 16", "resp rate 16"
   * - "respirations 16", "Respirations are 26", "Respiration: 16"
   */
  respiratory_rate: new RegExp(
    String.raw`\b(?:RR|resp(?:iratory)?\s*rate|respirations?)${LINK}(\d{1,2})${NUM_END}(?:\s*(?:\/min|per\s*min(?:ute)?|breaths?\s*(?:per\s*)?min(?:ute)?))?${END}`,
    'gi'
  ),

  /**
   * Temperature patterns (value must be a plausible body temperature):
   * - "T: 98.6", "T 98.6°F", "T: 37.2C" (bare T: 90-110 °F / 32-43 °C)
   * - "Temp 101.2 F", "Temp = 38.3C", "Tmax 101.2"
   * - "temperature 37.0 C", "temperature of 98.6", "temperature is 98.6"
   * - "Temperature: 100.4 degrees F"
   * - Labelled hypothermia (82-110 °F / 26-43 °C): "temperature of 87.1
   *   Fahrenheit", "Temp 30.5 C" (group 1 = labelled value, group 2 = bare T value)
   * - Not matched: "T11", "T12 vertebra", "T18", "Troponin T 564",
   *   "temperature of 85 degrees Celsius" (value and unit disagree; see parseVitalMatch)
   */
  temperature: new RegExp(
    String.raw`\b(?:(?:temp(?:erature)?|T-?\s*max)${LINK}(${TEMP_VALUE_LABELLED})|(?<!troponin\s*)T${LINK}(${TEMP_VALUE}))${NUM_END}(?:\s*°?\s*(?:F(?:ahrenheit)?|C(?:elsius)?)${END}|\s*°|\s*degrees?(?:\s*(?:F(?:ahrenheit)?|C(?:elsius)?)${END})?)?${END}`,
    'gi'
  ),

  /**
   * Oxygen Saturation patterns (value 40-100, never a flow rate in litres):
   * - "O2 sat 98%", "O2 sat 94% on 2L NC", "O2 sat 98% on RA"
   * - "SpO2: 98", "SaO2 = 98%"
   * - "oxygen saturation 95%", "oxygen is 97" (conversational)
   * - "pulse oximetry of 98%", "saturating 79%"
   * - "O2 sat 98 percent"
   * - "95% O2 saturation" (value first; group 2 holds the value)
   * - Not matched: "on oxygen 10 L/min"
   */
  oxygen_saturation: new RegExp(
    String.raw`\b(?:(?:${SAT_LABEL}|oxygen|saturating)${LINK}(${SAT_VALUE})${NUM_END}${NOT_FLOW}(?:\s*(?:%|percent))?|(${SAT_VALUE})${NUM_END}\s*(?:%|percent)\s*${SAT_LABEL})(?:\s*on\s+(?:RA|room\s+air|\d+\s*L(?:\s*NC)?))?${END}`,
    'gi'
  ),

  /**
   * Weight patterns:
   * - "Wt: 180 lbs"
   * - "weight 81.6 kg"
   * - "weight is 180" (conversational)
   * - "Wt 180#"
   * - "Patient weighs 180 lbs"
   */
  weight:
    /\b(?:Wt|weight|weighs)(?:\s+(?:is|was|of|at))?[:\s]*(\d{2,3}(?:\.\d{1,2})?)(?:\s*(?:lbs?|#|kg|kilograms?|pounds?))?\b/gi,

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
      // match[1] = rate (or low end of a range), match[2] = high end of a range
      value = parseInt(match[1], 10);
      value2 = match[2] ? parseInt(match[2], 10) : undefined;
      unit = extractUnit(raw, ['bpm', 'beats per minute', '/min']);
      break;

    case 'respiratory_rate':
      value = parseInt(match[1], 10);
      unit = extractUnit(raw, ['/min', 'per minute', 'breaths per minute']);
      break;

    case 'temperature': {
      // match[1] = value after an explicit label, match[2] = after bare "T"
      const temp = match[1] ?? match[2];
      const degrees = parseFloat(temp);
      value = degrees;
      // Look for the unit only after the value, so label/filler letters
      // (e.g. a "(rectal)" qualifier) are never read as "C" or "F"
      unit = extractUnit(raw.slice(raw.lastIndexOf(temp) + temp.length), [
        '°F',
        '°C',
        'Fahrenheit',
        'Celsius',
        'F',
        'C',
      ]);
      // A Fahrenheit-range value with a Celsius unit (or the reverse) is a
      // device setting, not a body temperature ("85 degrees Celsius")
      if ((unit === '°C' || unit === 'C' || unit === 'Celsius') && degrees > 43) return null;
      if ((unit === '°F' || unit === 'F' || unit === 'Fahrenheit') && degrees < 82) return null;
      break;
    }

    case 'oxygen_saturation':
      // match[1] = value after the label, match[2] = value before the label
      value = parseInt(match[1] ?? match[2], 10);
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

