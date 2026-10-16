/**
 * Chunk overlap tests
 *
 * Verifies that overlap produces contiguous chunk text and that every
 * offset-bearing field on a chunk is relative to the final chunk.text,
 * including detections that lie inside the overlap region.
 */

import { describe, it, expect } from 'vitest';
import { MedicalChunker } from '../src/MedicalChunker';
import {
  detectPhi,
  detectVitals,
  detectNegations,
  detectMedications,
  detectTemporal,
  detectSeverity,
} from '../src/patterns';
import { normalizeText, findOverlapStart } from '../src/utils';
import { estimateTokens } from '../src/tokenizer';
import type {
  MedicalChunk,
  MedicalChunkerConfig,
  PatternMatch,
  PatternPlugin,
} from '../src/types';
import {
  SIMPLE_NOTE,
  NOTE_WITH_PHI,
  LONG_NOTE,
  NOTE_WITH_NEGATIONS,
  VITALS_VARIATIONS,
  NOTE_WITH_MEDICATIONS,
} from './fixtures/sample-notes';

// ============================================================================
// Helpers
// ============================================================================

interface Span {
  startOffset: number;
  endOffset: number;
  raw?: string;
}

/** Simple dose plugin (same shape as tests/plugins/integration.test.ts) */
const dosePlugin: PatternPlugin = {
  id: '@test/dose-plugin',
  name: 'Dose Plugin',
  version: '1.0.0',
  minContextVersion: '1.0.0',
  detectPatterns(text: string): PatternMatch[] {
    const matches: PatternMatch[] = [];
    const regex = /\b(\w+)\s+(\d+)\s*(mg|mcg|ml)\b/gi;
    let match;
    while ((match = regex.exec(text)) !== null) {
      matches.push({
        patternId: 'dose',
        patternName: 'Dose',
        pluginId: '@test/dose-plugin',
        startOffset: match.index,
        endOffset: match.index + match[0].length,
        raw: match[0],
        confidence: 0.9,
        isProtected: false,
      });
    }
    return matches;
  },
};

/** Collect plugin matches on the normalized text, as the chunker does */
function docPluginMatches(normalized: string): PatternMatch[] {
  return dosePlugin.detectPatterns!(normalized, {} as never);
}

/** Document offset where chunk.text begins */
function textStartOf(chunk: MedicalChunk, normalized: string): number {
  if (chunk.boundaries.overlapStart !== undefined) {
    return chunk.boundaries.overlapStart;
  }
  let i = chunk.boundaries.start;
  while (i < chunk.boundaries.end && /\s/.test(normalized[i])) i++;
  return i;
}

/**
 * Assert that a chunk's list for one detection type is exactly the set of
 * document-level detections lying fully inside [textStart, end), with
 * offsets relative to chunk.text, and that each span's text matches.
 */
function expectSpansAligned(
  label: string,
  chunk: MedicalChunk,
  chunkSpans: Span[] | undefined,
  docSpans: Span[],
  normalized: string
): void {
  const textStart = textStartOf(chunk, normalized);
  const end = chunk.boundaries.end;
  const expected = docSpans.filter(
    (s) => s.startOffset >= textStart && s.endOffset <= end
  );
  const actual = chunkSpans ?? [];

  expect(actual.length, `${label} count in chunk ${chunk.index}`).toBe(
    expected.length
  );

  const sortKey = (a: Span, b: Span) =>
    a.startOffset - b.startOffset || a.endOffset - b.endOffset;
  const sortedActual = [...actual].sort(sortKey);
  const sortedExpected = [...expected].sort(sortKey);

  sortedActual.forEach((span, i) => {
    const doc = sortedExpected[i];
    const sliced = chunk.text.slice(span.startOffset, span.endOffset);
    expect(sliced, `${label} text in chunk ${chunk.index}`).toBe(
      normalized.slice(doc.startOffset, doc.endOffset)
    );
    expect(span.startOffset).toBe(doc.startOffset - textStart);
    if (span.raw !== undefined) {
      expect(sliced, `${label} raw in chunk ${chunk.index}`).toBe(span.raw);
    }
  });
}

