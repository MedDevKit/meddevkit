/**
 * Negation Pattern Detection
 *
 * Identifies negated medical findings in clinical text.
 * Examples: "no chest pain", "denies fever", "ruled out MI"
 *
 * Each pattern captures its target in group 1. Patterns come in two shapes:
 *
 * - **Forward** (cue before target, "no X"): the capture is a raw window up to
 *   the sentence end, narrowed by {@link resolveForwardScope}. Scope stops at
 *   a clause boundary ("but", "however", " - ", ":") and only crosses commas
 *   for a coordinated list ("no cyanosis, clubbing or edema").
 * - **Backward** (target before cue, "troponin negative"): the capture is the
 *   words before the cue, trimmed by {@link resolveBackward} so it starts
 *   after the last clause boundary ("positive for A but B negative" gives B).
 *
 * Pseudo-negations ("cannot exclude", "could not rule out", "not excluded",
 * "not negative for") are skipped: the finding is still possible.
 *
 * The "not"/"never" cue only counts inside a finding frame ("does not have
 * X", "is not tender", "has not had X"); actions, opinions and admin clauses
 * ("did not measure it", "did not think", "whether or not") are skipped. See
 * the "not" / "never" frames section below.
 *
 * A first item longer than {@link FIRST_ITEM_MAX} is cut at a word boundary,
 * never mid-word.
 *
 * @packageDocumentation
 */

import type { NegationContext, NegationType } from '../types';

// ============================================================================
// Shared Fragments
// ============================================================================

/**
 * Forward scope window: up to the sentence or line end. Commas are allowed
 * so coordinated lists can be followed; {@link resolveForwardScope} narrows it.
 */
const SCOPE = '([^.;\\n]{2,160})';

/**
 * Backward target window: the words before a trailing cue, within one clause
 * (no sentence, comma or colon boundary).
 */
const BEFORE = '([^.;,:\\n]{3,30})';

// ----------------------------------------------------------------------------
// "not" / "never" frames
//
// A bare "not" cue negates far more than findings: actions ("did not measure
// it", "did not call"), opinions ("did not think"), abilities ("could not
// recite") and admin ("do not have an official interpretation"). The cue is
// therefore only accepted inside a frame, and which list applies depends on
// what follows the auxiliary:
//
// - do-support and perfect ("does not have X", "has not had X", "never
//   smoked"): the next word is a lexical verb, an open class that is mostly
//   actions. These use an ALLOW-list ({@link NOT_LIGHT_VERB},
//   {@link NOT_CONTENT_VERB}): only verbs that report or carry a finding.
// - copula and telegraphic ("is not tender", "was not consistent with
//   mastoiditis", "Abdomen not distended"): the next word is a predicate
//   adjective or participle, an open class that is mostly findings. These use
//   a BLOCK-list ({@link NOT_COPULA_SKIP}) of pseudo-negations, process
//   participles ("not done", "not measured") and function words.
// ----------------------------------------------------------------------------

/** Optional adverb between the cue and the frame word ("does not currently have") */
const NOT_ADV =
  '(?:(?:currently|usually|really|typically|recently|ever|generally|otherwise|regularly|actively)\\s+)?';

/**
 * Verbs that only report the finding that follows and are dropped from the
 * target: "does not have fever", "is not complaining of pain", "has not
 * experienced any chest pain", "does not appear to be in distress".
 */
const NOT_LIGHT_VERB =
  '(?:ha(?:ve|s|d|ving)|experienc(?:e|es|ed|ing)|report(?:s|ed|ing)?|complain(?:s|ed|ing)?\\s+(?:of|about)|' +
  'notic(?:e|es|ed|ing)|endors(?:e|es|ed|ing)|develop(?:s|ed|ing)?|exhibit(?:s|ed|ing)?|show(?:s|ed|n|ing)?(?!\\s+up\\b)|' +
  'demonstrat(?:e|es|ed|ing)|reveal(?:s|ed|ing)?|display(?:s|ed|ing)?|suffer(?:s|ed|ing)?\\s+from|' +
  'describ(?:e|es|ed|ing)|indicat(?:e|es|ed|ing)|suggest(?:s|ed|ing)?|undergo(?:es|ne|ing)?|underwent|' +
  'appear(?:s|ed|ing)?(?:\\s+to\\s+(?:be|have))?)';

