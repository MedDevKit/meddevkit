/**
 * Medication Pattern Detection
 *
 * Identifies drug + dose mentions in clinical text so they can be preserved
 * during chunking and annotated in chunk metadata.
 * Examples: "Metoprolol 25 mg PO BID", "albuterol 2 puffs q4h prn"
 *
 * Detection is purely pattern-based (no drug lexicon). Two phrasings are
 * recognized:
 * - Name-first: "<name> <dose> <unit> [route] [frequency]", where the 1-2
 *   word token(s) immediately before the dose are the medication name
 *   ("Metoprolol 25 mg PO BID").
 * - Dose-first: "<dose> <unit> [of] <name> [route] [frequency]", only when an
 *   administration verb (gave/given/received/administered/started on/took)
 *   appears within 3 words before the dose ("Gave 2 mg morphine IV").
 *   Lower confidence; overlapping matches are deduplicated.
 *
 * Design choices:
 * - Lab concentrations are excluded: a unit followed by "/dL", "/L" or
 *   "/min" ("glucose 180 mg/dL", "GFR 60 mL/min") is never a medication.
 * - Bare liters are not a medication unit, so oxygen flow such as
 *   "2 L nasal cannula" is not detected.
 * - Vital/lab keywords, pronouns/subject words, and stopwords are rejected
 *   as names ("weight", "glucose", "she drinks", "took", "the").
 * - Alcohol is not a medication: "3 units of alcohol" / "of EtOH" is rejected.
 * - A route written inside the name position ("IV Furosemide 40mg") is
 *   removed from `name` and used as `route` when no trailing route is
 *   present; `raw` and offsets still include it.
 * - Treatment duration ("x 10 days") is left to temporal detection.
 * - A mention never spans a line break: all separators are spaces/tabs, so
 *   list items ("daily\nWeekly labs") are never joined.
 *
 * OPEN SOURCE: Basic patterns for common dose formats
 * PRIVATE (Cloud): Drug lexicons, specialty regimens, production thresholds
 *
 * @packageDocumentation
 */

import type { MedicationMention, MedicationRoute } from '../types';

// ============================================================================
// Pattern Components
// ============================================================================

/**
 * Medication name token: starts with a letter, at least 2 characters
 * (letters, digits, hyphens), e.g. "Metoprolol", "B12", "co-amoxiclav".
 * A second name token may be a single letter ("vitamin D").
 */
const NAME_WORD = '[A-Za-z][A-Za-z0-9-]+';

/**
 * Dose amount, optionally a range ("1-2", "1 to 2", "1,000")
 */
const DOSE = '(\\d{1,3}(?:,\\d{3})+|\\d+(?:\\.\\d+)?)(?:[ \\t]*(?:-|to)[ \\t]*(\\d+(?:\\.\\d+)?))?';

/**
 * Medication dose units (longest alternatives first)
 */
const UNIT =
  '(mcg|µg|ug|mEq|mg|mL|ml|units?|IU|U|g|tablets?|tabs?|capsules?|caps?|puffs?|drops?|patch(?:es)?)';

/**
 * Lab-concentration / rate guard: reject units followed by "/dL", "/L", "/min"
 */
const UNIT_GUARD = '(?![A-Za-z])(?![ \\t]*\\/[ \\t]*(?:d?L|min)\\b)';

/**
 * Routes of administration
 */
const ROUTE =
  '(PO|by[ \\t]+mouth|orally|IVPB|IVP|IV|intravenous(?:ly)?|IM|intramuscular(?:ly)?|SQ|SC|subcut(?:aneous(?:ly)?)?|subq|SL|sublingual(?:ly)?|PR|per[ \\t]+rectum|rectally|topical(?:ly)?|inhaled|via[ \\t]+nebulizer|nebulized|neb)';

/**
 * A single frequency term
 */
const FREQ_TERM =
  '(?:(?:once|twice|three[ \\t]+times|four[ \\t]+times)(?:[ \\t]+(?:a|per))?[ \\t]+(?:daily|day|weekly|week)' +
  '|every[ \\t]+\\d+(?:[ \\t]*(?:-|to)[ \\t]*\\d+)?[ \\t]*(?:hours?|hrs?|h)' +
  '|every[ \\t]+(?:morning|evening|night|other[ \\t]+day)' +
  '|q[ \\t]?\\d+(?:[ \\t]*-[ \\t]*\\d+)?[ \\t]?(?:hours?|hrs?|h|min)' +
  '|q(?:AM|PM|HS|OD|D|day|week|wk)' +
  '|BID|TID|QID|daily|nightly|weekly|monthly|at[ \\t]+bedtime|once|PRN|as[ \\t]+needed)';