const ALL_DETECTIONS: MedicalChunkerConfig = {
  minTokens: 1,
  phiDetection: 'basic',
  preserveVitals: true,
  preserveMedications: true,
  detectNegations: true,
  detectTemporal: true,
  detectSeverity: true,
  plugins: [dosePlugin],
};

/** Synthetic note without sentence punctuation, forcing word-boundary splits */
const RUN_ON_NOTE = Array.from(
  { length: 12 },
  (_, i) =>
    `visit ${i} patient John Smith seen 03/15/2024 denies chest pain BP 120/80 mmHg HR 72 bpm Metoprolol 25 mg PO BID for 3 days with severe headache`
).join(' ');

const FIXTURES: Record<string, string> = {
  SIMPLE_NOTE,
  NOTE_WITH_PHI,
  LONG_NOTE,
  NOTE_WITH_NEGATIONS,
  VITALS_VARIATIONS,
  NOTE_WITH_MEDICATIONS,
  RUN_ON_NOTE,
  REPEATED_NEGATIONS:
    'Patient denies chest pain. '.repeat(40) +
    'No fever noted. BP 120/80. '.repeat(20),
  LONG_WITH_PHI: (NOTE_WITH_PHI + '\n\n').repeat(4) + LONG_NOTE,
};

// ============================================================================
// Tests
// ============================================================================

