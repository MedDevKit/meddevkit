/**
 * Lint for the portable regex subset (SPEC §6): syntax that compiles and
 * behaves the same in ECMAScript (`u` flag) and Python `re`.
 *
 * Forbidden: named groups and named back-references, `\p{...}`, inline flags,
 * atomic and possessive groups, `\Z` / `\z` / `\A`, variable-width
 * lookbehind, and (stricter than §6) `$`, because Python's `$` also matches
 * before a final newline. Use `(?![\s\S])` for "end of text".
 */

export interface LintIssue {
  kind: string;
  at: number;
}

type Node =
  | { t: 'atom'; width: number }
  | { t: 'zero' }
  | { t: 'group'; kind: string; alts: Node[][]; at: number }
  | { t: 'quant'; node: Node; min: number; max: number };

const ZERO_WIDTH_ESCAPES = new Set(['b', 'B']);
const FORBIDDEN_ESCAPES: Record<string, string> = {
  p: 'unicode property escape',
  P: 'unicode property escape',
  Z: '\\Z anchor',
  z: '\\z anchor',
  A: '\\A anchor',
  k: 'named back-reference',
};

/** Parse `source` into a small AST, collecting issues along the way. */
function parse(source: string, issues: LintIssue[]): Node[][] {
  let i = 0;

  function parseAlternatives(): Node[][] {
    const alts: Node[][] = [[]];
    while (i < source.length) {
      const ch = source[i];
      if (ch === ')') return alts;
      if (ch === '|') {
        alts.push([]);
        i++;
        continue;
      }
      const node = parseAtom();
      if (node) alts[alts.length - 1].push(parseQuantifier(node));
    }
    return alts;
  }

  function parseQuantifier(node: Node): Node {
    const ch = source[i];
    let min = -1;
    let max = -1;
    if (ch === '*') [min, max] = [0, Infinity];
    else if (ch === '+') [min, max] = [1, Infinity];
    else if (ch === '?') [min, max] = [0, 1];
    else if (ch === '{') {
      const m = /^\{(\d+)(,(\d*))?\}/.exec(source.slice(i));
      if (!m) return node; // literal brace
      min = Number(m[1]);
      max = m[2] === undefined ? min : m[3] === '' ? Infinity : Number(m[3]);
      i += m[0].length - 1;
    } else return node;
    i++;
    if (source[i] === '+') issues.push({ kind: 'possessive quantifier', at: i });
    if (source[i] === '?') i++; // lazy is portable
    return { t: 'quant', node, min, max };
  }

  function parseAtom(): Node | null {
    const ch = source[i];
    if (ch === '\\') {
      const e = source[i + 1];
      if (e in FORBIDDEN_ESCAPES) issues.push({ kind: FORBIDDEN_ESCAPES[e], at: i });
      i += 2;
      return ZERO_WIDTH_ESCAPES.has(e) ? { t: 'zero' } : { t: 'atom', width: 1 };
    }
    if (ch === '[') {
      i++;
      if (source[i] === '^') i++;
      if (source[i] === ']') i++;
      while (i < source.length && source[i] !== ']') {
        if (source[i] === '\\') {
          const e = source[i + 1];
          if (e === 'p' || e === 'P') issues.push({ kind: 'unicode property escape', at: i });
          i += 2;
        } else i++;
      }
      i++;
      return { t: 'atom', width: 1 };
    }
    if (ch === '(') {
      const at = i;
      let kind = 'capture';
      if (source.startsWith('(?:', i)) kind = 'nc';
      else if (source.startsWith('(?=', i)) kind = 'la';
      else if (source.startsWith('(?!', i)) kind = 'nla';
      else if (source.startsWith('(?<=', i)) kind = 'lb';
      else if (source.startsWith('(?<!', i)) kind = 'nlb';
      else if (source.startsWith('(?<', i) || source.startsWith('(?P', i)) {
        issues.push({ kind: 'named group', at });
        kind = 'bad';
      } else if (source.startsWith('(?>', i)) {
        issues.push({ kind: 'atomic group', at });
        kind = 'bad';
      } else if (source.startsWith('(?', i)) {
        issues.push({ kind: 'inline flag or unknown group', at });
        kind = 'bad';
      }
      i += kind === 'capture' ? 1 : kind === 'nc' || kind === 'la' || kind === 'nla' ? 3 : kind === 'lb' || kind === 'nlb' ? 4 : 2;
      if (kind === 'bad') {
        // Skip to the end of the group header (name or flags) best-effort.
        while (i < source.length && /[A-Za-z<>=!:-]/.test(source[i]) && source[i] !== ')') i++;
      }
      const alts = parseAlternatives();
      i++; // ')'
      return { t: 'group', kind, alts, at };
    }
    if (ch === '$') issues.push({ kind: '$ anchor (Python also matches before a final newline)', at: i });
    i++;
    if (ch === '^' || ch === '$') return { t: 'zero' };
    return { t: 'atom', width: 1 };
  }

  const alts = parseAlternatives();
  if (i < source.length) issues.push({ kind: 'unbalanced parenthesis', at: i });
  return alts;
}

/** [min, max] width of a sequence; lookarounds are zero-width. */
function widthOf(seq: Node[]): [number, number] {
  let min = 0;
  let max = 0;
  for (const n of seq) {
    const [a, b] = nodeWidth(n);
    min += a;
    max += b;
  }
  return [min, max];
}

function nodeWidth(n: Node): [number, number] {
  switch (n.t) {
    case 'atom':
      return [n.width, n.width];
    case 'zero':
      return [0, 0];
    case 'quant': {
      const [a, b] = nodeWidth(n.node);
      return [a * n.min, n.max === Infinity ? (b === 0 ? 0 : Infinity) : b * n.max];
    }
    case 'group': {
      if (n.kind === 'la' || n.kind === 'nla' || n.kind === 'lb' || n.kind === 'nlb') return [0, 0];
      let min = Infinity;
      let max = 0;
      for (const alt of n.alts) {
        const [a, b] = widthOf(alt);
        min = Math.min(min, a);
        max = Math.max(max, b);
      }
      return [min === Infinity ? 0 : min, max];
    }
  }
}

function checkLookbehinds(seq: Node[], issues: LintIssue[]): void {
  for (const n of seq) {
    if (n.t === 'quant') checkLookbehinds([n.node], issues);
    if (n.t !== 'group') continue;
    if (n.kind === 'lb' || n.kind === 'nlb') {
      const widths = n.alts.map(widthOf);
      const fixed = widths.every(([a, b]) => a === b) && widths.every(([a]) => a === widths[0][0]);
      if (!fixed) issues.push({ kind: 'variable-width lookbehind', at: n.at });
    }
    for (const alt of n.alts) checkLookbehinds(alt, issues);
  }
}

/** Issues that make `source` non-portable; empty when it is fine. */
export function lintPortable(source: string): LintIssue[] {
  const issues: LintIssue[] = [];
  const alts = parse(source, issues);
  for (const alt of alts) checkLookbehinds(alt, issues);
  return issues;
}