/**
 * Frequency: one or two terms ("BID", "q4h prn", "daily as needed")
 */
const FREQUENCY = `(${FREQ_TERM}(?:[ \\t]+${FREQ_TERM})?)`;

/**
 * Administration verbs that gate the dose-first pattern
 */
const ADMIN_VERB =
  '(?:gave|given|give|received|receives|receiving|administered|administer|started[ \\t]+on|starting[ \\t]+on|took|takes|taking)';

/**
 * Words that cannot start (or be the second word of) a dose-first name
 */
const NOT_NAME_WORD =
  `(?!(?:${ROUTE.slice(1, -1)}|${FREQ_TERM.slice(3, -1)}|and|or|for|with|at|in|on|to|the|a|an|of|x|was|is|then|via|by|over|per|now|today)(?![A-Za-z0-9-]))`;

/**
 * Patterns for detecting medication mentions.
 *
 * `medication` (name-first) and `doseFirst` are used by
 * {@link detectMedications}; the other entries are components, exported
 * for reuse.
 *
 * `medication` capture groups:
 * 1 = name, 2 = dose, 3 = doseMax, 4 = unit, 5 = route, 6 = frequency
 *
 * `doseFirst` capture groups:
 * 1 = verb prefix, 2 = dose, 3 = doseMax, 4 = unit, 5 = route before the
 * name, 6 = name, 7 = route after the name, 8 = frequency
 */
export const MEDICATION_PATTERNS = {
  /**
   * Full mention: "<name> <dose> <unit> [route] [frequency]"
   * - "Metoprolol 25 mg PO BID"
   * - "insulin glargine 20 units qHS"
   * - "albuterol 2 puffs q4h prn"
   */
  medication: new RegExp(
    `\\b(${NAME_WORD}(?:[ \\t]+(?:${NAME_WORD}|[A-Za-z]))?)[ \\t]+${DOSE}[ \\t]*${UNIT}${UNIT_GUARD}` +
      `(?:[ \\t]+${ROUTE}(?![A-Za-z]))?` +
      `(?:[ \\t]+${FREQUENCY}(?![A-Za-z]))?`,
    'gi'
  ),

  /**
   * Dose-first mention after an administration verb:
   * "<verb> [up to 3 words] <dose> <unit> [of] [route] <name> [route] [frequency]"
   * - "Gave 2 mg morphine IV"
   * - "Patient received 4 mg of ondansetron"
   * - "administered 1 g ceftriaxone IV"
   * - "received 40 mg IV furosemide"
   */
  doseFirst: new RegExp(
    `\\b(${ADMIN_VERB}(?:[ \\t]+[A-Za-z]+){0,3}?[ \\t]+)${DOSE}[ \\t]*${UNIT}${UNIT_GUARD}` +
      `(?:[ \\t]+of)?(?:[ \\t]+${ROUTE}(?![A-Za-z]))?` +
      `[ \\t]+(${NOT_NAME_WORD}${NAME_WORD}(?:[ \\t]+${NOT_NAME_WORD}${NAME_WORD})?)` +
      `(?:[ \\t]+${ROUTE}(?![A-Za-z]))?` +
      `(?:[ \\t]+${FREQUENCY}(?![A-Za-z]))?`,
    'gi'
  ),

  /**
   * Dose + unit: "25 mg", "1-2 tabs", "20 units" (excludes "mg/dL")
   */
  dose: new RegExp(`${DOSE}[ \\t]*${UNIT}${UNIT_GUARD}`, 'gi'),

  /**
   * Route of administration: "PO", "IV", "SQ", "inhaled"
   */
  route: new RegExp(`\\b${ROUTE}(?![A-Za-z])`, 'gi'),

  /**
   * Frequency: "BID", "q4h", "twice daily", "as needed"
   */
  frequency: new RegExp(`\\b${FREQUENCY}(?![A-Za-z])`, 'gi'),
} as const;

