#!/usr/bin/env node
/**
 * Splitter comparison on ACI-Bench: how often does each text splitter cut a
 * clinical pattern (vital sign, medication, section header line) so that no
 * single chunk contains it whole?
 *
 * Splitters:
 *   - the MedDevKit demo's word-boundary splitter (port of
 *     demo/src/utils/naiveChunker.ts), maxTokens 128 / 256 / 512
 *   - LangChain RecursiveCharacterTextSplitter (@langchain/textsplitters
 *     1.0.2, default separators), chunkSize 500 / 1000 / 2000 with overlap 0,
 *     and chunkSize 1000 with overlap 200
 *   - MedicalChunker from @meddevkit/chunker, maxTokens 128 / 256 / 512, all
 *     other options default (overlapTokens 50), and the same sizes again
 *     with overlapTokens 0 for a like-for-like comparison with LangChain at
 *     overlap 0
 *
 * Usage (from the repo root, after `pnpm install && pnpm build` and
 * `node benchmarks/splitters/fetch-data.mjs`):
 *   node benchmarks/splitters/run.mjs              notes as written
 *   node benchmarks/splitters/run.mjs --flatten    newline runs -> one space
 *   node benchmarks/splitters/run.mjs --dump "<setting name>" <noteId>
 *                                                  also print one note's chunks
 *
 * Prints Markdown tables to stdout and writes raw results (every broken
 * pattern) to data/results.json or data/results-flat.json.
 * Everything runs locally; no note text leaves the machine.
 *
 * "Broken": a pattern span (start/end offsets in the note text) is broken for
 * a splitter if no single chunk's range contains the whole span. A pattern
 * that is whole in any chunk, including via overlap, is intact.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import {
  MedicalChunker,
  detectVitals,
  detectMedications,
  detectSections,
  estimateTokens,
  normalizeText,
} from '@meddevkit/chunker';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DATA_FILE = path.join(HERE, 'data', 'aci-bench.jsonl');

// --flatten: replace every run of newlines with one space. This simulates EHR
// exports or copy-paste that lose line breaks. Vitals and meds are detected on
// the flattened text. detectSections is line-based and finds nothing useful
// once lines are gone, so section spans are the header lines detected on the
// ORIGINAL text, mapped to their position in the flattened text.
const FLATTEN = process.argv.includes('--flatten');
const SUFFIX = FLATTEN ? '-flat' : '';

if (!fs.existsSync(DATA_FILE)) {
  console.error(`Missing ${DATA_FILE}. Run: node benchmarks/splitters/fetch-data.mjs`);
  process.exit(1);
}

/** Replace each run of newlines with one space; map[i] = new offset of original char i. */
function flatten(text) {
  let out = '';
  const map = new Int32Array(text.length + 1);
  for (let i = 0; i < text.length; ) {
    if (text[i] === '\n') {
      let j = i;
      while (j < text.length && text[j] === '\n') map[j++] = out.length;
      out += ' ';
      i = j;
    } else {
      map[i] = out.length;
      out += text[i++];
    }
  }
  map[text.length] = out.length;
  return { text: out, map };
}

const rawNotes = fs
  .readFileSync(DATA_FILE, 'utf8')
  .trim()
  .split('\n')
  .map((l) => JSON.parse(l));
const notes = rawNotes.map((n) => {
  if (!FLATTEN) return { id: n.id, text: n.text };
  const f = flatten(n.text);
  return { id: n.id, text: f.text, original: n.text, map: f.map };
});

