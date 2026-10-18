/**
 * Regex helpers. Every pattern in the data file is compiled with the `u`
 * flag (plus `g` for scanning) and must stay inside the portable subset of
 * SPEC §6, so the Python consumer gets the same matches.
 */

/** A half-open character range `[start, end)` in UTF-16 code units. */
export interface Span {
  start: number;
  end: number;
}

/**
 * Compile one pattern from the data file.
 *
 * Error messages name the rule id only, never input text or the pattern body.
 *
 * @param id - Rule, cue or boundary id (for error messages)
 * @param source - Regex source, with fragments already expanded
 * @param flags - Flags from the data file: `i` or empty
 * @param indices - Also record group offsets (`d`), for patterns whose first group is the span
 */
export function compilePattern(id: string, source: string, flags: string | undefined, indices = false): RegExp {
  const f = flags ?? '';
  if (f !== '' && f !== 'i') {
    throw new Error(`crisis-screen: ${id} uses unsupported flags; only "i" is allowed`);
  }
  try {
    return new RegExp(source, `${f}gu${indices ? 'd' : ''}`);
  } catch {
    throw new Error(`crisis-screen: ${id} does not compile`);
  }
}

/**
 * All non-overlapping matches of a global regex, left to right.
 * Zero-length matches are skipped (and the scan advances past them).
 */
export function findAll(re: RegExp, text: string): Span[] {
  const out: Span[] = [];
  re.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const start = m.index;
    const end = start + m[0].length;
    if (end === start) {
      // Advance by one code point so `u`-mode scanning cannot loop.
      const cp = text.codePointAt(start);
      re.lastIndex = start + (cp !== undefined && cp > 0xffff ? 2 : 1);
      continue;
    }
    out.push({ start, end });
  }
  return out;
}

/**
 * Like {@link findAll}, but when a capturing group took part in the match,
 * the span is the first such group (the pattern's core) rather than the whole
 * match. The regex must have been compiled with `indices`. A match whose core
 * is empty is a veto: it consumes the text and yields no span.
 */
export function findCores(re: RegExp, text: string): Span[] {
  const out: Span[] = [];
  re.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const start = m.index;
    const end = start + m[0].length;
    if (end === start) {
      const cp = text.codePointAt(start);
      re.lastIndex = start + (cp !== undefined && cp > 0xffff ? 2 : 1);
      continue;
    }
    const core = firstGroup(m);
    if (core === undefined) out.push({ start, end });
    else if (core[1] > core[0]) out.push({ start: core[0], end: core[1] });
  }
  return out;
}

/** Offsets of the first capturing group that took part in the match, if any. */
function firstGroup(m: RegExpExecArray): [number, number] | undefined {
  const indices = m.indices;
  if (indices === undefined) return undefined;
  for (let i = 1; i < indices.length; i++) {
    const g = indices[i];
    if (g !== undefined) return g;
  }
  return undefined;
}

/** Index of the first element whose `key` is >= `value` (array sorted by key). */
export function lowerBound<T>(arr: readonly T[], value: number, key: (t: T) => number): number {
  let lo = 0;
  let hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (key(arr[mid]) < value) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** Number of sorted numbers <= value. */
export function countAtMost(sorted: readonly number[], value: number): number {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (sorted[mid] <= value) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}