/**
 * Confidence scores for medication mentions.
 * A bare "<word> <dose> <unit>" is weaker evidence than one that also
 * carries a route and/or frequency.
 */
export const MEDICATION_CONFIDENCE = {
  /** Name + dose + unit only ("aspirin 81 mg") */
  doseOnly: 0.7,
  /** Name + dose + unit + route OR frequency ("lisinopril 10mg daily") */
  withRouteOrFrequency: 0.85,
  /** Name + dose + unit + route AND frequency ("Metoprolol 25 mg PO BID") */
  withRouteAndFrequency: 0.95,
  /** Dose-first phrasing after an administration verb ("Gave 2 mg morphine") */
  doseFirst: 0.65,
} as const;

/**
 * Negation cues (see `negation.ts`) that can directly precede a drug name:
 * "No metoprolol 25 mg", "denies aspirin 81 mg", "holding lisinopril 10 mg".
 * As leading tokens they are dropped from the name so the medication span
 * starts at the drug itself; the negation span still overlaps it.
 * ("stop", "stopped", "hold", "discontinue(d)" are listed with the
 * medication-management verbs below.) Compared case-insensitively.
 */
const NEGATION_CUE_TOKENS = ['no', 'not', 'denies', 'denied', 'without', 'holding', 'never'];

/**
 * Tokens that can never be (part of) a medication name: vital-sign and lab
 * keywords, negation cues, plus common verbs/stopwords that precede a dose.
 * Compared case-insensitively.
 */
const EXCLUDED_NAME_TOKENS = new Set([
  ...NEGATION_CUE_TOKENS,
  // Vital sign / measurement keywords
  'bp', 'hr', 'rr', 'temp', 'temperature', 'pulse', 'weight', 'wt', 'weighs',
  'height', 'ht', 'bmi', 'pain', 'sat', 'sats', 'spo2', 'o2', 'oxygen', 'age',
  'aged', 'scale', 'level', 'levels',
  // Lab keywords
  'glucose', 'sugar', 'a1c', 'hba1c', 'hemoglobin', 'hgb', 'hct', 'wbc', 'plt',
  'platelets', 'sodium', 'creatinine', 'cr', 'bun', 'gfr', 'egfr', 'crcl',
  'ldl', 'hdl', 'cholesterol', 'triglycerides', 'troponin', 'albumin',
  'protein', 'urine', 'output', 'intake',
  // Blood products and alcohol (not medications)
  'prbc', 'prbcs', 'ffp', 'blood', 'cryo', 'alcohol', 'etoh', 'beer', 'beers',
  'wine', 'liquor', 'drinks', 'drink', 'drank', 'drinking',
  // Pronouns / subject words
  'he', 'she', 'they', 'we', 'you', 'his', 'her', 'their', 'patient',
  'patients', 'pt', 'pts', 'smokes', 'smoke', 'smoked', 'smoking', 'reports',
  'states', 'endorses', 'home', 'new', 'current',
  // Medication-management verbs
  'hold', 'held', 'resume', 'resumed', 'restart', 'restarted', 'stop',
  'stopped', 'discontinue', 'discontinued',
  // Verbs / stopwords that commonly precede a dose
  'took', 'take', 'takes', 'taking', 'given', 'give', 'gave', 'received',
  'receive', 'receives', 'receiving', 'administered', 'administer', 'start',
  'started', 'starting', 'continue', 'continued',
  'increase', 'increased', 'decrease', 'decreased', 'change', 'changed',
  'prescribed', 'using', 'uses', 'use', 'needs', 'dose', 'doses', 'dosed',
  'total', 'a', 'an', 'of', 'the', 'and', 'or', 'to', 'on', 'at', 'in', 'with', 'for',
  'was', 'is', 'are', 'be', 'by', 'then', 'also', 'plus', 'about', 'approx',
  'approximately', 'additional', 'another', 'than', 'up', 'from',
  // Frequency words that can precede the next medication on a line
  'daily', 'nightly', 'weekly', 'bid', 'tid', 'qid', 'prn', 'needed',
]);

/**
 * Route normalization table (lowercased, whitespace-collapsed keys)
 */