// ---------------------------------------------------------------------------
// Demo word-boundary splitter: faithful port of demo/src/utils/naiveChunker.ts.
// It looks only at spaces, never at newlines.
// ---------------------------------------------------------------------------
function naiveChunk(text, maxTokens) {
  if (!text.trim()) return { chunks: [], totalChunks: 0 };
  const chunks = [];
  let position = 0;
  let index = 0;
  while (position < text.length) {
    // Find end position for this chunk
    let end = text.length;
    let candidateText = text.slice(position, end);
    let tokens = estimateTokens(candidateText);
    if (tokens <= maxTokens) {
      // Remaining text fits in one chunk
      chunks.push({ text: candidateText, index, tokenCount: tokens, startOffset: position, endOffset: end });
      break;
    }
    // Binary search for the right word boundary
    let lo = position;
    let hi = end;
    while (hi - lo > 10) {
      const mid = Math.floor((lo + hi) / 2);
      const midText = text.slice(position, mid);
      if (estimateTokens(midText) <= maxTokens) lo = mid;
      else hi = mid;
    }
    // Find the last word boundary at or before `lo`
    let splitAt = lo;
    const lastSpace = text.lastIndexOf(' ', lo);
    if (lastSpace > position) {
      splitAt = lastSpace;
    } else {
      // No space found after position: look forward for one
      const nextSpace = text.indexOf(' ', position + 1);
      if (nextSpace !== -1) splitAt = nextSpace;
      else splitAt = text.length;
    }
    candidateText = text.slice(position, splitAt);
    tokens = estimateTokens(candidateText);
    // If we overshot, step back word by word
    while (tokens > maxTokens && splitAt > position) {
      const prevSpace = text.lastIndexOf(' ', splitAt - 1);
      if (prevSpace <= position) break;
      splitAt = prevSpace;
      candidateText = text.slice(position, splitAt);
      tokens = estimateTokens(candidateText);
    }
    if (candidateText.trim()) {
      chunks.push({ text: candidateText, index, tokenCount: tokens, startOffset: position, endOffset: splitAt });
      index++;
    }
    // Skip whitespace between chunks
    position = splitAt;
    while (position < text.length && text[position] === ' ') position++;
  }
  return { chunks, totalChunks: chunks.length };
}

// ---------------------------------------------------------------------------
// Offset helpers
// ---------------------------------------------------------------------------
const isWs = (c) => /\s/.test(c);

/** prefix[i] = number of non-whitespace chars in s[0..i) */
function nonWsPrefix(s) {
  const p = new Int32Array(s.length + 1);
  for (let i = 0; i < s.length; i++) p[i + 1] = p[i] + (isWs(s[i]) ? 0 : 1);
  return p;
}
const stripWs = (s) => s.replace(/\s+/g, '');

/**
 * Locate LangChain chunks in the note text. splitText returns trimmed strings
 * without offsets (v1.0.2 has no addStartIndex), so each chunk is found with
 * indexOf from a moving cursor. A placement is valid only if it starts after
 * the previous chunk's start, adds text past the previous chunk's end, and
 * leaves only whitespace in any gap. Searching from prevStart+1 alone can
 * land on an earlier duplicate of a short chunk (e.g. a repeated header line).
 */
