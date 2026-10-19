/**
 * Context-gated patterns (README, "Context-gated patterns").
 *
 * A gated pattern matches vague or anaphoric wording ("I'm going to finish
 * it", "for when they find me") that is crisis language only in context. A
 * gated match yields a finding only when, within its context scope (the same
 * sentence, or the same, previous or next sentence), there is at least one
 * piece of context that does not overlap the match:
 *
 * - a finding of an ungated detection pattern whose category the context
 *   names, or of an ungated detection or immediacy pattern whose id it names,
 *   that is neither negated nor suppressed as an idiom; or
 * - a match of the context's own regex.
 *
 * Context comes only from ungated patterns, so gates never depend on each
 * other and the result does not depend on evaluation order. Work is linear in
 * the number of findings: qualifying context is counted per sentence once per
 * gated pattern.
 */

import type { CompiledPattern } from './data';
import type { Match } from './match';
import { findAll, lowerBound, type Span } from './regex';
import type { CueIndex } from './scope';
import type { TextIndex } from './text';

/** Context available to the gates of one text. */
export interface GateInput {
  text: string;
  index: TextIndex;
  cues: CueIndex;
  suppressIdioms: boolean;
  /** Ungated detection findings, deduplicated, in text order. */
  detection: readonly Match[];
  /** Immediacy findings, deduplicated, in text order. */
  immediacy: readonly Match[];
}

/** Qualifying context spans for one gated pattern, sorted by start, with per-sentence counts. */
interface ContextSpans {
  spans: Span[];
  /** Length of the longest span (bounds the overlap search). */
  maxLen: number;
  bySentence: Map<number, number>;
}

/**
 * The gated matches whose context is present. `gatedRaw` holds every match of
 * the gated patterns (overlaps included).
 */
export function passingGates(input: GateInput, gatedRaw: readonly Match[]): Match[] {
  if (gatedRaw.length === 0) return [];
  const { index } = input;
  const qualifies = qualifier(input);
  const perPattern = new Map<CompiledPattern, ContextSpans>();
  const out: Match[] = [];
  for (const m of gatedRaw) {
    const pattern = m.pattern;
    let ctx = perPattern.get(pattern);
    if (ctx === undefined) {
      ctx = contextSpans(input, pattern, qualifies);
      perPattern.set(pattern, ctx);
    }
    const first = index.sentence(m.start);
    const last = index.sentence(Math.max(m.start, m.end - 1));
    const adjacent = pattern.context?.scope === 'adjacent';
    const lo = adjacent ? first - 1 : first;
    const hi = adjacent ? last + 1 : last;
    let count = 0;
    for (let s = lo; s <= hi; s++) count += ctx.bySentence.get(s) ?? 0;
    // Context that overlaps the match itself does not count.
    for (let i = lowerBound(ctx.spans, m.start - ctx.maxLen, (sp) => sp.start); i < ctx.spans.length; i++) {
      const sp = ctx.spans[i];
      if (sp.start >= m.end) break;
      if (sp.end > m.start) {
        const s = index.sentence(sp.start);
        if (s >= lo && s <= hi) count--;
      }
    }
    if (count > 0) out.push(m);
  }
  return out;
}

/** Memoised "is this finding usable as context?" (not negated, not a suppressed idiom). */
function qualifier(input: GateInput): (m: Match) => boolean {
  const memo = new Map<Match, boolean>();
  return (m) => {
    let ok = memo.get(m);
    if (ok === undefined) {
      const mods = input.cues.evaluate(m, m.pattern.entry.category);
      ok = !mods.negated && !(mods.idiom && input.suppressIdioms);
      memo.set(m, ok);
    }
    return ok;
  };
}

function contextSpans(input: GateInput, pattern: CompiledPattern, qualifies: (m: Match) => boolean): ContextSpans {
  const ctx = pattern.context;
  const spans: Span[] = [];
  if (ctx !== undefined) {
    for (const f of input.detection) {
      if ((ctx.categories.has(f.pattern.entry.category) || ctx.rules.has(f.pattern.entry.id)) && qualifies(f)) spans.push(f);
    }
    for (const f of input.immediacy) {
      if (ctx.rules.has(f.pattern.entry.id) && qualifies(f)) spans.push(f);
    }
    if (ctx.re !== undefined) spans.push(...findAll(ctx.re, input.text));
  }
  spans.sort((a, b) => a.start - b.start);
  const bySentence = new Map<number, number>();
  let maxLen = 0;
  for (const sp of spans) {
    const s = input.index.sentence(sp.start);
    bySentence.set(s, (bySentence.get(s) ?? 0) + 1);
    maxLen = Math.max(maxLen, sp.end - sp.start);
  }
  return { spans, maxLen, bySentence };
}
