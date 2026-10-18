/**
 * Runs the detection patterns over the text and removes overlapping matches.
 */

import type { CompiledPattern } from './data';
import { findCores, type Span } from './regex';
import type { ScreenLevel } from './types';

/** One raw pattern match, before modifiers. */
export interface Match extends Span {
  pattern: CompiledPattern;
}

/** Numeric rank of a level, for comparisons. */
export const LEVEL_RANK: Record<ScreenLevel, number> = { none: 0, concern: 1, crisis: 2 };

/**
 * All matches of `patterns`, with overlaps removed. A pattern with a
 * capturing group contributes the group's span (its core), not the whole
 * match.
 *
 * When matches overlap, the one with the higher base level wins, then the
 * longer one, then the earlier one, then the one listed first in the data
 * file. Results are in text order.
 */
export function matchPatterns(text: string, patterns: readonly CompiledPattern[]): Match[] {
  const all: Match[] = [];
  for (const pattern of patterns) {
    for (const span of findCores(pattern.re, text)) all.push({ ...span, pattern });
  }
  return dedupe(all);
}

function dedupe(matches: Match[]): Match[] {
  const byPriority = [...matches].sort(
    (a, b) =>
      LEVEL_RANK[b.pattern.entry.level] - LEVEL_RANK[a.pattern.entry.level] ||
      b.end - b.start - (a.end - a.start) ||
      a.start - b.start ||
      a.pattern.order - b.pattern.order,
  );
  const kept: Match[] = [];
  // Accepted spans, kept sorted by start, are disjoint, so one neighbour check each side suffices.
  for (const m of byPriority) {
    let lo = 0;
    let hi = kept.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (kept[mid].start < m.start) lo = mid + 1;
      else hi = mid;
    }
    const prev = kept[lo - 1];
    const next = kept[lo];
    if ((prev && prev.end > m.start) || (next && next.start < m.end)) continue;
    kept.splice(lo, 0, m);
  }
  return kept;
}
