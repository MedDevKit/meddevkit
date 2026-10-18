/**
 * Modifier scoping: finds every cue in the text once, indexes the hits, and
 * answers "which modifiers apply to this finding?" in roughly constant time
 * per finding, so long inputs stay linear.
 *
 * Scope rules (see `CueScope` in types.ts):
 * - `forward` cues act on a finding that starts within `maxGap` characters
 *   after the cue, in the same clause. A forward cue that lies inside another
 *   detection finding belongs to that finding and is not used elsewhere
 *   ("I don't trust myself to be alone tonight": "don't" does not negate
 *   "tonight"). A `between` block cue after the cue and before the finding's
 *   end cancels that cue.
 * - `sentence` cues act within the same strong segment of the sentence.
 * - `sentence-or-next` cues act on findings in the same or previous sentence.
 * - `within` cues contain the finding; `overlap` cues overlap it.
 * - `clause` / `sentence` block cues cancel the modifier for findings in the
 *   same clause / strong segment; `sentence-or-next` block cues cancel it for
 *   findings in the same or the previous sentence.
 * - A cue with `categories` acts only on findings of those categories.
 */

import type { CompiledCue } from './data';
import { findAll, lowerBound, type Span } from './regex';
import type { TextIndex } from './text';
import type { CrisisCategory, ModifierCueName } from './types';

interface Hit extends Span {
  cue: CompiledCue;
  consumed: boolean;
}

/** Modifiers that apply to one finding. */
export interface ModifierState {
  negated: boolean;
  past: boolean;
  resolved: boolean;
  hypothetical: boolean;
  quoted: boolean;
  idiom: boolean;
  thirdParty: boolean;
  /** A cue that applied implies the subject is unknown (generic "someone"). */
  subjectUnknown: boolean;
}

const MODIFIERS: readonly ModifierCueName[] = [
  'negated',
  'past',
  'resolved',
  'hypothetical',
  'quoted',
  'idiom',
  'third_party',
];

interface PerModifier {
  /** forward set hits, sorted by end */
  forward: Hit[];
  forwardMaxGap: number;
  /** between block hits, sorted by start */
  between: Hit[];
  /** strong segment ids with a sentence-scoped set cue */
  sentence: Set<number>;
  /** sentence indices with a sentence-or-next set cue */
  sentenceOrNext: Set<number>;
  /** within / overlap set hits, sorted by start */
  within: Hit[];
  overlap: Hit[];
  maxContainLen: number;
  /** clause ids / strong ids / sentence indices with a block cue */
  blockClause: Set<number>;
  blockSentence: Set<number>;
  blockSentenceOrNext: Set<number>;
}

function emptyPerModifier(): PerModifier {
  return {
    forward: [],
    forwardMaxGap: 0,
    between: [],
    sentence: new Set(),
    sentenceOrNext: new Set(),
    within: [],
    overlap: [],
    maxContainLen: 0,
    blockClause: new Set(),
    blockSentence: new Set(),
    blockSentenceOrNext: new Set(),
  };
}

function addRange(set: Set<number>, from: number, to: number): void {
  for (let id = from; id <= to; id++) set.add(id);
}

function hasInRange(set: Set<number>, from: number, to: number): boolean {
  if (set.size === 0) return false;
  for (let id = from; id <= to; id++) if (set.has(id)) return true;
  return false;
}

/** Bucket key: the modifier alone, or the modifier restricted to one category. */
function bucketKey(m: ModifierCueName, category?: CrisisCategory): string {
  return category === undefined ? m : `${m}|${category}`;
}

/** Index of cue hits for one text. */
export class CueIndex {
  private readonly by = new Map<string, PerModifier>();

  /**
   * @param text - The input text
   * @param cues - Compiled cues from the data file
   * @param index - Sentence and clause index of the text
   * @param detection - Detection finding spans, in text order and disjoint
   */
  constructor(
    text: string,
    cues: readonly CompiledCue[],
    private readonly index: TextIndex,
    detection: readonly Span[],
  ) {
    for (const m of MODIFIERS) this.by.set(m, emptyPerModifier());
    for (const cue of cues) {
      const buckets =
        cue.categories === undefined
          ? [this.bucket(cue.modifier)]
          : [...cue.categories].map((c) => this.bucket(cue.modifier, c));
      const spans = findAll(cue.re, text);
      for (const pm of buckets) this.add(pm, cue, spans, detection);
    }
    for (const pm of this.by.values()) {
      pm.forward.sort((a, b) => a.end - b.end);
      pm.between.sort((a, b) => a.start - b.start);
      pm.within.sort((a, b) => a.start - b.start);
      pm.overlap.sort((a, b) => a.start - b.start);
    }
  }

  private bucket(m: ModifierCueName, category?: CrisisCategory): PerModifier {
    const key = bucketKey(m, category);
    let pm = this.by.get(key);
    if (pm === undefined) {
      pm = emptyPerModifier();
      this.by.set(key, pm);
    }
    return pm;
  }

