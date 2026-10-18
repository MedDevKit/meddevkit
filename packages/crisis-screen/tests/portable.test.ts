/**
 * Portable regex subset (SPEC §6): every fragment, pattern, cue and boundary
 * in the data file compiles with the `u` flag once its `{{fragment}}`
 * references are expanded, uses only `i` (or no) flags, and avoids syntax
 * that differs between ECMAScript and Python `re`.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { PatternFile } from '../src';
import { expandFragments, resolveFragments } from '../src/data';
import { lintPortable } from './helpers/portable-lint';

const file = JSON.parse(
  readFileSync(fileURLToPath(new URL('../data/crisis.patterns.json', import.meta.url)), 'utf8'),
) as PatternFile;

const fragments = resolveFragments(file.fragments);
type Entry = { id: string; pattern: string; flags?: string; kind: 'fragment' | 'pattern' | 'cue' | 'boundary' };
const entries: Entry[] = [
  ...(file.fragments ?? []).map((e): Entry => ({ id: e.id, pattern: fragments.get(e.id) as string, flags: 'i', kind: 'fragment' })),
  ...file.patterns.map((e): Entry => ({ ...e, pattern: expandFragments(e.id, e.pattern, fragments), kind: 'pattern' })),
  ...file.modifiers.map((e): Entry => ({ ...e, pattern: expandFragments(e.id, e.pattern, fragments), kind: 'cue' })),
  ...(file.boundaries ?? []).map((e): Entry => ({ ...e, pattern: expandFragments(e.id, e.pattern, fragments), kind: 'boundary' })),
];

/** Number of capturing groups in a regex source. */
function groups(source: string): number {
  return (new RegExp(`${source}|`, 'u').exec('') as RegExpExecArray).length - 1;
}

describe('portable regex subset', () => {
  it('every entry compiles with the u flag after fragment expansion', () => {
    for (const e of entries) {
      expect(() => new RegExp(e.pattern, `${e.flags ?? ''}u`), e.id).not.toThrow();
    }
  });

  it('flags are only "i" or empty', () => {
    for (const e of [...file.patterns, ...file.modifiers, ...(file.boundaries ?? [])]) {
      expect(['', 'i'], e.id).toContain(e.flags ?? '');
    }
  });

  it('no entry uses non-portable syntax (raw and expanded)', () => {
    const raw = [...(file.fragments ?? []), ...file.patterns, ...file.modifiers, ...(file.boundaries ?? [])];
    const problems = [
      ...entries.map((e) => ({ id: e.id, issues: lintPortable(e.pattern) })),
      ...raw.map((e) => ({ id: `${e.id} (raw)`, issues: lintPortable(e.pattern) })),
    ].filter((p) => p.issues.length > 0);
    expect(problems).toEqual([]);
  });

  it('no pattern or cue can match the empty string', () => {
    for (const e of entries) {
      if (e.kind === 'boundary' || e.kind === 'fragment') continue;
      expect(new RegExp(e.pattern, `${e.flags ?? ''}u`).test(''), e.id).toBe(false);
    }
  });

  it('only detection patterns use capturing groups (the finding span); fragments and cues do not', () => {
    for (const e of entries) {
      if (e.kind === 'pattern') continue;
      expect(groups(e.pattern), e.id).toBe(0);
    }
  });
});

describe('lintPortable catches what §6 forbids', () => {
  const bad: [string, string][] = [
    ['(?<name>x)', 'named group'],
    ['(?P<name>x)', 'named group'],
    ['\\k<name>', 'named back-reference'],
    ['\\p{L}', 'unicode property escape'],
    ['[\\p{L}]', 'unicode property escape'],
    ['(?i)abc', 'inline flag or unknown group'],
    ['(?i:abc)', 'inline flag or unknown group'],
    ['(?>abc)', 'atomic group'],
    ['a++', 'possessive quantifier'],
    ['a{2,3}+', 'possessive quantifier'],
    ['abc\\Z', '\\Z anchor'],
    ['abc\\z', '\\z anchor'],
    ['(?<=a+)b', 'variable-width lookbehind'],
    ['(?<=a|bc)d', 'variable-width lookbehind'],
    ['(?<!x?)y', 'variable-width lookbehind'],
    ['(?<=a{1,2})b', 'variable-width lookbehind'],
    ['end$', '$ anchor (Python also matches before a final newline)'],
  ];
  for (const [source, kind] of bad) {
    it(`flags ${source}`, () => {
      expect(lintPortable(source).map((x) => x.kind)).toContain(kind);
    });
  }

  const good = [
    '\\bwish(?:ed)?\\s+i\\b',
    '(?<=\\bi am )suicidal',
    '(?:(?<=\\bim )|(?<=\\bi am ))x',
    '(?<!\\d\\s)kms',
    '(?<=[a-z]{3})x',
    'a+?b*?',
    '(?![\\s\\S])',
    '[$]',
    '\\$5',
  ];
  for (const source of good) {
    it(`accepts ${source}`, () => {
      expect(lintPortable(source)).toEqual([]);
    });
  }
});
