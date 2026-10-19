/**
 * Shared test vectors (SPEC §7): every line of data/vectors.jsonl must pass.
 *
 * Only the dev file is read here. The held-out file is scored by the
 * release process and must never be used while writing patterns.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { screenText } from '../src';
import type { CrisisCategory, ModifierName, ScreenLevel, ScreenResult } from '../src';

interface Vector {
  id: string;
  text: string;
  expected_level: ScreenLevel;
  expected_categories: CrisisCategory[];
  expected_modifiers?: ModifierName[];
  expected_immediacy?: boolean;
  group: string;
}

const path = fileURLToPath(new URL('../data/vectors.jsonl', import.meta.url));
const vectors: Vector[] = readFileSync(path, 'utf8')
  .split('\n')
  .filter((line) => line.trim() !== '')
  .map((line) => JSON.parse(line) as Vector);

/** Vectors whose label conflicts with the spec; kept failing on purpose (see the comment on each). */
const KNOWN_CONFLICTS: ReadonlySet<string> = new Set<string>([
  // "i'm going to strangle my brother if he eats my leftovers again lol": the level (none) passes, but the
  // label also expects an idiom-marked finding. The only finding there could be is harm to another
  // person, which v1 does not detect (SPEC §1 non-goals, D5), so there is nothing to mark as an idiom.
  'idiom-strangle-brother-leftovers',
]);

function check(v: Vector, r: ScreenResult): void {
  expect(r.level, 'expected_level').toBe(v.expected_level);
  const flagged = new Set(r.findings.filter((f) => f.level !== 'none').map((f) => f.category));
  for (const c of v.expected_categories) {
    expect(flagged.has(c), `expected category ${c} among non-none findings`).toBe(true);
  }
  for (const m of v.expected_modifiers ?? []) {
    expect(
      r.findings.some((f) => f.modifiers[m]),
      `expected modifier ${m} on at least one finding`,
    ).toBe(true);
  }
  if (v.expected_immediacy !== undefined) {
    expect(r.immediacy, 'expected_immediacy').toBe(v.expected_immediacy);
  }
}

describe('dev vectors (data/vectors.jsonl)', () => {
  it('has the expected number of vectors with unique ids', () => {
    expect(vectors.length).toBeGreaterThanOrEqual(534);
    expect(new Set(vectors.map((v) => v.id)).size).toBe(vectors.length);
  });

  for (const v of vectors) {
    const run = KNOWN_CONFLICTS.has(v.id) ? it.fails : it;
    run(`${v.group}: ${v.id}`, () => check(v, screenText(v.text)));
  }
});