const ROUTE_MAP: Record<string, MedicationRoute> = {
  po: 'oral',
  'by mouth': 'oral',
  orally: 'oral',
  iv: 'intravenous',
  ivp: 'intravenous',
  ivpb: 'intravenous',
  intravenous: 'intravenous',
  intravenously: 'intravenous',
  im: 'intramuscular',
  intramuscular: 'intramuscular',
  intramuscularly: 'intramuscular',
  sq: 'subcutaneous',
  sc: 'subcutaneous',
  subq: 'subcutaneous',
  subcut: 'subcutaneous',
  subcutaneous: 'subcutaneous',
  subcutaneously: 'subcutaneous',
  sl: 'sublingual',
  sublingual: 'sublingual',
  sublingually: 'sublingual',
  pr: 'rectal',
  'per rectum': 'rectal',
  rectally: 'rectal',
  topical: 'topical',
  topically: 'topical',
  inhaled: 'inhaled',
  'via nebulizer': 'inhaled',
  nebulized: 'inhaled',
  neb: 'inhaled',
};

// ============================================================================
// Detection Functions
// ============================================================================

/**
 * Detect medication (drug + dose) mentions in clinical text
 *
 * @param text - Clinical text to analyze
 * @returns Array of medication mentions with positions, sorted by position
 *
 * @example
 * ```typescript
 * const meds = detectMedications('Metoprolol 25 mg PO BID, aspirin 81 mg');
 * // Returns [
 * //   { name: 'Metoprolol', dose: 25, unit: 'mg', route: 'oral', frequency: 'BID', ... },
 * //   { name: 'aspirin', dose: 81, unit: 'mg', ... }
 * // ]
 * ```
 */
export function detectMedications(text: string): MedicationMention[] {
  const medications: MedicationMention[] = [];

  const nameFirst = MEDICATION_PATTERNS.medication;
  let regex = new RegExp(nameFirst.source, nameFirst.flags);
  let match;
  while ((match = regex.exec(text)) !== null) {
    const mention = parseMedicationMatch(match, text);
    if (mention) {
      medications.push(mention);
    }
  }

  const doseFirst = MEDICATION_PATTERNS.doseFirst;
  regex = new RegExp(doseFirst.source, doseFirst.flags);
  while ((match = regex.exec(text)) !== null) {
    const mention = parseDoseFirstMatch(match, text);
    if (mention) {
      medications.push(mention);
    }
  }

  return deduplicateMedications(medications).sort(
    (a, b) => a.startOffset - b.startOffset
  );
}

/**
 * Get protected ranges for all medication mentions.
 * These ranges should not be split during chunking.
 *
 * @param text - Text to analyze
 * @returns Array of start/end positions
 */
export function getMedicationProtectedRanges(
  text: string
): Array<{ start: number; end: number }> {
  return detectMedications(text).map((m) => ({
    start: m.startOffset,
    end: m.endOffset,
  }));
}

/**
 * Normalize a route abbreviation or phrase to a {@link MedicationRoute}
 *
 * @param route - Route as written ("PO", "IV", "subcut", "neb")
 * @returns Normalized route, or 'other' if unrecognized
 */