function locateChunks(text, chunkTexts, chunkOverlap) {
  const out = [];
  let prevStart = -1;
  let prevEnd = 0;
  for (const c of chunkTexts) {
    let idx = text.indexOf(c, Math.max(prevStart + 1, prevEnd - chunkOverlap));
    while (idx >= 0 && !(idx + c.length > prevEnd && text.slice(prevEnd, Math.max(prevEnd, idx)).trim() === '')) {
      idx = text.indexOf(c, idx + 1);
    }
    if (idx < 0) throw new Error('chunk not found in note text');
    out.push({ start: idx, end: idx + c.length, text: c });
    prevStart = idx;
    prevEnd = idx + c.length;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Patterns: what MedDevKit's own detectors find in the note.
// ---------------------------------------------------------------------------
function getPatterns(note) {
  const { text } = note;
  const pats = [];
  const seen = new Set();
  const add = (kind, start, end, label) => {
    const key = `${kind}:${start}:${end}`;
    if (seen.has(key)) return;
    seen.add(key);
    if (end <= start) return;
    pats.push({ kind, start, end, label });
  };
  for (const v of detectVitals(text)) {
    if (text.slice(v.startOffset, v.endOffset) !== v.raw) throw new Error('vital offset mismatch');
    add('vitals', v.startOffset, v.endOffset, v.type);
  }
  for (const m of detectMedications(text)) {
    if (text.slice(m.startOffset, m.endOffset) !== m.raw) throw new Error('med offset mismatch');
    add('meds', m.startOffset, m.endOffset, m.name ?? 'med');
  }
  for (const s0 of detectSections(note.original ?? text)) {
    let s = s0;
    if (note.map) {
      if (s0.header.includes('\n')) throw new Error('header with newline');
      s = { ...s0, startOffset: note.map[s0.startOffset] };
    }
    const end = s.startOffset + s.header.length;
    if (text.slice(s.startOffset, end) !== s.header) throw new Error('section offset mismatch');
    // A standalone header line ("ASSESSMENT AND PLAN", "CC:") vs a prose line
    // that detectSections also matched because it starts with a label
    // ("Examination of the right knee: ...").
    const standalone = s.header.split(/\s+/).length <= 5 && !/\.$/.test(s.header);
    add('sections', s.startOffset, end, standalone ? 'header' : 'prose');
  }
  return pats;
}

// ---------------------------------------------------------------------------
// Splitter runners -> chunks with ranges in note-text coordinates.
// Demo splitter and LangChain: exact char offsets. MedicalChunker works on
// normalizeText(text), which only collapses and trims whitespace, so its
// ranges are compared in non-whitespace-character coordinates.
// ---------------------------------------------------------------------------
async function runLangChain(text, chunkSize, chunkOverlap) {
  const splitter = new RecursiveCharacterTextSplitter({ chunkSize, chunkOverlap });
  const parts = await splitter.splitText(text);
  return locateChunks(text, parts, chunkOverlap);
}
function runNaive(text, maxTokens) {
  return naiveChunk(text, maxTokens).chunks.map((c) => {
    if (text.slice(c.startOffset, c.endOffset) !== c.text) throw new Error('demo splitter offset mismatch');
    return { start: c.startOffset, end: c.endOffset, text: c.text };
  });
}
const chunkers = new Map();
/** overlapTokens undefined = library default (50). */
function runMdk(text, maxTokens, overlapTokens) {
  const key = `${maxTokens}/${overlapTokens ?? 'default'}`;
  if (!chunkers.has(key)) {
    chunkers.set(key, new MedicalChunker(overlapTokens === undefined ? { maxTokens } : { maxTokens, overlapTokens }));
  }
  const norm = normalizeText(text);
  const t0 = performance.now();
  const res = chunkers.get(key).chunk(text);
  const ms = performance.now() - t0;
  return { norm, res, ms };
}

// ---------------------------------------------------------------------------
// Evaluation
// ---------------------------------------------------------------------------
const show = (s) => s.replace(/\n/g, '⏎');

function evaluate(note, pats, chunks, space) {
  // space: 'char' (chunk ranges are char offsets) or 'nonws' (chunk ranges
  // are non-whitespace indices; pattern spans are converted to match).
  const broken = [];
  const P = space === 'nonws' ? nonWsPrefix(note.text) : null;
  for (const p of pats) {
    const a = P ? P[p.start] : p.start;
    const b = P ? P[p.end] : p.end;
    if (chunks.some((c) => c.start <= a && b <= c.end)) continue;
    // Boundary shown: the chunk holding the span start with the largest end
    // ("chunk A"), cut at A's end. 25 chars of note text before the cut |
    // 25 chars after it (leading whitespace skipped). For zero-overlap
    // splitters that is exactly "tail of chunk A | head of chunk B".
    let ai = -1;
    for (let i = 0; i < chunks.length; i++)
      if (chunks[i].start <= a && a < chunks[i].end && (ai < 0 || chunks[i].end > chunks[ai].end)) ai = i;
    const A = chunks[ai];
    let cut = A ? A.end : -1;
    if (A && P) {
      cut = 0;
      while (P[cut] < A.end) cut++;
    }
    let bStart = cut;
    while (bStart < note.text.length && isWs(note.text[bStart])) bStart++;
    broken.push({
      id: note.id,
      kind: p.kind,
      label: p.label,
      pattern: note.text.slice(p.start, p.end),
      boundary: A
        ? `…${show(note.text.slice(Math.max(0, cut - 25), cut))} | ${show(note.text.slice(bStart, bStart + 25))}…`
        : '(no boundary found)',
      chunkA: ai,
    });
  }
  return broken;
}

const settings = [
  ...[128, 256, 512].map((t) => ({ name: `Demo word-boundary splitter, maxTokens ${t}`, fam: 'naive', t })),
  ...[500, 1000, 2000].map((s) => ({ name: `LangChain RCTS, chunkSize ${s}, overlap 0`, fam: 'lc', s, o: 0 })),
  { name: 'LangChain RCTS, chunkSize 1000, overlap 200', fam: 'lc', s: 1000, o: 200 },
  ...[128, 256, 512].map((t) => ({ name: `MedicalChunker, maxTokens ${t} (defaults)`, fam: 'mdk', t })),
  ...[128, 256, 512].map((t) => ({ name: `MedicalChunker, maxTokens ${t}, overlapTokens 0`, fam: 'mdk', t, o: 0 })),
];

const patsByNote = notes.map((n) => getPatterns(n));
const totals = { vitals: 0, meds: 0, sections: 0 };
const secSub = { header: 0, prose: 0 };
for (const ps of patsByNote)
  for (const p of ps) {
    totals[p.kind]++;
    if (p.kind === 'sections') secSub[p.label]++;
  }
const totalNoteChars = notes.reduce((n, x) => n + x.text.length, 0);

// Warm up MedicalChunker (2 full passes per setting) before timing.
for (const st of settings) if (st.fam === 'mdk') for (let k = 0; k < 2; k++) for (const n of notes) runMdk(n.text, st.t, st.o);

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const pct = (xs, q) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.ceil(q * s.length) - 1)];
};

