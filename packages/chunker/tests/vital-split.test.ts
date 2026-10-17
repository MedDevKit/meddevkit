/**
 * Vital sign split tests
 *
 * The chunker must never place a chunk boundary (core start/end or overlap
 * start) strictly inside a vital sign. These tests reproduce a split found
 * on a real, comma-flattened MTSamples note (no newlines, ".," with no
 * space after the period) and check the invariant across many generated
 * notes.
 */

import { describe, it, expect } from 'vitest';
import { MedicalChunker } from '../src/MedicalChunker';
import { detectVitals } from '../src/patterns';
import { normalizeText, findBestSplitPoint } from '../src/utils';
import type { MedicalChunk, ProtectedRange } from '../src/types';

// ============================================================================
// Helpers
// ============================================================================

const FILLER =
  'the patient reports intermittent abdominal discomfort over the past several weeks, ' +
  'worse after meals and partially relieved by rest, with no recent travel, ' +
  'and she has been compliant with her home regimen as prescribed by her primary physician, ';

/**
 * Comma-flattened filler of exactly `length` characters, ending in a single
 * space. Contains no sentence end followed by whitespace, no newline and no
 * vital sign, so findBestSplitPoint has no sentence or paragraph boundary to
 * use.
 */
function filler(length: number): string {
  let base = FILLER;
  while (base.length < length) base += FILLER;
  return base.slice(0, length - 1).replace(/\s$/, 'x') + ' ';
}

/** Every position where the chunker cut the text */
function cutPositions(chunks: MedicalChunk[]): number[] {
  const cuts: number[] = [];
  for (const chunk of chunks) {
    cuts.push(chunk.boundaries.start, chunk.boundaries.end);
    if (chunk.boundaries.overlapStart !== undefined) {
      cuts.push(chunk.boundaries.overlapStart);
    }
  }
  return cuts;
}

/** Vital spans that a cut position falls strictly inside */
function splitVitals(
  text: string,
  chunks: MedicalChunk[]
): Array<{ vital: string; cut: number }> {
  const vitals = detectVitals(text);
  const result: Array<{ vital: string; cut: number }> = [];
  for (const cut of cutPositions(chunks)) {
    for (const v of vitals) {
      if (cut > v.startOffset && cut < v.endOffset) {
        result.push({ vital: v.raw, cut });
      }
    }
  }
  return result;
}

/** Deterministic PRNG (mulberry32) */
function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ============================================================================
// Reproduction of the real-note split
// ============================================================================

describe('vital split on comma-flattened notes', () => {
  const VITALS_SUFFIX =
    'Vital signs: Temperature 98.2, pulse 104, respiratory rate 24, ' +
    'and blood pressure 141/70.,GENERAL: Well developed, well nourished, ' +
    'in no acute distress.,HEENT: Normocephalic, atraumatic.,' +
    'NECK: Supple, no lymphadenopathy.,' +
    filler(1200) +
    'discharged home in stable condition.';

  /**
   * Build a note where the BP vital ends exactly at `vitalEnd`. With
   * maxTokens 256 (1024 chars) and vitalEnd 1024, the ideal end lands just
   * past the vital, on the "." of ".,GENERAL", so the old word-boundary
   * fallback walked back into "blood pressure 141/70".
   */
  function buildNote(vitalEnd: number): string {
    const bpEndInSuffix =
      VITALS_SUFFIX.indexOf('141/70') + '141/70'.length;
    return filler(vitalEnd - bpEndInSuffix) + VITALS_SUFFIX;
  }

  it('detects the BP phrasing used in the reproduction', () => {
    const note = buildNote(1024);
    expect(normalizeText(note)).toBe(note);
    const bp = detectVitals(note).find((v) => v.type === 'blood_pressure');
    expect(bp).toBeDefined();
    expect(bp!.raw).toBe('blood pressure 141/70');
    expect(bp!.endOffset).toBe(1024);
  });

  it('does not split "blood pressure 141/70" when no sentence boundary exists (maxTokens 256)', () => {
    const note = buildNote(1024);
    const chunker = new MedicalChunker({
      maxTokens: 256,
      overlapTokens: 0,
    });
    const { chunks } = chunker.chunk(note);

    expect(chunks.length).toBeGreaterThan(1);
    expect(splitVitals(note, chunks)).toEqual([]);
    expect(chunks.some((c) => c.text.includes('blood pressure 141/70'))).toBe(
      true
    );
    expect(chunks.some((c) => /pressure$/.test(c.text))).toBe(false);
    expect(chunks.some((c) => c.text.startsWith('141/70'))).toBe(false);
  });

  it('does not split the vital at any ideal end near it (maxTokens 256, with overlap)', () => {
    for (let vitalEnd = 1000; vitalEnd <= 1040; vitalEnd++) {
      const note = buildNote(vitalEnd);
      const chunker = new MedicalChunker({ maxTokens: 256, overlapTokens: 30 });
      const { chunks } = chunker.chunk(note);
      expect(splitVitals(note, chunks), `vitalEnd=${vitalEnd}`).toEqual([]);
    }
  });
});

// ============================================================================
// findBestSplitPoint: every branch respects protected ranges
// ============================================================================