export function normalizeRoute(route: string): MedicationRoute {
  const key = route.toLowerCase().replace(/\s+/g, ' ').trim();
  return ROUTE_MAP[key] ?? 'other';
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Parse a composite regex match into a MedicationMention, applying the
 * name filters. Returns null when no valid name remains.
 */
function parseMedicationMatch(
  match: RegExpExecArray,
  text: string
): MedicationMention | null {
  const fullName = match[1];
  const tokens = fullName.split(/[ \t]+/);

  if (isFollowedByAlcohol(text, match.index + match[0].length)) {
    return null;
  }

  // A vital/lab keyword or stopword right before the dose means this is a
  // measurement or not a named drug ("glucose 180 mg", "received 2 units").
  if (isExcluded(tokens[tokens.length - 1])) {
    return null;
  }
  // Leading stopwords are dropped instead ("takes aspirin 81 mg" -> "aspirin")
  let nameOffset = 0;
  while (tokens.length > 1 && isExcluded(tokens[0])) {
    nameOffset = fullName.indexOf(tokens[1], nameOffset + tokens[0].length);
    tokens.shift();
  }

  // A route written in the name position ("IV Furosemide", "Furosemide IV")
  // is not part of the name; it supplies the route if none trails the dose
  let nameRoute: MedicationRoute | undefined;
  if (tokens.length > 1 && isRouteToken(tokens[0])) {
    nameRoute = normalizeRoute(tokens.shift()!);
  } else if (tokens.length > 1 && isRouteToken(tokens[tokens.length - 1])) {
    nameRoute = normalizeRoute(tokens.pop()!);
  }

  const name = tokens.join(' ');
  if (!hasEnoughLetters(name)) {
    return null;
  }

  const route = match[5] ? normalizeRoute(match[5]) : nameRoute;
  const frequency = match[6] ? match[6].replace(/\s+/g, ' ') : undefined;

  let confidence: number = MEDICATION_CONFIDENCE.doseOnly;
  if (route && frequency) {
    confidence = MEDICATION_CONFIDENCE.withRouteAndFrequency;
  } else if (route || frequency) {
    confidence = MEDICATION_CONFIDENCE.withRouteOrFrequency;
  }

  return {
    name,
    raw: match[0].slice(nameOffset),
    dose: parseNumber(match[2]),
    doseMax: match[3] ? parseNumber(match[3]) : undefined,
    unit: match[4],
    route,
    frequency,
    startOffset: match.index + nameOffset,
    endOffset: match.index + match[0].length,
    confidence,
  };
}

/**
 * Parse a dose-first regex match ("Gave 2 mg morphine IV") into a
 * MedicationMention. The verb prefix is excluded from the span.
 */
function parseDoseFirstMatch(
  match: RegExpExecArray,
  text: string
): MedicationMention | null {
  const name = match[6].replace(/[ \t]+/g, ' ');
  const tokens = name.split(' ');
  if (tokens.some(isExcluded) || !hasEnoughLetters(name)) {
    return null;
  }

  const startOffset = match.index + match[1].length;
  const endOffset = match.index + match[0].length;
  if (isFollowedByAlcohol(text, endOffset)) {
    return null;
  }

  return {
    name,
    raw: match[0].slice(match[1].length),
    dose: parseNumber(match[2]),
    doseMax: match[3] ? parseNumber(match[3]) : undefined,
    unit: match[4],
    route: match[7]
      ? normalizeRoute(match[7])
      : match[5]
        ? normalizeRoute(match[5])
        : undefined,
    frequency: match[8] ? match[8].replace(/\s+/g, ' ') : undefined,
    startOffset,
    endOffset,
    confidence: MEDICATION_CONFIDENCE.doseFirst,
  };
}

/**
 * Remove overlapping mentions, preferring longer spans and then higher
 * confidence
 */
function deduplicateMedications(
  mentions: MedicationMention[]
): MedicationMention[] {
  if (mentions.length <= 1) return mentions;

  const ranked = [...mentions].sort((a, b) => {
    const lengthDiff =
      b.endOffset - b.startOffset - (a.endOffset - a.startOffset);
    if (lengthDiff !== 0) return lengthDiff;
    return b.confidence - a.confidence;
  });

  const result: MedicationMention[] = [];
  for (const mention of ranked) {
    const overlaps = result.some(
      (r) =>
        mention.startOffset < r.endOffset && r.startOffset < mention.endOffset
    );
    if (!overlaps) {
      result.push(mention);
    }
  }

  return result;
}

/**
 * Whether the text at `position` continues with "of alcohol" / "of EtOH"
 */
function isFollowedByAlcohol(text: string, position: number): boolean {
  return /^[ \t]+of[ \t]+(?:alcohol|etoh|beer|wine|liquor)\b/i.test(
    text.slice(position, position + 20)
  );
}

/**
 * Whether a token is a route of administration ("IV", "PO", "inhaled")
 */
function isRouteToken(token: string): boolean {
  return normalizeRoute(token) !== 'other';
}

/**
 * Require at least 3 letters so abbreviations like "Wt" never qualify
 */
function hasEnoughLetters(name: string): boolean {
  return (name.match(/[A-Za-z]/g) || []).length >= 3;
}

/**
 * Whether a token is a vital/lab keyword or stopword
 */
function isExcluded(token: string): boolean {
  return EXCLUDED_NAME_TOKENS.has(token.toLowerCase());
}

/**
 * Parse a dose number, tolerating thousands separators ("1,000")
 */
function parseNumber(value: string): number {
  return parseFloat(value.replace(/,/g, ''));
}