const results = [];
const allChunks = {}; // for --dump
for (const st of settings) {
  const broken = [];
  const chunkCounts = [];
  const chunkLens = [];
  const latencies = [];
  let notesBroken = 0;
  let coverageFailures = 0;
  for (let i = 0; i < notes.length; i++) {
    const note = notes[i];
    let chunks;
    let space = 'char';
    if (st.fam === 'naive') chunks = runNaive(note.text, st.t);
    else if (st.fam === 'lc') chunks = await runLangChain(note.text, st.s, st.o);
    else {
      const { norm, res, ms } = runMdk(note.text, st.t, st.o);
      latencies.push(ms);
      if (stripWs(norm) !== stripWs(note.text)) throw new Error('normalization changed non-whitespace chars');
      const nP = nonWsPrefix(norm);
      chunks = res.chunks.map((c) => {
        // Range includes the overlap prefix, so overlap counts as intact.
        const s = c.boundaries.overlapStart ?? c.boundaries.start;
        const e = c.boundaries.end;
        if (stripWs(norm.slice(s, e)) !== stripWs(c.text)) throw new Error(`MedicalChunker chunk text/offset mismatch ${note.id}`);
        return { start: nP[s], end: nP[e], text: c.text };
      });
      space = 'nonws';
    }
    // Coverage sanity: every non-whitespace char of the note is inside some chunk.
    {
      const P = nonWsPrefix(note.text);
      const total = P[note.text.length];
      const ranges = chunks.map((c) => (space === 'char' ? [P[c.start], P[c.end]] : [c.start, c.end])).sort((x, y) => x[0] - y[0]);
      let covered = 0;
      for (const [s, e] of ranges) {
        if (s > covered) break;
        covered = Math.max(covered, e);
      }
      if (covered < total) coverageFailures++;
    }
    allChunks[`${st.name}|${note.id}`] = chunks;
    chunkCounts.push(chunks.length);
    for (const c of chunks) chunkLens.push(c.text.length);
    const b = evaluate(note, patsByNote[i], chunks, space);
    if (b.length) notesBroken++;
    broken.push(...b);
  }
  const byKind = { vitals: 0, meds: 0, sections: 0, header: 0, prose: 0 };
  for (const b of broken) {
    byKind[b.kind]++;
    if (b.kind === 'sections') byKind[b.label]++;
  }
  results.push({
    name: st.name,
    fam: st.fam,
    total: totals.vitals + totals.meds + totals.sections,
    broken: broken.length,
    byKind,
    notesBroken,
    medianChunks: median(chunkCounts),
    medianChunkChars: median(chunkLens),
    // Total chunk characters / total note characters. Above 1 means overlap
    // repeats text across chunks.
    textRatio: chunkLens.reduce((n, x) => n + x, 0) / totalNoteChars,
    coverageFailures,
    latency: latencies.length ? { median: median(latencies), p95: pct(latencies, 0.95) } : null,
    examples: broken,
  });
}

