#!/usr/bin/env node
/**
 * Download the ACI-Bench clinical notes used by run.mjs and write them to
 * data/aci-bench.jsonl as one {"id", "text"} object per line.
 *
 * Source: https://github.com/wyim/aci-bench (CC BY 4.0), pinned to one commit.
 * The five CSVs below hold 207 notes in total. Each CSV is checked against a
 * SHA-256 hash, so a changed upstream file fails loudly instead of silently
 * producing different numbers.
 *
 * Usage: node benchmarks/splitters/fetch-data.mjs
 * Needs Node >= 18 (global fetch). No dependencies.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(HERE, 'data');
const OUT = path.join(DATA_DIR, 'aci-bench.jsonl');

const COMMIT = 'b909b2bb9cf1d19de08df15cddde7bd0179665e4';
const BASE = `https://raw.githubusercontent.com/wyim/aci-bench/${COMMIT}/data/challenge_data`;

// Split name -> SHA-256 of the CSV at COMMIT. Order matters: it sets the
// order of notes in the output file.
const SPLITS = [
  ['train', '6c778d4ac5e6cc6f1964786f9286e8d765c210f22ed6b57f83aff8497409cea4'],
  ['valid', '6629e89e3fb409d2b3eceab60dc7b32fe1d3fb8d4e07795039284965522aa4d0'],
  ['clinicalnlp_taskB_test1', '5cc4008e68545f84913744a8e493a58bdf17ba7e1b7a0be46d6943d6bfca9471'],
  ['clinicalnlp_taskC_test2', '599e3330a14e25a0e056aee1365ffac7ebe50058f15821eae42a5513c2bb5a4f'],
  ['clef_taskC_test3', 'd3c18362a42124ea2bd1b2b4b66ba76a11bb123dfdb416471ae3b5924d1428ec'],
];
const EXPECTED_NOTES = 207;

/**
 * Minimal RFC 4180 CSV parser: quoted fields may contain commas, newlines and
 * doubled quotes. Field contents are returned exactly as written (no trimming,
 * line endings inside quoted fields preserved).
 */
function parseCsv(src) {
  const rows = [];
  let row = [];
  let field = '';
  let i = 0;
  let quoted = false;
  while (i < src.length) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        quoted = false;
        i++;
        continue;
      }
      field += c;
      i++;
      continue;
    }
    if (c === '"') {
      quoted = true;
      i++;
    } else if (c === ',') {
      row.push(field);
      field = '';
      i++;
    } else if (c === '\n' || c === '\r') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      i += c === '\r' && src[i + 1] === '\n' ? 2 : 1;
    } else {
      field += c;
      i++;
    }
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

async function download(split, sha256) {
  const url = `${BASE}/${split}.csv`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GET ${url}: HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const got = crypto.createHash('sha256').update(buf).digest('hex');
  if (got !== sha256) throw new Error(`${split}.csv: SHA-256 ${got}, expected ${sha256}`);
  return buf.toString('utf8');
}

const lines = [];
for (const [split, sha256] of SPLITS) {
  const [header, ...rows] = parseCsv(await download(split, sha256));
  const idCol = header.indexOf('encounter_id');
  const noteCol = header.indexOf('note');
  if (idCol < 0 || noteCol < 0) throw new Error(`${split}.csv: missing encounter_id or note column`);
  let n = 0;
  for (const r of rows) {
    if (r.length === 1 && r[0] === '') continue; // blank line
    if (r.length !== header.length) throw new Error(`${split}.csv: row with ${r.length} fields, expected ${header.length}`);
    lines.push(JSON.stringify({ id: `${split}/${r[idCol]}`, text: r[noteCol] }));
    n++;
  }
  console.log(`${split}: ${n} notes`);
}
if (lines.length !== EXPECTED_NOTES) throw new Error(`got ${lines.length} notes, expected ${EXPECTED_NOTES}`);

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.writeFileSync(OUT, lines.join('\n') + '\n');
console.log(`wrote ${lines.length} notes to ${path.relative(process.cwd(), OUT) || OUT}`);
