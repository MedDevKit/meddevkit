#!/usr/bin/env node
/**
 * SPEC §8 metrics for a vectors file: the offline screen alone versus the
 * screen combined with a nope-edge second opinion
 * (`screenTextWithSecondOpinion` + `NopeEdgeAdapter`).
 *
 *   node scripts/eval.mjs <vectors.jsonl> --base-url <url> --model <name>
 *       [--api-key <key>] [--timeout-ms <ms>]
 *
 *   e.g. node scripts/eval.mjs ../crisis-signals/data/vectors.jsonl \
 *          --base-url http://localhost:11434/v1 --model nope-edge
 *
 * Uses the built packages: run `pnpm build` first. Every vector's text is
 * sent to the server at --base-url, one at a time.
 *
 * Prints crisis recall, any-flag recall, the grief false-alarm rate and the
 * idiom + everyday false-alarm rate for both, each with counts and a Wilson
 * 95% confidence interval, plus how the second opinion fared (ok, error,
 * timeout, invalid) and the ids of vectors the combination changed. Vector
 * text and model output are never printed.
 *
 * Tune mappings on the dev set (data/vectors.jsonl) only. The held-out sets
 * are scored at release (SPEC §8, research README §3.2 rule 9).
 */
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

/** Wilson score interval for k successes out of n (95%). */
export function wilson(k, n, z = 1.959964) {
  if (n === 0) return [NaN, NaN];
  const p = k / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const centre = (p + z2 / (2 * n)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denom;
  return [Math.max(0, centre - half), Math.min(1, centre + half)];
}

/** Parse JSONL text into vectors; throws with the line number (never the line). */
export function parseVectors(text) {
  return text
    .split('\n')
    .map((line, i) => ({ line, i }))
    .filter(({ line }) => line.trim() !== '')
    .map(({ line, i }) => {
      try {
        return JSON.parse(line);
      } catch {
        throw new Error(`line ${i + 1}: not valid JSON`);
      }
    });
}

/**
 * Run every vector through `screenTextWithSecondOpinion` (one at a time).
 * Returns one row per vector with levels and outcome only, no text.
 */
export async function evaluate(vectors, { screenTextWithSecondOpinion, adapter, timeoutMs, onProgress }) {
  const rows = [];
  for (const v of vectors) {
    const r = await screenTextWithSecondOpinion(v.text, adapter, { timeoutMs });
    rows.push({
      id: v.id,
      group: v.group,
      local: r.local.level,
      combined: r.level,
      status: r.secondOpinion.status,
      opinion: r.secondOpinion.result?.level,
      raisedBy: r.raisedBy,
      degraded: r.degraded,
    });
    onProgress?.(rows.length, vectors.length);
  }
  return rows;
}

const METRICS = [
  {
    name: 'Crisis recall',
    definition: 'crisis_positive returning crisis',
    groups: ['crisis_positive'],
    hit: (level) => level === 'crisis',
    higherIsBetter: true,
  },
  {
    name: 'Any-flag recall',
    definition: 'crisis_positive + concern_positive returning concern or crisis',
    groups: ['crisis_positive', 'concern_positive'],
    hit: (level) => level !== 'none',
    higherIsBetter: true,
  },
  {
    name: 'Grief false-alarm rate',
    definition: 'grief_negative returning crisis',
    groups: ['grief_negative'],
    hit: (level) => level === 'crisis',
    higherIsBetter: false,
  },
  {
    name: 'Idiom + everyday false-alarm rate',
    definition: 'idiom_negative + everyday_negative returning concern or crisis',
    groups: ['idiom_negative', 'everyday_negative'],
    hit: (level) => level !== 'none',
    higherIsBetter: false,
  },
];

/** Local-only and combined counts, rates and Wilson CIs for each SPEC §8 metric. */
export function metrics(rows) {
  return METRICS.map((m) => {
    const pool = rows.filter((r) => m.groups.includes(r.group));
    const score = (key) => {
      const hits = pool.filter((r) => m.hit(r[key]));
      const k = hits.length;
      const n = pool.length;
      const [lo, hi] = wilson(k, n);
      const offenders = (m.higherIsBetter ? pool.filter((r) => !m.hit(r[key])) : hits).map((r) => r.id);
      return { k, n, rate: n ? k / n : NaN, lo, hi, offenders };
    };
    return { name: m.name, definition: m.definition, higherIsBetter: m.higherIsBetter, local: score('local'), combined: score('combined') };
  });
}

const pct = (x) => (Number.isNaN(x) ? '  n/a' : `${(100 * x).toFixed(1).padStart(5)}%`);
const fmt = (s) => `${s.k}/${s.n} = ${pct(s.rate)}  (95% CI ${pct(s.lo)} - ${pct(s.hi)})`;

/** Human-readable report. Contains ids, groups, levels and counts only. */
export function formatReport(rows, { file, model, adapterVersion, patternsVersion } = {}) {
  const lines = [];
  lines.push(
    `@meddevkit/crisis-adapter-nope eval  (adapter ${adapterVersion ?? '?'}, patterns ${patternsVersion ?? '?'}, model ${model ?? '?'}, ${rows.length} vectors)`
  );
  if (file) lines.push(`file: ${file}`);
  lines.push('');
  for (const m of metrics(rows)) {
    lines.push(`${m.name}  (${m.definition})`);
    lines.push(`  local only: ${fmt(m.local)}`);
    lines.push(`  combined:   ${fmt(m.combined)}`);
    const label = m.higherIsBetter ? 'still missed' : 'false alarms';
    if (m.combined.offenders.length > 0) lines.push(`  combined ${label}: ${m.combined.offenders.join(', ')}`);
  }

  const statuses = {};
  for (const r of rows) statuses[r.status] = (statuses[r.status] ?? 0) + 1;
  const degraded = rows.filter((r) => r.degraded).length;
  lines.push('');
  lines.push(
    `Second opinion: ${Object.entries(statuses)
      .map(([s, n]) => `${s} ${n}`)
      .join(', ')}; degraded ${degraded}/${rows.length}`
  );
  const raised = rows.filter((r) => r.combined !== r.local);
  lines.push(`Raised by the model (combined level above local): ${raised.length}`);
  for (const r of raised) lines.push(`  ${r.id} [${r.group}]: ${r.local} -> ${r.combined}`);
  return lines.join('\n');
}

function parseArgs(argv) {
  const out = { file: undefined, baseUrl: undefined, model: undefined, apiKey: undefined, timeoutMs: 30000 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => {
      const v = argv[++i];
      if (v === undefined) throw new Error(`${a} needs a value`);
      return v;
    };
    if (a === '--base-url') out.baseUrl = next();
    else if (a === '--model') out.model = next();
    else if (a === '--api-key') out.apiKey = next();
    else if (a === '--timeout-ms') out.timeoutMs = Number(next());
    else if (a.startsWith('--')) throw new Error(`unknown option ${a}`);
    else if (out.file === undefined) out.file = a;
    else throw new Error(`unexpected argument ${a}`);
  }
  return out;
}

const USAGE =
  'usage: node scripts/eval.mjs <vectors.jsonl> --base-url <url> --model <name> [--api-key <key>] [--timeout-ms <ms>]';

async function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(`${err.message}\n${USAGE}`);
    process.exit(2);
  }
  if (!args.file || !args.baseUrl || !args.model || !Number.isFinite(args.timeoutMs) || args.timeoutMs <= 0) {
    console.error(USAGE);
    process.exit(2);
  }

  const adapterEntry = fileURLToPath(new URL('../dist/index.mjs', import.meta.url));
  if (!existsSync(adapterEntry)) {
    console.error('dist/ not found: run `pnpm build` first');
    process.exit(2);
  }
  let core;
  try {
    core = await import('@meddevkit/crisis-signals');
  } catch {
    console.error('@meddevkit/crisis-signals could not be loaded: run `pnpm build` first');
    process.exit(2);
  }
  const { NopeEdgeAdapter, ADAPTER_VERSION } = await import(pathToFileURL(adapterEntry).href);

  let vectors;
  try {
    vectors = parseVectors(readFileSync(args.file, 'utf8'));
  } catch (err) {
    console.error(err.code === 'ENOENT' ? `file not found: ${args.file}` : err.message);
    process.exit(2);
  }

  const adapter = new NopeEdgeAdapter({
    baseUrl: args.baseUrl,
    model: args.model,
    apiKey: args.apiKey,
    requestTimeoutMs: args.timeoutMs,
  });
  const rows = await evaluate(vectors, {
    screenTextWithSecondOpinion: core.screenTextWithSecondOpinion,
    adapter,
    timeoutMs: args.timeoutMs,
    onProgress: (done, total) => {
      if (done % 25 === 0 || done === total) process.stderr.write(`  ${done}/${total}\n`);
    },
  });
  console.log(
    formatReport(rows, {
      file: args.file,
      model: args.model,
      adapterVersion: ADAPTER_VERSION,
      patternsVersion: core.PATTERNS_VERSION,
    })
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