  private add(pm: PerModifier, cue: CompiledCue, spans: readonly Span[], detection: readonly Span[]): void {
    const index = this.index;
    for (const span of spans) {
      const hit: Hit = { ...span, cue, consumed: false };
      if (cue.effect === 'block') {
        if (cue.scope === 'between') pm.between.push(hit);
        else if (cue.scope === 'clause') addRange(pm.blockClause, index.clause(hit.start), index.clause(hit.end));
        else if (cue.scope === 'sentence-or-next') pm.blockSentenceOrNext.add(index.sentence(hit.start));
        else addRange(pm.blockSentence, index.strong(hit.start), index.strong(hit.end));
        continue;
      }
      switch (cue.scope) {
        case 'forward':
          hit.consumed = overlapsAny(hit, detection);
          pm.forward.push(hit);
          pm.forwardMaxGap = Math.max(pm.forwardMaxGap, cue.maxGap);
          break;
        case 'sentence':
          addRange(pm.sentence, index.strong(hit.start), index.strong(hit.end));
          break;
        case 'sentence-or-next':
          pm.sentenceOrNext.add(index.sentence(hit.start));
          break;
        case 'within':
        case 'overlap':
          (cue.scope === 'within' ? pm.within : pm.overlap).push(hit);
          pm.maxContainLen = Math.max(pm.maxContainLen, hit.end - hit.start);
          break;
      }
    }
  }

  /** Which modifiers apply to the finding `f` of category `category`. */
  evaluate(f: Span, category?: CrisisCategory): ModifierState {
    const generic = { value: false };
    const hypothetical = this.applies('hypothetical', f, category, generic);
    return {
      negated: this.applies('negated', f, category),
      past: this.applies('past', f, category),
      resolved: this.applies('resolved', f, category),
      hypothetical,
      quoted: this.applies('quoted', f, category),
      idiom: this.applies('idiom', f, category),
      thirdParty: this.applies('third_party', f, category),
      subjectUnknown: hypothetical && generic.value,
    };
  }

  /**
   * Whether modifier `m` applies to `f`: a block cue in any bucket cancels it;
   * otherwise a set cue in any bucket applies it. Sets `unknown.value` when an
   * applied forward cue implies subject "unknown".
   */
  private applies(m: ModifierCueName, f: Span, category: CrisisCategory | undefined, unknown?: { value: boolean }): boolean {
    const buckets = [this.by.get(m) as PerModifier];
    const restricted = category === undefined ? undefined : this.by.get(bucketKey(m, category));
    if (restricted !== undefined) buckets.push(restricted);
    if (buckets.some((pm) => this.blocked(pm, f))) return false;
    let applied = false;
    for (const pm of buckets) if (this.setBy(pm, f, unknown)) applied = true;
    return applied;
  }

  private blocked(pm: PerModifier, f: Span): boolean {
    const ix = this.index;
    if (hasInRange(pm.blockClause, ix.clause(f.start), ix.clause(f.end))) return true;
    if (hasInRange(pm.blockSentence, ix.strong(f.start), ix.strong(f.end))) return true;
    if (pm.blockSentenceOrNext.size > 0) {
      const first = ix.sentence(f.start);
      const last = ix.sentence(Math.max(f.start, f.end - 1));
      if (hasInRange(pm.blockSentenceOrNext, first, last + 1)) return true;
    }
    return false;
  }

  private setBy(pm: PerModifier, f: Span, unknown?: { value: boolean }): boolean {
    const ix = this.index;
    let applied = false;
    if (hasInRange(pm.sentence, ix.strong(f.start), ix.strong(f.end))) applied = true;
    if (!applied && pm.sentenceOrNext.size > 0) {
      const first = ix.sentence(f.start);
      const last = ix.sentence(Math.max(f.start, f.end - 1));
      applied = hasInRange(pm.sentenceOrNext, first, last + 1);
    }
    if (!applied && pm.within.length > 0) {
      applied = this.contains(pm.within, pm.maxContainLen, f, (h) => h.start <= f.start && h.end >= f.end);
    }
    if (!applied && pm.overlap.length > 0) {
      applied = this.contains(pm.overlap, pm.maxContainLen, f, (h) => h.start < f.end && h.end > f.start);
    }
    // Forward cues last: they are the only ones that can carry a subject.
    if (pm.forward.length > 0) {
      const from = lowerBound(pm.forward, f.start - pm.forwardMaxGap, (h) => h.end);
      for (let i = from; i < pm.forward.length && pm.forward[i].end <= f.start; i++) {
        const h = pm.forward[i];
        if (h.consumed || f.start - h.end > h.cue.maxGap) continue;
        if (ix.clause(h.end) !== ix.clause(f.start)) continue;
        if (this.blockedBetween(pm.between, h.end, f.end)) continue;
        if (unknown && h.cue.entry.subject === 'unknown') unknown.value = true;
        applied = true;
      }
    }
    return applied;
  }

  private contains(hits: readonly Hit[], maxLen: number, f: Span, test: (h: Hit) => boolean): boolean {
    const from = lowerBound(hits, f.start - maxLen, (h) => h.start);
    for (let i = from; i < hits.length && hits[i].start < f.end; i++) {
      if (test(hits[i])) return true;
    }
    return false;
  }

  /** A block cue starting at or after `from` and ending at or before `to`. */
  private blockedBetween(blocks: readonly Hit[], from: number, to: number): boolean {
    for (let i = lowerBound(blocks, from, (h) => h.start); i < blocks.length && blocks[i].start < to; i++) {
      if (blocks[i].end <= to) return true;
    }
    return false;
  }
}

/** Whether `span` overlaps any of the disjoint, start-sorted `spans`. */
function overlapsAny(span: Span, spans: readonly Span[]): boolean {
  const i = lowerBound(spans, span.end, (s) => s.start);
  // Candidates start before span.end; the nearest one is the only one that can reach back.
  const prev = spans[i - 1];
  return prev !== undefined && prev.end > span.start;
}