/**
 * Verbs that are themselves the finding and stay in the target: "never
 * smoked", "did not vomit", "pain does not radiate", "did not lose
 * consciousness", "does not use illicit drugs".
 */
const NOT_CONTENT_VERB =
  '(?:smok(?:e|es|ed|ing)|drink(?:s|ing)?|drank|drunk|vomit(?:s|ed|ing)?|faint(?:s|ed|ing)?|' +
  'us(?:e|es|ed|ing)\\s+(?:any\\s+)?(?:tobacco|alcohol|drugs?|illicit|street|recreational|intravenous|IV|' +
  'cigarettes?|marijuana|cannabis|cocaine|heroin|opioids?|narcotics?|substances?|smokeless|e-?cigarettes?)|' +
  'pass(?:es|ed)?\\s+out|bleed(?:s|ing)?|bled|radiat(?:e|es|ed|ing)|wheez(?:e|es|ed|ing)|cough(?:s|ed|ing)?|' +
  'seiz(?:e|es|ed|ing)|(?:lose|loses|lost|losing)\\s+consciousness|snor(?:e|es|ed|ing)|itch(?:es|ed|ing)?|' +
  'swell(?:s|ed|ing)?|drain(?:s|ed|ing)?|ooz(?:e|es|ed|ing)|limp(?:s|ed|ing)?|abus(?:e|es|ed|ing)|requir(?:e|es|ed|ing))';

/** Optional "any" after a light verb ("has not had any fever") */
const NOT_ANY = '(?:any\\s+)?';

/** A frame verb: light (dropped) or content (kept) */
const NOT_FRAME_VERB = `(?:${NOT_LIGHT_VERB}\\s+${NOT_ANY}|(?=${NOT_CONTENT_VERB}\\b))`;

/**
 * Words after a copula "not" / telegraphic "not" that do not start a negated
 * finding: pseudo-negations ("not only", "not sure", "not certain", "not
 * clear", "not necessarily", "not excluded", "not negative"), process or
 * admin participles ("not done", "not measured", "not available", "not been
 * seen", "not provided"), "not associated with" (the `without` type), and
 * function words that start an opinion or admin clause ("is not a candidate",
 * "is not the cause"). "in" is kept only for "not in (any acute) distress".
 */
const NOT_COPULA_SKIP =
  '(?:only|sure|certain(?:ly)?|clear(?:ly)?|known|yet|(?:un)?able|tolerat\\w*|exclud\\w*|rul(?:e|es|ed|ing)|' +
  'be|been|associated|necessar(?:y|ily)|need(?:s|ed)?|want(?:s|ed)?|wish(?:es|ed)?|feel|felt|recall\\w*|' +
  'remember\\w*|know\\w*|understand\\w*|improv\\w*|resolv\\w*|respon\\w*|relieved|help\\w*|well|uncommon|' +
  'unusual|to|noted|seen|appreciated|identified|found|detected|present|visualized|done|performed|obtained|' +
  'available|indicated|applicable|required|change[sd]?|worse|better|significant(?:ly)?|always|negative|' +
  'positive|measured|recorded|assessed|tested|checked|evaluated|examined|ordered|given|sent|scheduled|' +
  'attempted|completed|reported|documented|provided|disclosed|specified|mentioned|discussed|stated|' +
  'palpated|auscultated|heard|elicited|shown|demonstrated|revealed|displayed|exhibited|noticed|described|' +
  'suggested|treated|addressed|' +
  'allowed|permitted|recommended|advised|thought|believed|considered|expected|related|due|candidate|' +
  'interested|willing|ready|aware|compliant|enough|an|a(?!\\s+(?:smoker|drinker))|the|this|that|it|its|' +
  'his|her|their|my|our|your|' +
  'all|as|at|for|of|on|with|by|from|so|too|very|much|just|quite|entirely|completely|totally|really|even|' +
  'until|because|since|limited\\s+to|exclusive|obtainable|prescribed|safe|optimal|desirable|appropriate|' +
  'advisable|feasible|possible|likely|unlikely|reasonable|ideal|practical|worth|effective|successful|' +
  '(?:large|big|long|strong)\\s+enough|in(?!\\s+(?:\\w+\\s+){0,2}distress))\\b';

