/**
 * Parser for nope-edge's XML output.
 *
 * The model card (https://huggingface.co/nopenet/nope-edge, "Output Format"
 * and "Parsing Example") documents:
 *
 * ```xml
 * <reflection>...free-text reasoning...</reflection>
 * <risks>
 *   <risk subject="self" type="suicide" severity="high" imminence="urgent" features="active_ideation"/>
 * </risks>
 * ```
 *
 * or `<risks/>` when there is no risk. Following NOPE's own parser, any
 * `<risk>` whose `type` is not one of the 9 documented types, or whose
 * `severity` is `none` (or missing), is dropped.
 *
 * This parser is also robust to Markdown code fences, a `<think>` block
 * (Qwen3 reasoning, if a server leaves it in the content), a stray
 * `</think>`, and extra or missing whitespace. It never returns or stores
 * the reflection: the reflection can quote the input text.
 *
 * Output that does not contain a `<risks>` element (or, as NOPE's parser
 * accepts, bare `<risk>` elements) throws a {@link NopeEdgeError} with code
 * `ParseError` and a fixed message. It is never read as "no risk".
 */

import { NopeEdgeError } from './errors';

/** The 9 risk types the model card lists ("these 9 only"). */
export const NOPE_RISK_TYPES = [
  'suicide',
  'self_harm',
  'self_neglect',
  'violence',
  'abuse',
  'sexual_violence',
  'exploitation',
  'stalking',
  'neglect',
] as const;

/** One of the 9 documented risk types. */
export type NopeRiskType = (typeof NOPE_RISK_TYPES)[number];

/** Who is at risk. Missing or unrecognised values become `unknown`, as NOPE's parser defaults. */
export type NopeSubject = 'self' | 'other' | 'unknown';

/**
 * Severity of a kept risk. `none` risks are dropped. A value outside the
 * documented set is kept as `unrecognised` (recall first) and never maps to
 * `crisis`.
 */
export type NopeSeverity = 'mild' | 'moderate' | 'high' | 'critical' | 'unrecognised';

/**
 * Time sensitivity. Missing becomes `not_applicable`, as NOPE's parser
 * defaults; a value outside the documented set becomes `unrecognised`.
 */
export type NopeImminence = 'not_applicable' | 'chronic' | 'subacute' | 'urgent' | 'emergency' | 'unrecognised';

/** One parsed `<risk>` element. Attribute values are normalised to the documented sets. */
export interface NopeRisk {
  subject: NopeSubject;
  type: NopeRiskType;
  severity: NopeSeverity;
  imminence: NopeImminence;
  /**
   * The model's free-form `features` labels. The card calls them
   * "low-confidence" and says "don't gate decisions on it", so the adapter
   * never uses them for the level. Only label-like tokens
   * (`[a-z0-9_-]`, at most 64 characters, at most 20 labels) are kept, so no
   * free text from the model reaches the result.
   */
  features?: string[];
}

const SUBJECTS: readonly string[] = ['self', 'other', 'unknown'];
const SEVERITIES: readonly string[] = ['mild', 'moderate', 'high', 'critical'];
const IMMINENCES: readonly string[] = ['not_applicable', 'chronic', 'subacute', 'urgent', 'emergency'];
const TYPES: readonly string[] = NOPE_RISK_TYPES;

/** Longest model output the parser accepts (the model emits a few hundred tokens). */
export const MAX_OUTPUT_CHARS = 100_000;

const MAX_FEATURES = 20;
const FEATURE_LABEL = /^[a-z0-9_-]{1,64}$/;

