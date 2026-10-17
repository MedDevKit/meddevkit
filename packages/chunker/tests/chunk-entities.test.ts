/**
 * chunk(text, { entities }) tests
 *
 * Entities from a clinical NLP analysis are protected from splitting (when
 * short enough) and attached to chunk metadata with offsets relative to
 * chunk.text. All notes are synthetic - no real PHI.
 */

import { describe, it, expect } from 'vitest';
import { MedicalChunker } from '../src/MedicalChunker';
import { MedicalAnalyzer } from '../src/adapters/MedicalAnalyzer';
import type { MedicalEntity } from '../src/adapters/types';
import type { ChunkingResult, MedicalChunkerConfig } from '../src/types';
import { normalizeText } from '../src/utils';
import { CONTEXT_VERSION } from '../src/plugins';
import {
  SIMPLE_NOTE,
  LONG_NOTE,
  NOTE_WITH_NEGATIONS,
  NOTE_WITH_MEDICATIONS,
} from './fixtures/sample-notes';

// ============================================================================
// Helpers
// ============================================================================

/** Build an entity for `phrase` at its `occurrence`-th position in `text` */
function entityFor(
  text: string,
  phrase: string,
  occurrence = 0,
  overrides: Partial<MedicalEntity> = {}
): MedicalEntity {
  let start = -1;
  for (let i = 0; i <= occurrence; i++) {
    start = text.indexOf(phrase, start + 1);
  }
  if (start < 0) throw new Error(`phrase not found: ${phrase}`);
  return {
    text: phrase,
    category: 'Diagnosis',
    startOffset: start,
    endOffset: start + phrase.length,
    confidence: 0.9,
    isNegated: false,
    sources: ['test'],
    ...overrides,
  };
}

/** Every phrase occurrence in text as an entity */
function entitiesForAll(text: string, phrases: string[]): MedicalEntity[] {
  const out: MedicalEntity[] = [];
  for (const phrase of phrases) {
    let idx = text.indexOf(phrase);
    while (idx >= 0) {
      out.push({
        text: phrase,
        category: 'SymptomOrSign',
        startOffset: idx,
        endOffset: idx + phrase.length,
        confidence: 0.8,
        isNegated: false,
        sources: ['test'],
      });
      idx = text.indexOf(phrase, idx + 1);
    }
  }
  return out;
}

/** Assert every entity in chunk metadata lines up with chunk.text */
function expectEntityInvariant(result: ChunkingResult): void {
  for (const chunk of result.chunks) {
    expect(chunk.metadata.entities).toBeDefined();
    for (const e of chunk.metadata.entities!) {
      expect(e.startOffset).toBeGreaterThanOrEqual(0);
      expect(e.endOffset).toBeLessThanOrEqual(chunk.text.length);
      expect(chunk.text.slice(e.startOffset, e.endOffset)).toBe(e.text);
    }
  }
}

/** True if some chunk's text contains `phrase` whole */
function someChunkContains(result: ChunkingResult, phrase: string): boolean {
  return result.chunks.some((c) => c.text.includes(phrase));
}

/** True if some chunk's core range ends strictly inside [start, end) */
function splitsInside(result: ChunkingResult, start: number, end: number): boolean {
  return result.chunks.some(
    (c) => c.boundaries.end > start && c.boundaries.end < end
  );
}

/** Strip non-deterministic fields (ids, timing) for deep comparison */
function stable(result: ChunkingResult): unknown {
  return {
    chunks: result.chunks.map(({ id: _id, ...rest }) => rest),
    metadata: { ...result.metadata, processingTimeMs: 0 },
  };
}

// Forces a split around char 80 with no sentence/paragraph boundaries,
// so the split falls back to a word boundary
const SPLIT_CONFIG: MedicalChunkerConfig = {
  maxTokens: 20, // ~80 chars
  minTokens: 1,
  overlapTokens: 0,
  preserveSections: false,
  preserveVitals: false,
  preserveMedications: false,
  phiDetection: 'none',
};

const DIAGNOSIS = 'acute exacerbation of congestive heart failure';
// Diagnosis starts at char 60, so the ~80-char split lands inside it
const SPLIT_NOTE = `${'lorem '.repeat(10)}${DIAGNOSIS} ${'ipsum '.repeat(12)}`.trim();