/** A following "-ing" word is an action ("not taking a shower") unless it is a frame verb */
const NOT_ACTION_GERUND = `(?!${NOT_LIGHT_VERB}\\b|${NOT_CONTENT_VERB}\\b)[a-z]+ing\\b`;

/** Words before a cue that make it a modal, conditional or infinitive: "could not", "whether or not", "if not", "to not" */
const NOT_MODAL_BEFORE =
  '(?<!\\b(?:can|could|would|will|should|may|might|must|shall|to|or|if|whether|why)\\s+)';

/** A bare "not" whose auxiliary is matched by another frame ("did not", "is not") */
const NOT_AUX_BEFORE =
  '(?<!\\b(?:do|does|did|is|are|was|were|am|has|have|had|be|been|being|I|we)\\s+)';

// ----------------------------------------------------------------------------
// Forward "Negative X" (review-of-systems style)
// ----------------------------------------------------------------------------

/**
 * Words that "negative" modifies without negating anything: "negative
 * pressure (wound therapy)", "negative predictive value", "negative
 * inspiratory force", "negative T waves", "negative fluid balance",
 * "negative effect". Neither the forward nor the postfix form fires on them.
 */
const NEG_MODIFIED =
  '(?:pressure|predictive|predictor|inspiratory|expiratory|feedback|balance|deflections?|t[- ]?waves?|' +
  'ions?|charges?|effects?|impact|attitudes?|thoughts?|thinking|feelings?|emotions?|outlook|self|mood|' +
  'symptoms?|side|consequences?|outcomes?|values?|numbers?)';

/**
 * Words after "negative" that do not start a negated finding: the
 * {@link NEG_MODIFIED} words, "negative for" (its own pattern), and function
 * words ("Negative except as noted", "negative bilaterally", "negative x3").
 */
const NEG_FWD_SKIP =
  `(?:for|${NEG_MODIFIED}|except|otherwise|and|or|but|as|in|on|at|to|with|aside|times|results?|` +
  'findings?|today|bilaterally|throughout|per|by|other|so|also|now|then|than|since|until|this|that|the|' +
  'a|an|x(?=\\s*\\d))\\b';

/**
 * Where a forward "Negative X" may start: the start of a line, sentence or
 * list item, or right after a header colon or a comma ("GI: Negative
 * dysphagia, negative nausea"). A word right before "negative" makes it a
 * modifier or a postfix cue instead: "gram-negative rods", "Rh negative
 * mother", "HIV negative patient" (the postfix form negates HIV).
 */
const NEG_FWD_START = '(?<=(?:^|[.;:,!?(])[ \\t]*(?:(?:[-*•]|\\d+[.)])[ \\t]*)?)';

// ============================================================================
// Negation Patterns
// ============================================================================

/**
 * Patterns for detecting negated medical findings
 */