/** Up to n examples, round-robin over kinds, preferring distinct notes. */
function pickExamples(list, n) {
  const byKind = { vitals: [], meds: [], sections: [] };
  const usedNotes = new Set();
  for (const b of list) byKind[b.kind].push(b);
  const out = [];
  const idx = { vitals: 0, meds: 0, sections: 0 };
  let progress = true;
  while (out.length < n && progress) {
    progress = false;
    for (const k of ['vitals', 'meds', 'sections']) {
      while (idx[k] < byKind[k].length && usedNotes.has(byKind[k][idx[k]].id) && out.length < n) idx[k]++;
      if (idx[k] < byKind[k].length && out.length < n) {
        out.push(byKind[k][idx[k]]);
        usedNotes.add(byKind[k][idx[k]].id);
        idx[k]++;
        progress = true;
      }
    }
  }
  // If the distinct-note preference left us short, fill without it.
  for (const b of list) if (out.length < n && !out.includes(b)) out.push(b);
  return out;
}

const f = (x, d) => `${x} (${d ? ((100 * x) / d).toFixed(1) : '0.0'}%)`;
const nPats = totals.vitals + totals.meds + totals.sections;
let md = '';
md += `Mode: ACI-Bench${FLATTEN ? ', flattened (newline runs -> one space)' : ', as written'}. `;
md += `Patterns: ${totals.vitals} vitals, ${totals.meds} medications, ${totals.sections} section lines (${nPats} total) across ${notes.length} notes.\n\n`;
md += '| Splitter / setting | Broken (all) | Vitals broken | Meds broken | Section lines broken | Notes with >=1 broken | Median chunks/note | Median chunk chars | Chunk text / note text |\n';
md += '|---|---|---|---|---|---|---|---|---|\n';
for (const r of results) {
  md += `| ${r.name} | ${f(r.broken, r.total)} | ${f(r.byKind.vitals, totals.vitals)} | ${f(r.byKind.meds, totals.meds)} | ${f(r.byKind.sections, totals.sections)} | ${r.notesBroken}/${notes.length} | ${r.medianChunks} | ${r.medianChunkChars} | ${r.textRatio.toFixed(2)}x |\n`;
}
md += `\nSection lines split into standalone headers (${secSub.header}; 5 words or fewer, no terminal period) and label+prose lines that detectSections also matched (${secSub.prose}):\n\n`;
md += '| Splitter / setting | Standalone headers broken | Label+prose lines broken |\n|---|---|---|\n';
for (const r of results) md += `| ${r.name} | ${f(r.byKind.header, secSub.header)} | ${f(r.byKind.prose, secSub.prose)} |\n`;
md += '\n';
for (const r of results) {
  if (r.latency) md += `- ${r.name}: latency per note median ${r.latency.median.toFixed(2)} ms, p95 ${r.latency.p95.toFixed(2)} ms\n`;
}
for (const r of results) {
  if (r.coverageFailures) md += `- WARNING ${r.name}: ${r.coverageFailures} notes not fully covered by chunks\n`;
}
md += '\n## Broken examples\n';
for (const r of results) {
  md += `\n### ${r.name}\n\n`;
  if (!r.examples.length) {
    md += 'No broken patterns.\n';
    continue;
  }
  // Every MedicalChunker break; up to 12 for the others.
  for (const e of pickExamples(r.examples, r.fam === 'mdk' ? Infinity : 12)) {
    const pat = e.pattern.length > 90 ? e.pattern.slice(0, 87) + '...' : e.pattern;
    md += `- \`${e.id}\` [${e.kind === 'sections' ? `section ${e.label} line` : e.kind}] \`${show(pat)}\`: \`${e.boundary}\`\n`;
  }
}

fs.writeFileSync(path.join(HERE, 'data', `results${SUFFIX}.json`), JSON.stringify({ totals, results }, null, 1));
console.log(md);

const di = process.argv.indexOf('--dump');
if (di > 0) {
  const key = `${process.argv[di + 1]}|${process.argv[di + 2]}`;
  const cs = allChunks[key];
  console.log(`\n=== ${key} ===`);
  if (!cs) console.log('(no such setting/note)');
  cs?.forEach((c, i) => console.log(`--- chunk ${i} [${c.start},${c.end})\n${c.text}`));
}
