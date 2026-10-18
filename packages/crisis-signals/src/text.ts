/**
 * Sentence and clause structure of the input.
 *
 * Sentence splitting is structural and lives in code (SPEC §5; the Python
 * port implements the same rules). Clause boundaries are lexical, so their
 * patterns live in the data file and are only applied here.
 *
 * Positions are mapped to segment ids: two positions share a clause id when
 * no sentence break and no clause boundary lies between them, and share a
 * strong id when no sentence break and no `strong` boundary lies between them.
 */

import type { CompiledBoundary } from './data';
import { countAtMost, findAll } from './regex';

const TERMINATORS = '.!?…';
const CLOSERS = '"\'”’)]';
/** Abbreviations whose trailing period does not end a sentence (structural, not detection vocabulary). */
const ABBREVIATIONS: ReadonlySet<string> = new Set([
  'mr', 'mrs', 'ms', 'dr', 'prof', 'sr', 'jr', 'st', 'vs', 'etc', 'e.g', 'i.e', 'approx', 'dept', 'appt', 'mt',
]);
const WS = /\s/;

function abbreviationBefore(text: string, dot: number): boolean {
  let k = dot - 1;
  while (k >= 0 && /[A-Za-z.]/.test(text[k])) k--;
  const token = text.slice(k + 1, dot).toLowerCase();
  return token.length > 1 && ABBREVIATIONS.has(token);
}

/**
 * Sentence start positions after the first sentence, ascending.
 *
 * A sentence ends after a run of `.`, `!`, `?` or `…` (plus closing quotes
 * or brackets) that is followed by whitespace or the end of the text, and at
 * every line break. A single period after a known abbreviation does not end a
 * sentence. Breaks that would leave a whitespace-only sentence are dropped.
 */
export function sentenceCuts(text: string): number[] {
  const raw: number[] = [];
  const n = text.length;
  let i = 0;
  while (i < n) {
    const ch = text[i];
    if (ch === '\n') {
      raw.push(i + 1);
      i++;
      continue;
    }
    if (TERMINATORS.includes(ch)) {
      let j = i;
      while (j < n && TERMINATORS.includes(text[j])) j++;
      const runLength = j - i;
      while (j < n && CLOSERS.includes(text[j])) j++;
      const followedByBreak = j < n && WS.test(text[j]);
      if (followedByBreak && !(ch === '.' && runLength === 1 && abbreviationBefore(text, i))) raw.push(j);
      i = j;
      continue;
    }
    i++;
  }
  // Keep a break only if the sentence it closes has non-whitespace content (linear scan).
  const cuts: number[] = [];
  let last = 0;
  let p = 0;
  let seen = false;
  for (const c of raw) {
    if (c <= last) continue;
    while (p < c) {
      if (!WS.test(text[p])) seen = true;
      p++;
    }
    if (seen) {
      cuts.push(c);
      last = c;
      seen = false;
    }
  }
  // Drop a final break that leaves only whitespace after it.
  if (cuts.length > 0 && !/\S/.test(text.slice(cuts[cuts.length - 1]))) cuts.pop();
  return cuts;
}

/** Position-to-segment lookups for one input text. */
export interface TextIndex {
  /** Sentence index of a position. */
  sentence(pos: number): number;
  /** Clause segment id of a position (sentence breaks and all boundaries). */
  clause(pos: number): number;
  /** Strong segment id of a position (sentence breaks and strong boundaries). */
  strong(pos: number): number;
}

/** Build the sentence and clause index for `text`. */
export function indexText(text: string, boundaries: readonly CompiledBoundary[]): TextIndex {
  const cuts = sentenceCuts(text);
  const clauseEnds: number[] = [];
  const strongEnds: number[] = [];
  for (const b of boundaries) {
    for (const span of findAll(b.re, text)) {
      clauseEnds.push(span.end);
      if (b.strong) strongEnds.push(span.end);
    }
  }
  clauseEnds.sort((a, b) => a - b);
  strongEnds.sort((a, b) => a - b);
  return {
    sentence: (pos) => countAtMost(cuts, pos),
    clause: (pos) => countAtMost(cuts, pos) + countAtMost(clauseEnds, pos),
    strong: (pos) => countAtMost(cuts, pos) + countAtMost(strongEnds, pos),
  };
}
