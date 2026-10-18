#!/usr/bin/env node
/**
 * SPEC §8 metrics for a vectors file, using the built package (dist/).
 *
 *   node scripts/metrics.mjs <vectors.jsonl>
 *
 * Prints crisis recall, any-flag recall, the grief false-alarm rate and the
 * idiom + everyday false-alarm rate, each with counts and a Wilson 95%
 * confidence interval, then the ids of vectors that fail. Vector text is
 * never printed.
 */
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const distEntry = fileURLToPath(new URL('../dist/index.mjs', import.meta.url));
const file = process.argv[2];
if (!file) {
  console.error('usage: node scripts/metrics.mjs <vectors.jsonl>');
  process.exit(2);
}
if (!existsSync(distEntry)) {
  console.error('dist/ not found: run `pnpm --filter @meddevkit/crisis-signals build` first');
  process.exit(2);
}
const { screenText, PATTERNS_VERSION } = await import(distEntry);

const vectors = readFileSync(file, 'utf8')
  .split('\n')
  .filter((line) => line.trim() !== '')
  .map((line, i) => {
    try {
      return JSON.parse(line);
    } catch {
      console.error(`line ${i + 1}: not valid JSON`);
      process.exit(2);
    }
  });

/** Wilson score interval for k successes out of n (95%). */
function wilson(k, n, z = 1.959964) {
  if (n === 0) return [NaN, NaN];
  const p = k / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const centre = (p + z2 / (2 * n)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denom;
  return [Math.max(0, centre - half), Math.min(1, centre + half)];
}

/** Reasons a vector fails its full expectation (level, categories, modifiers, immediacy). */
function failures(v, r) {
  const out = [];
  if (r.level !== v.expected_level) out.push(`level ${r.level} != ${v.expected_level}`);
  const flagged = new Set(r.findings.filter((f) => f.level !== 'none').map((f) => f.category));
  for (const c of v.expected_categories ?? []) if (!flagged.has(c)) out.push(`missing category ${c}`);
  for (const m of v.expected_modifiers ?? []) if (!r.findings.some((f) => f.modifiers[m])) out.push(`missing modifier ${m}`);
  if (v.expected_immediacy !== undefined && r.immediacy !== v.expected_immediacy) {
    out.push(`immediacy ${r.immediacy} != ${v.expected_immediacy}`);
  }
  return out;
}

const results = vectors.map((v) => ({ v, r: screenText(v.text) }));
const inGroups = (...groups) => results.filter(({ v }) => groups.includes(v.group));

const metrics = [
  {
    name: 'Crisis recall',
    definition: 'crisis_positive returning crisis',
    pool: inGroups('crisis_positive'),
    hit: ({ r }) => r.level === 'crisis',
    gate: '100% on dev; held-out reported with CI',
    higherIsBetter: true,
  },
  {
    name: 'Any-flag recall',
    definition: 'crisis_positive + concern_positive returning concern or crisis',
    pool: inGroups('crisis_positive', 'concern_positive'),
    hit: ({ r }) => r.level !== 'none',
    gate: '100% on dev and held-out',
    higherIsBetter: true,
  },
  {
    name: 'Grief false-alarm rate',
    definition: 'grief_negative returning crisis',
    pool: inGroups('grief_negative'),
    hit: ({ r }) => r.level === 'crisis',
    gate: '0% on dev; held-out reported',
    higherIsBetter: false,
  },
  {
    name: 'Idiom + everyday false-alarm rate',
    definition: 'idiom_negative + everyday_negative returning concern or crisis',
    pool: inGroups('idiom_negative', 'everyday_negative'),
    hit: ({ r }) => r.level !== 'none',
    gate: '<= 5% held-out',
    higherIsBetter: false,
  },
];

const pct = (x) => (Number.isNaN(x) ? '  n/a' : `${(100 * x).toFixed(1).padStart(5)}%`);

console.log(`@meddevkit/crisis-signals metrics  (patterns ${PATTERNS_VERSION}, ${vectors.length} vectors)`);
console.log(`file: ${file}\n`);
for (const m of metrics) {
  const n = m.pool.length;
  const hits = m.pool.filter(m.hit);
  const k = hits.length;
  const [lo, hi] = wilson(k, n);
  console.log(`${m.name}: ${k}/${n} = ${pct(n ? k / n : NaN)}  (95% CI ${pct(lo)} - ${pct(hi)})`);
  console.log(`  ${m.definition}; v1 gate: ${m.gate}`);
  const offenders = (m.higherIsBetter ? m.pool.filter((x) => !m.hit(x)) : hits).map(({ v }) => v.id);
  if (offenders.length > 0) console.log(`  ${m.higherIsBetter ? 'missed' : 'false alarms'}: ${offenders.join(', ')}`);
}

const failing = results.map(({ v, r }) => ({ id: v.id, why: failures(v, r) })).filter((x) => x.why.length > 0);
console.log(`\nFull expectation check: ${vectors.length - failing.length}/${vectors.length} vectors pass`);
for (const f of failing) console.log(`  FAIL ${f.id}: ${f.why.join('; ')}`);