describe('Chunk overlap', () => {
  describe('offset invariants', () => {
    for (const [name, note] of Object.entries(FIXTURES)) {
      for (const maxTokens of [64, 128, 256]) {
        for (const overlapTokens of [0, 20, 50]) {
          it(`${name} maxTokens=${maxTokens} overlap=${overlapTokens}`, () => {
            const normalized = normalizeText(note);
            const chunker = new MedicalChunker({
              ...ALL_DETECTIONS,
              maxTokens,
              overlapTokens,
            });
            const { chunks } = chunker.chunk(note);

            const doc = {
              phi: detectPhi(normalized, 'basic'),
              vitals: detectVitals(normalized),
              negations: detectNegations(normalized),
              medications: detectMedications(normalized),
              temporal: detectTemporal(normalized),
              severity: detectSeverity(normalized),
              plugin: docPluginMatches(normalized),
            };
            const noSplit = [...doc.vitals, ...doc.medications, ...doc.phi];

            expect(chunks.length).toBeGreaterThan(0);

            chunks.forEach((chunk, i) => {
              const textStart = textStartOf(chunk, normalized);

              // chunk.text is a contiguous slice of the normalized text
              expect(chunk.text).toBe(
                normalized.slice(textStart, chunk.boundaries.end).trimEnd()
              );
              expect(normalized.includes(chunk.text)).toBe(true);

              // Counts describe the final text
              expect(chunk.metadata.charCount).toBe(chunk.text.length);
              expect(chunk.metadata.tokenCount).toBe(estimateTokens(chunk.text));
              expect(chunk.metadata.wordCount).toBe(
                chunk.text.split(/\s+/).filter(Boolean).length
              );

              const overlapStart = chunk.boundaries.overlapStart;
              if (overlapTokens === 0 || i === 0) {
                expect(overlapStart).toBeUndefined();
              }
              if (overlapStart !== undefined) {
                expect(overlapStart).toBeLessThan(chunk.boundaries.start);
                expect(overlapStart).toBeGreaterThanOrEqual(
                  chunks[i - 1].boundaries.start
                );
                // Never mid-word
                expect(
                  overlapStart === 0 || /\s/.test(normalized[overlapStart - 1])
                ).toBe(true);
                expect(/\s/.test(normalized[overlapStart])).toBe(false);
                // Never inside a vital, medication or PHI span
                for (const s of noSplit) {
                  const inside =
                    overlapStart > s.startOffset && overlapStart < s.endOffset;
                  expect(inside, `overlap starts inside "${normalized.slice(s.startOffset, s.endOffset)}"`).toBe(false);
                }
              }

              // Every offset-bearing field is aligned with chunk.text
              expect(chunk.hasPhi).toBe(chunk.phiMarkers.length > 0);
              expectSpansAligned('phi', chunk, chunk.phiMarkers, doc.phi, normalized);
              expectSpansAligned('vitals', chunk, chunk.metadata.vitals, doc.vitals, normalized);
              expectSpansAligned('negations', chunk, chunk.metadata.negations, doc.negations, normalized);
              expectSpansAligned('medications', chunk, chunk.metadata.medications, doc.medications, normalized);
              expectSpansAligned('temporal', chunk, chunk.metadata.temporal, doc.temporal, normalized);
              expectSpansAligned('severity', chunk, chunk.metadata.severity, doc.severity, normalized);
              expectSpansAligned(
                'plugin',
                chunk,
                chunk.metadata.pluginPatterns?.[dosePlugin.id],
                doc.plugin,
                normalized
              );
              expectSpansAligned(
                'allPatternMatches',
                chunk,
                chunk.metadata.allPatternMatches,
                doc.plugin,
                normalized
              );
            });
          });
        }
      }
    }

    it('produces overlap on multi-chunk notes', () => {
      const chunker = new MedicalChunker({ ...ALL_DETECTIONS, maxTokens: 128 });
      const { chunks } = chunker.chunk(LONG_NOTE);
      expect(chunks.length).toBeGreaterThan(1);
      expect(
        chunks.some((c) => c.boundaries.overlapStart !== undefined)
      ).toBe(true);
    });

    it('keeps core boundaries independent of overlap', () => {
      for (const note of Object.values(FIXTURES)) {
        const base = new MedicalChunker({ ...ALL_DETECTIONS, maxTokens: 128, overlapTokens: 0 });
        const withOverlap = base.withConfig({ overlapTokens: 50 });
        const a = base.chunk(note).chunks.map((c) => [c.boundaries.start, c.boundaries.end, c.boundaries.splitReason]);
        const b = withOverlap.chunk(note).chunks.map((c) => [c.boundaries.start, c.boundaries.end, c.boundaries.splitReason]);
        expect(b).toEqual(a);
      }
    });
  });

  describe('reported repro', () => {
    it('aligns negation offsets in overlapped chunks', () => {
      const text =
        'Patient denies chest pain. '.repeat(40) +
        'No fever noted. BP 120/80. '.repeat(20);
      const chunker = new MedicalChunker({ maxTokens: 128, detectNegations: true });
      const { chunks } = chunker.chunk(text);

      expect(chunks.length).toBeGreaterThan(1);
      expect(chunks[1].boundaries.overlapStart).toBeDefined();
      for (const chunk of chunks) {
        for (const n of chunk.metadata.negations ?? []) {
          const span = chunk.text.slice(n.startOffset, n.endOffset);
          expect(span).toContain(n.negatedText);
          expect(span).toMatch(/chest pain|fever/);
        }
      }
    });
  });

  describe('PHI in the overlap region', () => {
    it('sets hasPhi and reports the marker', () => {
      const filler = 'The patient tolerated the procedure well and remains stable. ';
      const text =
        filler.repeat(7) +
        'Follow-up phone (555) 123-4567 was given. ' +
        filler.repeat(10);
      const normalized = normalizeText(text);
      const phoneStart = normalized.indexOf('(555) 123-4567');

      const config: MedicalChunkerConfig = {
        maxTokens: 128,
        minTokens: 1,
        overlapTokens: 50,
      };
      const { chunks } = new MedicalChunker(config).chunk(text);

      // The phone number sits in the core of one chunk and in the overlap of the next
      const target = chunks.find(
        (c) =>
          c.boundaries.overlapStart !== undefined &&
          c.boundaries.overlapStart <= phoneStart &&
          phoneStart < c.boundaries.start
      );
      expect(target, 'a chunk whose overlap contains the phone').toBeDefined();

      // Without overlap, that chunk's core holds no PHI
      const core = new MedicalChunker({ ...config, overlapTokens: 0 })
        .chunk(text)
        .chunks.find((c) => c.boundaries.start === target!.boundaries.start)!;
      expect(core.hasPhi).toBe(false);

      expect(target!.hasPhi).toBe(true);
      const phone = target!.phiMarkers.find((m) => m.type === 'phone');
      expect(phone).toBeDefined();
      expect(target!.text.slice(phone!.startOffset, phone!.endOffset)).toContain(
        '123-4567'
      );
    });
  });

  describe('overlap start snapping', () => {
    it('never starts mid-word or inside a vital/medication', () => {
      const text = 'BP 120/80 mmHg HR 72 bpm Metoprolol 25 mg PO BID O2 sat 98% on room air '.repeat(30);
      const normalized = normalizeText(text);
      const spans = [...detectVitals(normalized), ...detectMedications(normalized)];
      for (const maxTokens of [32, 64, 128]) {
        for (const overlapTokens of [5, 13, 20, 31]) {
          const { chunks } = new MedicalChunker({
            maxTokens,
            minTokens: 1,
            overlapTokens,
          }).chunk(text);
          for (const c of chunks) {
            const start = c.boundaries.overlapStart;
            if (start === undefined) continue;
            expect(start === 0 || normalized[start - 1] === ' ').toBe(true);
            for (const s of spans) {
              expect(start > s.startOffset && start < s.endOffset).toBe(false);
            }
          }
        }
      }
    });

    describe('findOverlapStart', () => {
      const text = 'Alpha beta gamma. Delta epsilon zeta eta';
      //            0123456789012345678901234567890123456789

      it('prefers the earliest sentence start in the window', () => {
        expect(findOverlapStart(text, 2, 36, [])).toBe(18); // "Delta"
      });

      it('snaps a mid-word start forward to the next word', () => {
        expect(findOverlapStart(text, 20, 36, [])).toBe(24); // "epsilon"
      });

      it('moves out of a blocked range to its end, then to a word start', () => {
        // "epsilon zeta" blocked: 24..36
        expect(findOverlapStart(text, 20, 40, [{ start: 22, end: 36 }])).toBe(37);
      });

      it('falls back to a word start when the sentence start is blocked', () => {
        expect(findOverlapStart(text, 2, 40, [{ start: 15, end: 20 }])).toBe(6); // "beta"
      });

      it('returns the limit when no clean start exists', () => {
        expect(findOverlapStart(text, 19, 23, [])).toBe(23);
        expect(findOverlapStart(text, 30, 30, [])).toBe(30);
      });
    });
  });

  describe('overlapTokens: 0', () => {
    it('produces contiguous core chunks without overlapStart', () => {
      const normalized = normalizeText(LONG_NOTE);
      const { chunks } = new MedicalChunker({
        maxTokens: 64,
        minTokens: 1,
        overlapTokens: 0,
      }).chunk(LONG_NOTE);

      expect(chunks.length).toBeGreaterThan(1);
      chunks.forEach((c, i) => {
        expect(c.boundaries.overlapStart).toBeUndefined();
        expect(c.text).toBe(normalized.slice(c.boundaries.start, c.boundaries.end).trim());
        if (i > 0) expect(c.boundaries.start).toBe(chunks[i - 1].boundaries.end);
      });
    });
  });

  describe('plugins', () => {
    it('aligns plugin pattern offsets and runs onChunkCreated on the final chunk', () => {
      const seen: MedicalChunk[] = [];
      const plugin: PatternPlugin = {
        ...dosePlugin,
        onChunkCreated(chunk) {
          seen.push(chunk);
          return chunk;
        },
      };
      const text = 'Patient takes aspirin 81 mg and lisinopril 10 mg daily. '.repeat(30);
      const { chunks } = new MedicalChunker({
        plugins: [plugin],
        maxTokens: 64,
        minTokens: 1,
        overlapTokens: 30,
      }).chunk(text);

      expect(chunks.some((c) => c.boundaries.overlapStart !== undefined)).toBe(true);
      expect(seen).toEqual(chunks);
      for (const c of chunks) {
        const matches = c.metadata.allPatternMatches ?? [];
        expect(matches.length).toBeGreaterThan(0);
        for (const m of matches) {
          expect(c.text.slice(m.startOffset, m.endOffset)).toBe(m.raw);
        }
        for (const m of c.metadata.pluginPatterns?.[dosePlugin.id] ?? []) {
          expect(c.text.slice(m.startOffset, m.endOffset)).toBe(m.raw);
        }
      }
    });
  });
});