const THINK_BLOCK = /<think\b[^>]*>[\s\S]*?<\/think\s*>/gi;
const THINK_CLOSE = /<\/think\s*>/gi;
const THINK_OPEN = /<think\b[^>]*>/i;
const REFLECTION_BLOCK = /<reflection\b[^>]*>[\s\S]*?<\/reflection\s*>/gi;
const REFLECTION_OPEN = /<reflection\b[^>]*>/i;
const FENCE = /```[A-Za-z0-9_-]*/g;
const RISKS_EMPTY = /<risks\s*\/\s*>/i;
const RISKS_BLOCK = /<risks\s*>([\s\S]*?)<\/risks\s*>/gi;
const RISKS_OPEN = /<risks\b/i;
/** A `<risk ...>` or `<risk .../>` start tag. `<` is excluded so a broken tag cannot swallow the next one. */
const RISK_ELEMENT = /<risk\b([^<>]*)>/gi;
const RISK_CLOSE = /<\/risk\s*>/gi;
const RISK_ANY = /<risk\b/i;
const ATTRIBUTE = /([A-Za-z_][\w.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;

function parseError(message: string): NopeEdgeError {
  return new NopeEdgeError(`nope-edge: ${message}`, 'ParseError');
}

/**
 * Remove reasoning that is not part of the answer: `<think>` blocks (and
 * everything before a stray `</think>` or after an unclosed `<think>`), code
 * fence markers, and `<reflection>` blocks (an unclosed reflection runs to
 * the next `<risks` or to the end).
 */
function stripNonAnswer(output: string): string {
  let s = output.replace(THINK_BLOCK, ' ');

  // A server can strip the opening <think> (the template may put it in the
  // prompt) and leave "...reasoning...</think> answer"; keep only the answer.
  let lastClose = -1;
  for (const m of s.matchAll(THINK_CLOSE)) lastClose = (m.index ?? 0) + m[0].length;
  if (lastClose >= 0) s = s.slice(lastClose);

  // An unclosed <think> means the rest is reasoning.
  const open = THINK_OPEN.exec(s);
  if (open) s = s.slice(0, open.index);

  s = s.replace(FENCE, ' ');
  s = s.replace(REFLECTION_BLOCK, ' ');

  const reflection = REFLECTION_OPEN.exec(s);
  if (reflection) {
    const rest = s.slice(reflection.index);
    const risks = RISKS_OPEN.exec(rest);
    s = s.slice(0, reflection.index) + (risks ? rest.slice(risks.index) : '');
  }
  return s;
}

/** Attributes of one start tag, keys lowercased; the first occurrence of a name wins. */
function attributes(source: string): Map<string, string> {
  const attrs = new Map<string, string>();
  for (const m of source.matchAll(ATTRIBUTE)) {
    const name = m[1].toLowerCase();
    if (!attrs.has(name)) attrs.set(name, (m[2] ?? m[3] ?? '').trim().toLowerCase());
  }
  return attrs;
}

function features(value: string | undefined): string[] | undefined {
  if (!value) return undefined;
  const labels = value
    .split(',')
    .map((f) => f.trim())
    .filter((f) => FEATURE_LABEL.test(f))
    .slice(0, MAX_FEATURES);
  return labels.length > 0 ? labels : undefined;
}

/** Parse the `<risk>` start tags in `source`, dropping non-risks as NOPE's parser does. */
function risksIn(source: string): NopeRisk[] {
  const risks: NopeRisk[] = [];
  for (const m of source.matchAll(RISK_ELEMENT)) {
    const attrs = attributes(m[1]);
    const type = attrs.get('type') ?? '';
    if (!TYPES.includes(type)) continue;
    // Missing severity defaults to `none` (dropped), as in NOPE's parser
    const severity = attrs.get('severity') ?? 'none';
    if (severity === 'none') continue;

    const subject = attrs.get('subject') ?? 'unknown';
    const imminence = attrs.get('imminence') || 'not_applicable';
    const risk: NopeRisk = {
      subject: (SUBJECTS.includes(subject) ? subject : 'unknown') as NopeSubject,
      type: type as NopeRiskType,
      severity: (SEVERITIES.includes(severity) ? severity : 'unrecognised') as NopeSeverity,
      imminence: (IMMINENCES.includes(imminence) ? imminence : 'unrecognised') as NopeImminence,
    };
    const f = features(attrs.get('features'));
    if (f) risk.features = f;
    risks.push(risk);
  }
  return risks;
}

/** Throw when a `<risk` remains that is not a complete start tag (for example a truncated one). */
function assertNoBrokenRisk(source: string): void {
  const rest = source.replace(RISK_ELEMENT, ' ').replace(RISK_CLOSE, ' ');
  if (RISK_ANY.test(rest)) throw parseError('model output has a malformed <risk> element');
}

/**
 * Parse nope-edge output into its risks.
 *
 * @param output - The assistant message content from the model server
 * @returns The kept risks (empty for `<risks/>`), in output order
 * @throws {@link NopeEdgeError} (`ParseError`, fixed message) when the
 *   output has no `<risks>` element or bare `<risk>` elements, has an
 *   unterminated `<risks>` or a malformed `<risk>`, or is too long
 */
export function parseNopeOutput(output: string): NopeRisk[] {
  if (typeof output !== 'string') throw parseError('model output is not a string');
  if (output.length > MAX_OUTPUT_CHARS) throw parseError('model output is too long');

  const answer = stripNonAnswer(output);

  const blocks = [...answer.matchAll(RISKS_BLOCK)];
  if (blocks.length > 0) {
    const risks: NopeRisk[] = [];
    for (const b of blocks) {
      assertNoBrokenRisk(b[1]);
      risks.push(...risksIn(b[1]));
    }
    return risks;
  }

  if (RISKS_EMPTY.test(answer)) return [];
  if (RISKS_OPEN.test(answer)) throw parseError('model output has an unterminated <risks> element');

  // NOPE's own parser scans the whole output for <risk> elements, so bare
  // elements without a <risks> wrapper are accepted too.
  if (RISK_ANY.test(answer)) {
    assertNoBrokenRisk(answer);
    return risksIn(answer);
  }

  throw parseError('model output has no <risks> element');
}
