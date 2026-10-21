#!/usr/bin/env node
/**
 * Latency benchmark for @meddevkit/chunker.
 *
 * Runs against the built package (dist/), so build first:
 *   pnpm --filter @meddevkit/chunker build
 *   pnpm --filter @meddevkit/chunker bench
 *
 * Inputs are synthetic notes of about 1K, 4K and 12K characters. They contain
 * no real patient data. Each measurement warms up, then times N iterations
 * and reports the median and p95 in milliseconds.
 *
 * Options (environment variables):
 *   BENCH_ITERATIONS  timed iterations per case (default 200)
 *   BENCH_WARMUP      warm-up iterations per case (default 50)
 *
 * Dependency-free: uses only Node built-ins.
 */

import { createRequire } from 'node:module';
import { performance } from 'node:perf_hooks';
import os from 'node:os';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const distEntry = path.join(here, '..', 'dist', 'index.js');
if (!existsSync(distEntry)) {
  console.error('dist/ not found. Run `pnpm --filter @meddevkit/chunker build` first.');
  process.exit(1);
}

const require = createRequire(import.meta.url);
const kit = require(distEntry);
const { MedicalChunker } = kit;

const ITERATIONS = Number(process.env.BENCH_ITERATIONS ?? 200);
const WARMUP = Number(process.env.BENCH_WARMUP ?? 50);

// ---------------------------------------------------------------------------
// Synthetic notes (fictional patient, no real PHI)
// ---------------------------------------------------------------------------

const HEADER = `PATIENT INFORMATION:
Name: Jane Testpatient
DOB: 03/14/1970
MRN: 00000000
Phone: (555) 010-0000

`;

const VISIT = `CHIEF COMPLAINT: Shortness of breath and chest tightness

VITAL SIGNS:
BP: 142/88 mmHg
HR: 96 bpm
RR: 20
T: 99.1°F
O2 sat: 93% on room air

HISTORY OF PRESENT ILLNESS:
Patient is a 56 year old female with a history of hypertension presenting with
shortness of breath for the past 3 days, worse with exertion. She denies chest
pain at rest. No fever. Negative for hemoptysis. Reports mild ankle swelling.

MEDICATIONS:
Lisinopril 10 mg PO daily
Metoprolol 25 mg PO BID
Atorvastatin 40 mg PO nightly

ASSESSMENT AND PLAN:
1. Dyspnea - rule out heart failure exacerbation
   - BNP, chest x-ray, ECG
   - Furosemide 20 mg IV once
2. Hypertension - continue current regimen
   - Follow up in 1 week
`;

const PROGRESS = `PROGRESS NOTE:
Patient seen and examined on rounds. Reports breathing is somewhat improved
since admission. Denies orthopnea overnight. No palpitations.

VITAL SIGNS:
BP: 128/76 mmHg, HR 82 bpm, RR 18, T 98.4°F, O2 sat 96% on 2L nasal cannula

PHYSICAL EXAM:
General: Alert, oriented, in no acute distress.
Lungs: Mild bibasilar crackles, improved from prior exam. No wheezing.
Heart: Regular rate and rhythm. No murmurs, rubs or gallops.
Extremities: Trace bilateral lower extremity edema.

ASSESSMENT AND PLAN:
Continue furosemide 40 mg PO daily. Monitor daily weights and electrolytes.
Severe symptoms have resolved over the past 2 days. Ruled out myocardial
infarction with serial troponins. Plan discharge in 1 to 2 days if stable.

`;

/** Build a note of roughly `target` characters from synthetic sections. */
function buildNote(target) {
  let text = HEADER + VISIT + '\n';
  let day = 1;
  while (text.length < target) {
    text += `HOSPITAL DAY ${day}:\n` + PROGRESS;
    day += 1;
  }
  return text.slice(0, target);
}

const NOTES = [
  { label: '1K', text: buildNote(1_000) },
  { label: '4K', text: buildNote(4_000) },
  { label: '12K', text: buildNote(12_000) },
];

// ---------------------------------------------------------------------------
// Timing
// ---------------------------------------------------------------------------

function percentile(sorted, p) {
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)];
}

function measure(fn) {
  for (let i = 0; i < WARMUP; i++) fn();
  const samples = new Array(ITERATIONS);
  for (let i = 0; i < ITERATIONS; i++) {
    const start = performance.now();
    fn();
    samples[i] = performance.now() - start;
  }
  samples.sort((a, b) => a - b);
  return { median: percentile(samples, 50), p95: percentile(samples, 95) };
}

const fmt = (ms) => ms.toFixed(3).padStart(9);

const cases = [
  ['MedicalChunker.chunk (defaults)', (t) => new MedicalChunker().chunk(t)],
];
const detectors = [
  'detectVitals',
  'detectSections',
  'detectPhi',
  'detectNegations',
  'detectMedications',
  'detectTemporal',
  'detectSeverity',
];
for (const name of detectors) {
  if (typeof kit[name] === 'function') cases.push([name, (t) => kit[name](t)]);
}

console.log('@meddevkit/chunker latency benchmark');
console.log(`Node ${process.version}, ${os.cpus()[0]?.model ?? 'unknown CPU'} (${os.platform()} ${os.arch()})`);
console.log(`Warm-up ${WARMUP}, timed iterations ${ITERATIONS}; times in ms`);
console.log(`Notes: ${NOTES.map((n) => `${n.label}=${n.text.length} chars`).join(', ')}`);
console.log('');

const nameWidth = Math.max(...cases.map(([n]) => n.length));
console.log(
  `${'case'.padEnd(nameWidth)}  ${'note'.padEnd(4)}  ${'median'.padStart(9)}  ${'p95'.padStart(9)}`
);
for (const [name, fn] of cases) {
  for (const note of NOTES) {
    const { median, p95 } = measure(() => fn(note.text));
    console.log(`${name.padEnd(nameWidth)}  ${note.label.padEnd(4)}  ${fmt(median)}  ${fmt(p95)}`);
  }
}