export const NEGATION_PATTERNS: Record<NegationType, RegExp[]> = {
  /**
   * Absent - "no X", "without X", "absence of X", "does not have X",
   * "never X", "X absent", "Header: None"
   */
  absent: [
    // "no chest pain", "no evidence of infection", "neither fever nor chills"
    new RegExp(
      `\\b(?:no|neither)\\s+(?:evidence\\s+of\\s+|signs?\\s+of\\s+|symptoms?\\s+of\\s+)?${SCOPE}`,
      'gi'
    ),
    // "absence of edema", "absent bowel sounds", "free of disease"
    new RegExp(`\\b(?:absence\\s+of|absent|free\\s+(?:of|from))\\s+${SCOPE}`, 'gi'),
    // do-support / "never" + finding verb (allow-list): "does not have fever",
    // "didn't report nausea", "never smoked", "does not radiate". Skips
    // "did not measure/go/call/think", "do not see a need", "I do not have".
    new RegExp(
      `${NOT_MODAL_BEFORE}(?<!\\b(?:I|we)\\s+)\\b(?:(?:do|does|did)\\s+not|(?:do|does|did)n['’]t|never)\\s+` +
        `${NOT_ADV}${NOT_FRAME_VERB}${SCOPE}`,
      'gi'
    ),
    // clinician observation or judgment (allow-list): "I do not appreciate
    // any cord edema", "we did not see a tear", "I do not suspect AFib".
    // Skips "do not see a need/reason".
    new RegExp(
      `\\b(?:I|we)\\s+(?:(?:do|did)\\s+not|(?:do|did)n['’]t)\\s+${NOT_ADV}` +
        `(?:appreciate|see|identify|detect|visualize|palpate|hear|find|note|notice|suspect)\\s+` +
        `(?!(?:a|any|the)\\s+(?:need|reason)\\b)${NOT_ANY}${SCOPE}`,
      'gi'
    ),
    // perfect + finding participle (allow-list): "has not had any fever",
    // "hasn't experienced chest pain", "has never smoked"
    new RegExp(
      `${NOT_MODAL_BEFORE}\\b(?:(?:has|have|had)\\s+(?:not|never)|(?:has|have|had)n['’]t)\\s+` +
        `${NOT_ADV}${NOT_FRAME_VERB}${SCOPE}`,
      'gi'
    ),
    // copula or telegraphic "not" + predicate (block-list): "is not tender",
    // "has not been febrile", "is not having any pain", "Abdomen not
    // distended". Skips "not only/sure/clear/done/available", "not been
    // seen", "whether or not", "if not", "could not", "not taking a shower".
    new RegExp(
      `${NOT_MODAL_BEFORE}\\b(?:(?:is|are|was|were|am)\\s+(?:not|never)|(?:is|are|was|were)n['’]t|` +
        `(?:has|have|had)\\s+(?:not|never)\\s+been|(?:has|have|had)n['’]t\\s+been|never\\s+been|` +
        `${NOT_AUX_BEFORE}not)\\s+${NOT_ADV}(?!${NOT_COPULA_SKIP})(?!${NOT_ACTION_GERUND})` +
        `(?:${NOT_LIGHT_VERB}\\s+${NOT_ANY})?${SCOPE}`,
      'gi'
    ),
    // "pedal pulses absent", "bowel sounds are absent"
    new RegExp(`\\b${BEFORE}\\s+absent\\b`, 'gi'),
    // "COMPLICATIONS: None", "Allergies: none known" (whole field value)
    /^[ \t]*(?:[-*•][ \t]*|\d+[.)][ \t]*)?([A-Za-z][A-Za-z /&'()-]{1,40}?)[ \t]*:[ \t]*none(?:[ \t]+known)?\b(?=[ \t]*(?:[.;,]|$))/gim,
  ],

  /**
   * Denied - patient denies symptom
   */
  denied: [
    // "denies chest pain", "patient denies fever"
    new RegExp(`\\b(?:patient\\s+)?denies\\s+${SCOPE}`, 'gi'),
    // "denied having headaches"
    new RegExp(`\\bdenied\\s+(?:having\\s+|any\\s+)?${SCOPE}`, 'gi'),
  ],

  /**
   * Ruled out - completed diagnostic exclusion. Only past forms negate:
   * "ruled out MI", "MI was ruled out", "Stroke was excluded", "excluded MI".
   * The plan form "rule out X" / "r/o X" ("Need to rule out MI", "R/O
   * sepsis") means X is still under consideration, so it is not matched
   * (NegEx treats it as an uncertainty trigger). "cannot exclude", "could not
   * rule out" and "not excluded" are pseudo-negations and are skipped.
   */
  ruled_out: [
    // "ruled out MI", "Ruled out for PE"
    new RegExp(`\\bruled\\s+out\\s+(?:for\\s+)?${SCOPE}`, 'gi'),
    // "MI has been ruled out", "Stroke was excluded"
    new RegExp(`\\b${BEFORE}\\s+(?:ruled\\s+out|excluded)\\b`, 'gi'),
    // "excluded MI"
    new RegExp(`\\bexcluded\\s+${SCOPE}`, 'gi'),
  ],

  /**
   * Negative - test/finding is negative
   */
  negative: [
    // "negative for malignancy"
    new RegExp(`\\bnegative\\s+for\\s+${SCOPE}`, 'gi'),
    // ROS style "Negative dysphagia, negative nausea": a cue before the
    // finding at the start of a line, sentence or list item, or after a
    // header colon or comma (see NEG_FWD_START / NEG_FWD_SKIP)
    new RegExp(`${NEG_FWD_START}\\bnegative[ \\t]+(?!${NEG_FWD_SKIP})${SCOPE}`, 'gim'),
    // "troponin negative", "Flu test was negative" ("Rh negative" and
    // "gram negative" are rejected in resolveBackward)
    new RegExp(`\\b${BEFORE}\\s+negative\\b(?![\\s-]+(?:for|${NEG_MODIFIED})\\b)`, 'gi'),
    // "Influenza A: negative", "REVIEW OF SYSTEMS:\nNegative." (the value may
    // sit on the next line). "GI: Negative dysphagia" is left to the forward
    // pattern above, which negates the finding instead of the header.
    new RegExp(
      `\\b([^.;,:\\n]{2,30})[ \\t]*:[ \\t]*\\n?[ \\t]*negative\\b(?![ \\t-]+(?:for|${NEG_MODIFIED})\\b|[ \\t]+(?!${NEG_FWD_SKIP})[a-z])`,
      'gi'
    ),
    // "unremarkable exam". "normal X" is not matched: it asserts a normal
    // finding rather than negating one ("normal saline", "normal range").
    new RegExp(`\\bunremarkable\\s+${SCOPE}`, 'gi'),
  ],

  /**
   * Without - clinical context without finding
   */
  without: [
    // "without edema", "without fever"
    new RegExp(`\\bwithout\\s+(?:any\\s+|evidence\\s+of\\s+)?${SCOPE}`, 'gi'),
    // "not associated with pain"
    new RegExp(`\\bnot\\s+associated\\s+with\\s+${SCOPE}`, 'gi'),
  ],
};

/**
 * Confidence scores for negation types
 */
export const NEGATION_CONFIDENCE: Record<NegationType, number> = {
  absent: 0.90,
  denied: 0.85,
  ruled_out: 0.95,
  negative: 0.90,
  without: 0.80,
};

// ============================================================================
// Scope Rules
// ============================================================================

/** Maximum length of the first (or only) negated item, as before lists */
const FIRST_ITEM_MAX = 40;

/** Maximum words in one item of a coordinated list ("or night sweats") */
const LIST_ITEM_MAX_WORDS = 5;

/**
 * Ends a forward scope: clause conjunctions ("but", "however"), a new
 * clause joined by "and/or" + verb ("no fever and is eating well"),
 * a dash separator or a colon.
 */
const FORWARD_TERMINATOR =
  /\s*\b(?:but|however|although|though|yet|whereas|except|other\s+than|aside\s+from|apart\s+from|which|who)\b|\s+(?:and|or)\s+(?:is|are|was|were|has|have|had|does|did|will|reports?|states?|endorses|complains)\b|\s+[-–]\s+|\s*:/i;

/**
 * Starts a backward target: the target begins after the last clause
 * boundary ("positive for A but B negative" gives "B").
 */
const BACKWARD_BOUNDARY = /\b(?:but|however|although|though|yet|whereas|while|except)\b|\s[-–]\s/gi;

/** A list item that opens a new negation or clause ends the list */
const LIST_ITEM_STOP =
  /^(?:no|not|neither|denies|denied|without|never|negative)\b|\b(?:is|are|was|were|be|been|has|have|had|does|did|reports?|states?|appears?|noted|presents?|with|which|who|that)\b/i;

/** The final item of a coordinated list: "or edema", "clubbing or edema", ", and rash" */
const LIST_FINAL_ITEM = /^(?:or|nor|and)\s|\s(?:or|nor)\s/i;

/**
 * Text right before a forward cue that cancels it: "cannot exclude",
 * "could not rule out", "not negative for", "unable to rule out".
 */
const PSEUDO_BEFORE_CUE = /(?:\bnot|n['’]t|\bcannot|\bunable\s+to)\s+(?:be\s+|been\s+)?$/i;

/**
 * End of a backward target that cancels the cue: "PE has not been ruled out",
 * "Malignancy is not excluded", "not negative".
 */
const PSEUDO_TARGET_TAIL = /(?:\bnot|n['’]t|\bcannot)(?:\s+(?:be|been))?\s*$/i;

/** Trailing copula captured before a backward cue ("Flu test was") */
const TRAILING_COPULA = /\s+(?:is|are|was|were|has\s+been|have\s+been|had\s+been|been|be)\s*$/i;

// ============================================================================
// Detection Functions
// ============================================================================

/**
 * Detect negated findings in clinical text
 *
 * For a forward cue the span runs from the cue to the end of the negated
 * text; for a backward cue ("pedal pulses absent") it runs from the start
 * of the target to the end of the cue. A coordinated list is one span whose
 * `negatedText` holds the whole list ("cyanosis, clubbing or edema").
 *
 * @param text - Clinical text to analyze
 * @returns Array of negation contexts with positions
 *
 * @example
 * ```typescript
 * const negations = detectNegations('Patient denies chest pain. No fever.');
 * // Returns [
 * //   { negatedText: 'chest pain', type: 'denied', ... },
 * //   { negatedText: 'fever', type: 'absent', ... }
 * // ]
 * ```
 */
export function detectNegations(text: string): NegationContext[] {
  const negations: NegationContext[] = [];

  for (const [type, patterns] of Object.entries(NEGATION_PATTERNS)) {
    for (const pattern of patterns) {
      const flags = pattern.flags.includes('d') ? pattern.flags : pattern.flags + 'd';
      const regex = new RegExp(pattern.source, flags);
      let match: RegExpExecArray | null;

      while ((match = regex.exec(text)) !== null) {
        const matchEnd = match.index + match[0].length;
        const group = match.indices?.[1];
        // Forward patterns end with the target group; backward ones end with the cue
        const forward = group !== undefined && group[1] === matchEnd;
        const detection = !group
          ? null
          : forward
            ? resolveForward(text, match.index, group[0], group[1])
            : resolveBackward(text, group[0], group[1], matchEnd);

        if (detection) {
          negations.push({
            ...detection,
            type: type as NegationType,
            confidence: NEGATION_CONFIDENCE[type as NegationType],
          });
        }

        // A forward scope may have been narrowed (or skipped); resume after it
        // so a later cue inside the raw window ("no fever, no chills") is
        // still found. A later backward match would end at the same cue.
        regex.lastIndex = forward
          ? Math.max(match.index + 1, detection?.endOffset ?? 0)
          : Math.max(match.index + 1, matchEnd);
      }
    }
  }

  // Remove duplicates and sort by position
  return deduplicateNegations(negations).sort(
    (a, b) => a.startOffset - b.startOffset
  );
}

/**
 * Check if a specific term is negated in the text
 *
 * @param text - Clinical text
 * @param term - Term to check for negation
 * @returns True if the term appears in a negation context
 */
export function isTermNegated(text: string, term: string): boolean {
  const negations = detectNegations(text);
  const lowerTerm = term.toLowerCase();

  return negations.some(
    (n) => n.negatedText.toLowerCase().includes(lowerTerm)
  );
}

/**
 * Get all negated terms from text
 *
 * @param text - Clinical text
 * @returns Array of negated term strings
 */
export function getNegatedTerms(text: string): string[] {
  const negations = detectNegations(text);
  return [...new Set(negations.map((n) => n.negatedText))];
}

// ============================================================================
// Helper Functions
// ============================================================================

type Resolved = Pick<NegationContext, 'negatedText' | 'startOffset' | 'endOffset'>;

/**
 * Resolve a forward match ("no X"): skip pseudo-negations, then narrow the
 * raw window to the negated scope.
 */
function resolveForward(
  text: string,
  cueStart: number,
  targetStart: number,
  targetEnd: number
): Resolved | null {
  const lineStart = text.lastIndexOf('\n', cueStart - 1) + 1;
  if (PSEUDO_BEFORE_CUE.test(text.slice(lineStart, cueStart))) return null;

  const raw = text.slice(targetStart, targetEnd);
  let end = resolveForwardScope(raw);
  // The raw window hit its length limit inside a word: end at the last whole word
  if (end === raw.length && /\w/.test(text[targetEnd] ?? '') && /\w$/.test(raw)) {
    const lastSpace = raw.search(/\s\S*$/);
    if (lastSpace > 0) end = trimDanglingTail(raw, lastSpace);
  }
  const negatedText = cleanNegatedText(raw.slice(0, end));
  if (!isUsableTarget(negatedText)) return null;

  return { negatedText, startOffset: cueStart, endOffset: targetStart + end };
}

/**
 * Length of the negated scope within a forward window.
 *
 * The scope ends at the first {@link FORWARD_TERMINATOR}. Within that, the
 * first item ends at a comma (capped at {@link FIRST_ITEM_MAX} characters).
 * The scope continues past commas only for a coordinated list: short items
 * that do not open a new clause, ending in an "or/nor/and" item
 * ("cyanosis, clubbing or edema", "fever, chills, and night sweats").
 * "No fever, patient is well" stays "fever".
 */
function resolveForwardScope(raw: string): number {
  const terminator = FORWARD_TERMINATOR.exec(raw);
  const window = terminator ? raw.slice(0, terminator.index) : raw;

  const firstComma = window.indexOf(',');
  const firstEnd = firstComma === -1 ? window.length : firstComma;
  let end = firstEnd > FIRST_ITEM_MAX ? capAtWordBoundary(raw, FIRST_ITEM_MAX) : firstEnd;

  if (firstComma !== -1 && firstEnd <= FIRST_ITEM_MAX) {
    let segStart = firstComma + 1;
    while (segStart <= window.length) {
      const nextComma = window.indexOf(',', segStart);
      const segEnd = nextComma === -1 ? window.length : nextComma;
      const item = window.slice(segStart, segEnd).trim();
      if (!item || LIST_ITEM_STOP.test(item) || item.split(/\s+/).length > LIST_ITEM_MAX_WORDS) {
        break;
      }
      if (LIST_FINAL_ITEM.test(item)) {
        end = segEnd;
        break;
      }
      if (nextComma === -1) break;
      segStart = nextComma + 1;
    }
  }

  while (end > 0 && /[\s.,;]/.test(raw[end - 1])) end--;
  return end;
}

/**
 * Words a capped scope must not end on ("no new hemorrhage or any other" →
 * "no new hemorrhage").
 */
const DANGLING_TAIL =
  /\s+(?:and|or|nor|the|a|an|of|to|in|on|at|for|with|by|from|that|which|any|other|such\s+as|as|is|are|was|were|be|been|his|her|their|its)$/i;

/**
 * Cut a scope that runs past `max` characters at the last whitespace within
 * the limit, so a span never ends mid-word ("illicit/intrave"), then drop a
 * dangling function word. A single token longer than the limit is kept whole.
 */
function capAtWordBoundary(raw: string, max: number): number {
  if (!/\w/.test(raw[max] ?? '') || !/\w/.test(raw[max - 1] ?? '')) {
    // The cut already falls between words
    return trimDanglingTail(raw, max);
  }
  const lastSpace = raw.slice(0, max).search(/\s\S*$/);
  if (lastSpace <= 0) {
    const tokenEnd = raw.slice(max).search(/\s/);
    return tokenEnd === -1 ? raw.length : max + tokenEnd;
  }
  return trimDanglingTail(raw, lastSpace);
}

/** Drop trailing function words from `raw.slice(0, end)` */
function trimDanglingTail(raw: string, end: number): number {
  let head = raw.slice(0, end).replace(/[\s.,;]+$/, '');
  let tail: RegExpExecArray | null;
  while ((tail = DANGLING_TAIL.exec(head)) !== null && tail.index > 0) {
    head = head.slice(0, tail.index);
  }
  return head.length;
}

/**
 * Resolve a backward match ("X negative", "X ruled out", "Header: None"):
 * start the target after the last clause boundary, drop a trailing copula,
 * and skip pseudo-negations ("not been ruled out") and dash-separated
 * labels ("Chest pain - ruled out MI" negates MI, not chest pain).
 */
function resolveBackward(
  text: string,
  targetStart: number,
  targetEnd: number,
  cueEnd: number
): Resolved | null {
  const raw = text.slice(targetStart, targetEnd);

  let offset = 0;
  for (const boundary of raw.matchAll(BACKWARD_BOUNDARY)) {
    offset = (boundary.index ?? 0) + boundary[0].length;
  }
  let target = raw.slice(offset);
  const lead = target.length - target.trimStart().length;
  offset += lead;
  target = target.trim();

  if (PSEUDO_TARGET_TAIL.test(target) || /[-–:]$/.test(target)) return null;
  target = target.replace(TRAILING_COPULA, '');
  if (/\b(?:gram|rh)$/i.test(target)) return null; // "gram negative rods", "Rh negative" (a blood type)

  const negatedText = cleanNegatedText(target);
  if (!isUsableTarget(negatedText)) return null;

  return { negatedText, startOffset: targetStart + offset, endOffset: cueEnd };
}

/**
 * At least 3 characters with some letters, or a 2-letter uppercase
 * abbreviation ("ruled out MI", "no PE")
 */
function isUsableTarget(negatedText: string): boolean {
  return (
    (negatedText.length >= 3 && /[a-zA-Z]/.test(negatedText)) || /^[A-Z]{2}$/.test(negatedText)
  );
}

/**
 * Clean up the negated text (trim, normalize whitespace)
 */
function cleanNegatedText(text: string): string {
  return text
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[.;,]+$/, ''); // Remove trailing punctuation
}

/**
 * Remove overlapping negation detections
 */
function deduplicateNegations(negations: NegationContext[]): NegationContext[] {
  if (negations.length <= 1) return negations;

  // Sort by start position, then by confidence (descending)
  const sorted = [...negations].sort((a, b) => {
    if (a.startOffset !== b.startOffset) {
      return a.startOffset - b.startOffset;
    }
    return b.confidence - a.confidence;
  });

  const result: NegationContext[] = [];
  let lastEnd = -1;

  for (const negation of sorted) {
    if (negation.startOffset < lastEnd) {
      continue;
    }
    result.push(negation);
    lastEnd = negation.endOffset;
  }

  return result;
}