describe('findBestSplitPoint never returns a position inside a protected range', () => {
  const inside = (pos: number, ranges: ProtectedRange[]) =>
    ranges.some((r) => pos > r.start && pos < r.end);

  it('word-boundary fallback: walks back before the range, not into it', () => {
    const text = filler(200) + 'blood pressure 141/70.,GENERAL:xxxxxxxxxxxx';
    const start = text.indexOf('blood');
    const end = start + 'blood pressure 141/70'.length;
    const ranges: ProtectedRange[] = [{ start, end, reason: 'vital' }];

    const split = findBestSplitPoint(text, 0, end + 2, ranges);
    expect(inside(split.position, ranges)).toBe(false);
    expect(split.position).toBe(start);
  });

  it('word-boundary fallback: extends past the range when it starts too close to the chunk start', () => {
    const chunkStart = 200;
    const text =
      filler(chunkStart) + 'aa blood pressure 141/70.,GENERAL:xxxxxxxxxxxxxx';
    const start = text.indexOf('blood');
    const end = start + 'blood pressure 141/70'.length;
    const ranges: ProtectedRange[] = [{ start, end, reason: 'vital' }];

    const split = findBestSplitPoint(text, chunkStart, end + 2, ranges);
    expect(inside(split.position, ranges)).toBe(false);
    expect(split.position).toBe(end);
  });

  it('sentence branch: a ". " inside a protected range is not used', () => {
    // A custom protected range that contains a sentence-like break
    const text = filler(200) + 'take 1 tab p.o. q.6h. as needed, ' + filler(20);
    const start = text.indexOf('take');
    const end = text.indexOf(' needed');
    const ranges: ProtectedRange[] = [{ start, end, reason: 'custom' }];

    const split = findBestSplitPoint(text, 0, end + 5, ranges, true);
    expect(inside(split.position, ranges)).toBe(false);
  });

  it('paragraph branch: a blank line inside a protected range is not used', () => {
    const text = filler(200) + 'BP 141/\n\n70 noted, ' + filler(20);
    const start = text.indexOf('BP');
    const end = text.indexOf(' noted');
    const ranges: ProtectedRange[] = [{ start, end, reason: 'custom' }];

    const split = findBestSplitPoint(text, 0, end + 3, ranges, false);
    expect(inside(split.position, ranges)).toBe(false);
  });

  it('handles unmerged, overlapping ranges', () => {
    const text = filler(200) + 'blood pressure 141/70.,GENERAL:xxxxxxxxxxxx';
    const a = text.indexOf('blood');
    const b = a + 'blood pressure 141/70'.length;
    const ranges: ProtectedRange[] = [
      { start: a + 6, end: b, reason: 'vital' },
      { start: a, end: a + 10, reason: 'custom' },
    ];

    const split = findBestSplitPoint(text, 0, b + 2, ranges);
    expect(inside(split.position, ranges)).toBe(false);
  });
});

// ============================================================================
// Property-style: no vital crosses a chunk boundary
// ============================================================================

describe('property: no vital span crosses a chunk boundary', () => {
  const VITAL_PHRASES = [
    'BP 141/70',
    'blood pressure 141/70',
    'BP: 120/80 mmHg',
    'HR 72 bpm',
    'pulse 104',
    'heart rate 88',
    'respiratory rate 24',
    'RR 16/min',
    'T 98.6°F',
    'temperature 37.2 C',
    'O2 sat 98%',
  ];
  const SEPARATORS = [
    '.,',
    ', ',
    '. ',
    ',',
    '.\n',
    ' and ',
    '; ',
    '.,PHYSICAL EXAMINATION:,',
    '\n\nASSESSMENT AND PLAN:\n',
    '\nVital Signs: ',
  ];
  const WORDS = FILLER.trim().split(/\s+/);

  /** Generate a note with vitals at seeded positions */
  function generateNote(rand: () => number): string {
    const parts: string[] = [];
    const segments = 20 + Math.floor(rand() * 40);
    for (let i = 0; i < segments; i++) {
      if (rand() < 0.35) {
        parts.push(VITAL_PHRASES[Math.floor(rand() * VITAL_PHRASES.length)]);
      } else {
        const n = 1 + Math.floor(rand() * 25);
        const words: string[] = [];
        for (let w = 0; w < n; w++) {
          words.push(WORDS[Math.floor(rand() * WORDS.length)]);
        }
        parts.push(words.join(' '));
      }
      parts.push(SEPARATORS[Math.floor(rand() * SEPARATORS.length)]);
    }
    return parts.join('');
  }

  const MAX_TOKENS = [12, 20, 32, 64, 128, 256];
  const SEEDS = Array.from({ length: 60 }, (_, i) => i + 1);

  it('generated notes contain vitals the detector catches', () => {
    let total = 0;
    for (const seed of SEEDS) {
      const note = normalizeText(generateNote(seededRandom(seed)));
      total += detectVitals(note).length;
    }
    expect(total).toBeGreaterThan(SEEDS.length * 3);
  });

  for (const maxTokens of MAX_TOKENS) {
    for (const overlapTokens of [0, Math.floor(maxTokens / 3)]) {
      it(`maxTokens ${maxTokens}, overlapTokens ${overlapTokens}: no vital is split across ${SEEDS.length} seeded notes`, () => {
        const chunker = new MedicalChunker({
          maxTokens,
          minTokens: 1,
          overlapTokens,
        });
        for (const seed of SEEDS) {
          const raw = generateNote(seededRandom(seed));
          const note = normalizeText(raw);
          const { chunks } = chunker.chunk(raw);
          expect(splitVitals(note, chunks), `seed=${seed}`).toEqual([]);
        }
      });
    }
  }
});