// ============================================================================
// Tests
// ============================================================================

describe('chunk() with entities', () => {
  describe('protection from splitting', () => {
    it('does not split a multi-word entity that a plain chunk() splits', () => {
      const chunker = new MedicalChunker(SPLIT_CONFIG);
      const text = normalizeText(SPLIT_NOTE);
      expect(text).toBe(SPLIT_NOTE);

      const entity = entityFor(text, DIAGNOSIS);
      const without = chunker.chunk(text);
      expect(without.chunks.length).toBeGreaterThan(1);
      expect(someChunkContains(without, DIAGNOSIS)).toBe(false);
      expect(splitsInside(without, entity.startOffset, entity.endOffset)).toBe(true);

      const withEntities = chunker.chunk(text, { entities: [entity] });
      expect(someChunkContains(withEntities, DIAGNOSIS)).toBe(true);
      expect(
        splitsInside(withEntities, entity.startOffset, entity.endOffset)
      ).toBe(false);

      const holder = withEntities.chunks.find((c) =>
        c.text.includes(DIAGNOSIS)
      )!;
      expect(holder.metadata.entities).toHaveLength(1);
      const e = holder.metadata.entities![0];
      expect(holder.text.slice(e.startOffset, e.endOffset)).toBe(DIAGNOSIS);
      expect(withEntities.metadata.entitiesProvided).toBe(1);
    });

    it('protects entities with overlap enabled too', () => {
      const chunker = new MedicalChunker({ ...SPLIT_CONFIG, overlapTokens: 5 });
      const text = SPLIT_NOTE;
      const entity = entityFor(text, DIAGNOSIS);
      const [s, e] = [entity.startOffset, entity.endOffset];
      expect(splitsInside(chunker.chunk(text), s, e)).toBe(true);

      const result = chunker.chunk(text, { entities: [entity] });
      expect(splitsInside(result, s, e)).toBe(false);
      expect(someChunkContains(result, DIAGNOSIS)).toBe(true);
      expectEntityInvariant(result);
      // Overlap never starts inside the entity
      for (const c of result.chunks) {
        const o = c.boundaries.overlapStart;
        if (o !== undefined) expect(o > s && o < e).toBe(false);
      }
    });

    it('plugins see entity protected ranges', () => {
      let seen: readonly { reason: string }[] = [];
      const chunker = new MedicalChunker({
        ...SPLIT_CONFIG,
        plugins: [
          {
            id: 'spy',
            name: 'Spy',
            version: '1.0.0',
            minContextVersion: CONTEXT_VERSION,
            onDocumentStart: (_doc, ctx) => {
              seen = ctx.getProtectedRanges();
            },
          },
        ],
      });
      chunker.chunk(SPLIT_NOTE, {
        entities: [entityFor(SPLIT_NOTE, DIAGNOSIS)],
      });
      expect(seen.some((r) => r.reason === 'entity')).toBe(true);
    });
  });

  describe('chunk metadata invariant', () => {
    const notes = [SIMPLE_NOTE, LONG_NOTE, NOTE_WITH_NEGATIONS, NOTE_WITH_MEDICATIONS]
      .map(normalizeText);
    const phrases = [
      'chest pain',
      'shortness of breath',
      'fever',
      'nausea',
      'headache',
      'hypertension',
      'diabetes',
      'Lisinopril',
      'Metformin',
      'BP',
      'pain',
    ];
    const configs: MedicalChunkerConfig[] = [
      { maxTokens: 30, minTokens: 1, overlapTokens: 10 },
      { maxTokens: 64, minTokens: 5, overlapTokens: 20 },
      { maxTokens: 128, minTokens: 10, overlapTokens: 50 },
      {
        maxTokens: 40,
        minTokens: 1,
        overlapTokens: 15,
        detectNegations: true,
        detectTemporal: true,
        detectSeverity: true,
      },
    ];

    for (const [ni, text] of notes.entries()) {
      for (const [ci, config] of configs.entries()) {
        it(`holds for note ${ni} with config ${ci}`, () => {
          const entities = entitiesForAll(text, phrases);
          expect(entities.length).toBeGreaterThan(0);
          const result = new MedicalChunker(config).chunk(text, { entities });
          expect(result.chunks.length).toBeGreaterThan(0);
          expectEntityInvariant(result);
          expect(result.metadata.entitiesProvided).toBe(entities.length);
          expect(result.metadata.warnings).toEqual([]);

          // Every entity is short, so protected: each one is attached to
          // at least one chunk
          const attached = new Set<string>();
          for (const chunk of result.chunks) {
            const base = chunk.boundaries.overlapStart ?? chunk.boundaries.start;
            const textStart = text.indexOf(chunk.text, base);
            for (const e of chunk.metadata.entities!) {
              attached.add(`${e.startOffset + textStart}:${e.endOffset + textStart}`);
            }
          }
          for (const e of entities) {
            expect(attached.has(`${e.startOffset}:${e.endOffset}`)).toBe(true);
          }
        });
      }
    }
  });

  describe('overlap', () => {
    it('attaches entities in the overlap region to the later chunk too', () => {
      const text = normalizeText(LONG_NOTE);
      const config: MedicalChunkerConfig = {
        maxTokens: 60,
        minTokens: 1,
        overlapTokens: 25,
      };
      const chunker = new MedicalChunker(config);

      // Pick an entity: the first word of each overlap region
      const base = chunker.chunk(text, { entities: [] });
      const withOverlap = base.chunks.find(
        (c) =>
          c.boundaries.overlapStart !== undefined &&
          c.boundaries.overlapStart < c.boundaries.start
      );
      expect(withOverlap).toBeDefined();
      const overlapStart = withOverlap!.boundaries.overlapStart!;
      const wordMatch = /^\S+/.exec(text.slice(overlapStart))!;
      const entity: MedicalEntity = {
        text: wordMatch[0],
        category: 'Other',
        startOffset: overlapStart,
        endOffset: overlapStart + wordMatch[0].length,
        confidence: 1,
        isNegated: false,
        sources: ['test'],
      };
      expect(entity.endOffset).toBeLessThanOrEqual(withOverlap!.boundaries.start);

      const result = chunker.chunk(text, { entities: [entity] });
      expectEntityInvariant(result);

      const holders = result.chunks.filter(
        (c) => c.metadata.entities!.length > 0
      );
      expect(holders.length).toBeGreaterThanOrEqual(2);
      const later = result.chunks.find((c) => c.index === withOverlap!.index)!;
      expect(later.metadata.entities).toHaveLength(1);
      expect(later.metadata.entities![0].startOffset).toBe(0);
      expect(later.text.startsWith(entity.text)).toBe(true);
    });
  });

  describe('validation', () => {
    it('ignores entities and warns when text is not normalized', () => {
      const raw = `  Patient reports   chest pain.\r\n\r\n\r\nNo fever.  `;
      const normalized = normalizeText(raw);
      expect(normalized).not.toBe(raw);
      const entity = entityFor(normalized, 'chest pain');

      const chunker = new MedicalChunker({ minTokens: 1 });
      const result = chunker.chunk(raw, { entities: [entity] });

      expect(result.metadata.warnings).toEqual([
        'entities ignored: text was not normalized; pass MedicalAnalysisResult.text',
      ]);
      expect(result.metadata.entitiesProvided).toBe(0);
      for (const chunk of result.chunks) {
        expect(chunk.metadata.entities).toEqual([]);
      }
      // Chunk text is unaffected
      expect(result.chunks.map((c) => c.text)).toEqual(
        chunker.chunk(raw).chunks.map((c) => c.text)
      );
    });

    it('skips invalid and mismatched entities with one warning, keeps valid ones', () => {
      const text = 'Patient reports chest pain and fever. Denies nausea.';
      const valid = entityFor(text, 'chest pain');
      const alsoValid = entityFor(text, 'nausea', 0, { text: '' });
      const bad: MedicalEntity[] = [
        { ...valid, startOffset: -1 },
        { ...valid, startOffset: 1.5 },
        { ...valid, endOffset: valid.startOffset },
        { ...valid, endOffset: text.length + 1 },
        { ...valid, startOffset: Number.NaN },
        { ...valid, text: 'chest PAIN' }, // text mismatch
      ];

      const result = new MedicalChunker({ minTokens: 1 }).chunk(text, {
        entities: [bad[0], valid, ...bad.slice(1), alsoValid],
      });

      expect(result.metadata.warnings).toEqual([
        '6 entities skipped: invalid offsets or text mismatch',
      ]);
      expect(result.metadata.entitiesProvided).toBe(2);
      expect(result.chunks).toHaveLength(1);
      const attached = result.chunks[0].metadata.entities!;
      expect(attached.map((e) => e.text)).toEqual(['chest pain', 'nausea']);
      expectEntityInvariant(result);
    });

    it('uses a singular warning for one skipped entity', () => {
      const text = 'Patient reports chest pain.';
      const result = new MedicalChunker({ minTokens: 1 }).chunk(text, {
        entities: [{ ...entityFor(text, 'chest pain'), endOffset: 999 }],
      });
      expect(result.metadata.warnings).toEqual([
        '1 entity skipped: invalid offsets or text mismatch',
      ]);
      expect(result.metadata.entitiesProvided).toBe(0);
    });

    it('does not mutate the caller entities', () => {
      const text = 'Assessment: community acquired pneumonia. Plan: antibiotics.';
      const entity = entityFor(text, 'community acquired pneumonia');
      const snapshot = structuredClone(entity);
      new MedicalChunker({ minTokens: 1 }).chunk(text, { entities: [entity] });
      expect(entity).toEqual(snapshot);
    });
  });

  describe('long entities (> 100 chars)', () => {
    const LONG_PHRASE =
      'chronic obstructive pulmonary disease with acute lower respiratory infection and acute exacerbation requiring admission';

    it('are not protected but are attached where fully contained', () => {
      expect(LONG_PHRASE.length).toBeGreaterThan(100);
      const config: MedicalChunkerConfig = {
        ...SPLIT_CONFIG,
        maxTokens: 50, // ~200 chars, so the phrase could fit in one chunk
      };
      const chunker = new MedicalChunker(config);

      // Placed so the ~200-char split lands inside the phrase
      const text = `${'lorem '.repeat(25)}${LONG_PHRASE} ${'ipsum '.repeat(10)}`.trim();
      const entity = entityFor(text, LONG_PHRASE);

      const result = chunker.chunk(text, { entities: [entity] });
      // Not protected: the split still lands inside it, same as without
      expect(result.chunks.map((c) => c.text)).toEqual(
        chunker.chunk(text).chunks.map((c) => c.text)
      );
      expect(someChunkContains(result, LONG_PHRASE)).toBe(false);
      expect(result.metadata.entitiesProvided).toBe(1);
      for (const chunk of result.chunks) {
        expect(chunk.metadata.entities).toEqual([]);
      }

      // Fully contained in a chunk: attached, with rebased offsets
      const contained = `Assessment: ${LONG_PHRASE}.`;
      const big = new MedicalChunker({ minTokens: 1 });
      const r2 = big.chunk(contained, {
        entities: [entityFor(contained, LONG_PHRASE)],
      });
      expect(r2.chunks).toHaveLength(1);
      expect(r2.chunks[0].metadata.entities).toHaveLength(1);
      expectEntityInvariant(r2);
    });

    it('does not create oversize chunks from entities longer than a chunk', () => {
      const chunker = new MedicalChunker({ ...SPLIT_CONFIG, maxTokens: 15 }); // ~60 chars
      const text = `${'lorem '.repeat(8)}${DIAGNOSIS} ${'ipsum '.repeat(20)}`.trim();
      // 66-char entity: under 100 but longer than a chunk, so not protected
      const phrase = `${DIAGNOSIS} ipsum ipsum ipsum`;
      const entity = entityFor(text, phrase);
      const result = chunker.chunk(text, { entities: [entity] });
      const plain = chunker.chunk(text);
      expect(splitsInside(plain, entity.startOffset, entity.endOffset)).toBe(true);
      expect(result.chunks.map((c) => c.text)).toEqual(plain.chunks.map((c) => c.text));
      expectEntityInvariant(result);
    });

    it('does not protect a cluster of overlapping entities longer than 100 chars', () => {
      const chunker = new MedicalChunker({ ...SPLIT_CONFIG, maxTokens: 50 });
      const text = `${'lorem '.repeat(25)}${LONG_PHRASE} ${'ipsum '.repeat(10)}`.trim();
      const start = text.indexOf(LONG_PHRASE);
      // Two overlapping < 100-char entities covering the whole long phrase
      const a = { ...entityFor(text, LONG_PHRASE), startOffset: start, endOffset: start + 80 };
      const b = {
        ...entityFor(text, LONG_PHRASE),
        startOffset: start + 40,
        endOffset: start + LONG_PHRASE.length,
      };
      a.text = text.slice(a.startOffset, a.endOffset);
      b.text = text.slice(b.startOffset, b.endOffset);
      expect(splitsInside(chunker.chunk(text), a.startOffset, b.endOffset)).toBe(true);
      const result = chunker.chunk(text, { entities: [a, b] });
      expect(result.chunks.map((c) => c.text)).toEqual(
        chunker.chunk(text).chunks.map((c) => c.text)
      );
      expectEntityInvariant(result);
    });
  });

  describe('no options', () => {
    const notes = [SIMPLE_NOTE, LONG_NOTE, NOTE_WITH_NEGATIONS, NOTE_WITH_MEDICATIONS];

    it('matches chunk(text, undefined) and chunk(text, {}) and adds no entities key', () => {
      const chunker = new MedicalChunker({ maxTokens: 64, minTokens: 5, overlapTokens: 20 });
      for (const note of notes) {
        const a = chunker.chunk(note);
        const b = chunker.chunk(note, undefined);
        const c = chunker.chunk(note, {});
        expect(stable(b)).toEqual(stable(a));
        expect(stable(c)).toEqual(stable(a));
        expect('entitiesProvided' in a.metadata).toBe(false);
        expect('entitiesProvided' in c.metadata).toBe(false);
        for (const chunk of [...a.chunks, ...c.chunks]) {
          expect('entities' in chunk.metadata).toBe(false);
        }
      }
    });

    it('empty entities array changes nothing but metadata', () => {
      const chunker = new MedicalChunker({ maxTokens: 64, minTokens: 5, overlapTokens: 20 });
      const text = normalizeText(LONG_NOTE);
      const plain = chunker.chunk(text);
      const empty = chunker.chunk(text, { entities: [] });
      expect(empty.chunks.map((c) => c.text)).toEqual(plain.chunks.map((c) => c.text));
      expect(empty.metadata.entitiesProvided).toBe(0);
      expect(empty.metadata.warnings).toEqual([]);
      for (const chunk of empty.chunks) {
        expect(chunk.metadata.entities).toEqual([]);
      }
    });
  });

  describe('end-to-end with MedicalAnalyzer (local only)', () => {
    const NOTE = [
      'Chief Complaint: headache',
      'HPI: Patient denies chest pain. Severe headache for 3 days.',
      'Medications: Lisinopril 10 mg PO daily, Metformin 500 mg PO BID',
      'Vitals: BP 120/80 mmHg, HR 72 bpm, Temp 98.6 F',
      'Assessment: migraine. No fever.',
      'Plan: continue Lisinopril 10 mg PO daily; follow up in 2 weeks.',
    ].join('\n');

    it('chunks analyzer output with entities attached and aligned', async () => {
      const analysis = await new MedicalAnalyzer().analyze(`  ${NOTE}\r\n`);
      expect(analysis.entities.length).toBeGreaterThan(0);

      for (const config of [
        { maxTokens: 512 },
        { maxTokens: 20, minTokens: 1, overlapTokens: 8 },
        { maxTokens: 40, minTokens: 1, overlapTokens: 15 },
      ] satisfies MedicalChunkerConfig[]) {
        const result = new MedicalChunker(config).chunk(analysis.text, {
          entities: analysis.entities,
        });
        expect(result.metadata.warnings).toEqual([]);
        expect(result.metadata.entitiesProvided).toBe(analysis.entities.length);
        expectEntityInvariant(result);
        const total = result.chunks.reduce(
          (n, c) => n + c.metadata.entities!.length,
          0
        );
        expect(total).toBeGreaterThanOrEqual(analysis.entities.length);
      }
    });

    it('warns when the raw note is passed instead of analysis.text', async () => {
      const raw = `  ${NOTE}\r\n`;
      const analysis = await new MedicalAnalyzer().analyze(raw);
      const result = new MedicalChunker().chunk(raw, {
        entities: analysis.entities,
      });
      expect(result.metadata.warnings).toContain(
        'entities ignored: text was not normalized; pass MedicalAnalysisResult.text'
      );
    });
  });
});
