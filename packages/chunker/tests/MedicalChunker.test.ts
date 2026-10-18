import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MedicalChunker } from '../src/MedicalChunker';
import { normalizeText } from '../src/utils';
import { estimateTokens } from '../src/tokenizer';
import type { MedicalChunk, MedicalChunkerConfig } from '../src/types';
import {
  SIMPLE_NOTE,
  NOTE_WITH_PHI,
  LONG_NOTE,
  NOTE_WITH_NEGATIONS,
  NOTE_WITH_MEDICATIONS,
  VITALS_VARIATIONS,
} from './fixtures/sample-notes';

// ============================================================================
// Coverage helpers (no text may be lost between chunks)
// ============================================================================

const nonWs = (s: string): string => s.replace(/\s+/g, '');

/**
 * Non-whitespace text of a chunk's core (chunk.text minus its overlap
 * prefix), taken from chunk.text itself
 */
function coreNonWs(normalized: string, chunk: MedicalChunk): string {
  const text = nonWs(chunk.text);
  const { overlapStart, start } = chunk.boundaries;
  if (overlapStart === undefined) return text;
  const overlap = nonWs(normalized.slice(overlapStart, start));
  expect(text.startsWith(overlap)).toBe(true);
  return text.slice(overlap.length);
}

/**
 * Chunk cores tile the normalized text in order, their concatenation holds
 * every non-whitespace character, and ids/indexes are sequential
 */
function expectFullCoverage(raw: string, config: MedicalChunkerConfig): MedicalChunk[] {
  const normalized = normalizeText(raw);
  const { chunks } = new MedicalChunker(config).chunk(raw);
  const label = JSON.stringify(config);

  expect(chunks.length, label).toBeGreaterThan(0);
  expect(chunks[0].boundaries.start, label).toBe(0);
  expect(chunks[chunks.length - 1].boundaries.end, label).toBe(normalized.length);
  chunks.forEach((chunk, i) => {
    expect(chunk.index, label).toBe(i);
    expect(chunk.id.startsWith(`chunk_${i}_`), label).toBe(true);
    if (i > 0) {
      expect(chunk.boundaries.start, `${label} chunk ${i}`).toBe(
        chunks[i - 1].boundaries.end
      );
    }
    for (const m of chunk.phiMarkers) {
      expect(m.startOffset, label).toBeGreaterThanOrEqual(0);
      expect(m.endOffset, label).toBeLessThanOrEqual(chunk.text.length);
    }
  });
  expect(chunks.map((c) => coreNonWs(normalized, c)).join(''), label).toBe(
    nonWs(normalized)
  );
  return chunks;
}

/** Synthetic note: a one-line ALLERGIES section between two long sections */
const SHORT_SECTION_NOTE = `HISTORY OF PRESENT ILLNESS:
Mr. Doe is a 58-year-old man who presents with two weeks of intermittent substernal chest pressure. The pressure is brought on by climbing stairs and resolves with rest within five minutes. He reports mild dyspnea on exertion but no syncope. He has a history of hypertension and hyperlipidemia. He quit smoking ten years ago. His father had a myocardial infarction at age 60. He has been taking his medications as prescribed and checks his blood pressure at home most mornings.

ALLERGIES: NKDA.

PHYSICAL EXAM:
Vitals: BP 142/88 mmHg, HR 78 bpm, RR 16, T 98.4°F, O2 sat 97% on room air. General: well appearing, in no acute distress. Neck: no jugular venous distension. Cardiac: regular rate and rhythm, no murmurs, rubs or gallops. Lungs: clear to auscultation bilaterally without wheezes or crackles. Extremities: no edema, distal pulses intact and symmetric. Neuro: alert and oriented, no focal deficits noted on exam today.`;

/** Small deterministic PRNG (mulberry32) for generated notes */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const GEN_HEADERS = [
  'CHIEF COMPLAINT:',
  'HISTORY OF PRESENT ILLNESS:',
  'ALLERGIES:',
  'MEDICATIONS:',
  'SOCIAL HISTORY:',
  'REVIEW OF SYSTEMS:',
  'PHYSICAL EXAM:',
  'RESULTS:',
  'ASSESSMENT:',
  'PLAN:',
];
const GEN_SENTENCES = [
  'NKDA.',
  'Denies fever or chills.',
  'BP 128/82 mmHg, HR 72 bpm, O2 sat 98%.',
  'Metoprolol 25 mg PO BID.',
  'Lisinopril 10 mg daily.',
  'Patient reports intermittent chest pain for three days.',
  'No shortness of breath, nausea or diaphoresis.',
  'Lungs clear to auscultation bilaterally.',
  'Follow up in two weeks or sooner if symptoms worsen.',
  'Seen on 03/14/2024, MRN: 12345678.',
  'Abdomen soft, nontender, nondistended, normal bowel sounds in all quadrants.',
];

/** Generated note: random sections, some a single short sentence */
function generateNote(seed: number): string {
  const rand = rng(seed);
  const pick = <T>(list: T[]): T => list[Math.floor(rand() * list.length)];
  const sections: string[] = [];
  const sectionCount = 3 + Math.floor(rand() * 8);
  for (let s = 0; s < sectionCount; s++) {
    // About a third of sections hold a single sentence
    const sentenceCount = rand() < 0.35 ? 1 : 2 + Math.floor(rand() * 12);
    const body = Array.from({ length: sentenceCount }, () => pick(GEN_SENTENCES));
    const sep = rand() < 0.5 ? ' ' : '\n';
    sections.push(`${pick(GEN_HEADERS)}${sep}${body.join(rand() < 0.7 ? ' ' : '\n')}`);
  }
  return sections.join(rand() < 0.5 ? '\n\n' : '\n');
}

describe('MedicalChunker', () => {
  describe('Basic Chunking', () => {
    it('should chunk text respecting maxTokens', () => {
      const chunker = new MedicalChunker({ maxTokens: 100 });
      const result = chunker.chunk(LONG_NOTE);

      expect(result.chunks.length).toBeGreaterThan(1);
      result.chunks.forEach((chunk) => {
        // Allow some buffer for token estimation
        expect(chunk.metadata.tokenCount).toBeLessThanOrEqual(150);
      });
    });

    it('should return single chunk for short text', () => {
      const chunker = new MedicalChunker({ maxTokens: 512 });
      const result = chunker.chunk('Patient presents with cough.');

      expect(result.chunks).toHaveLength(1);
      expect(result.chunks[0].text).toBe('Patient presents with cough.');
    });

    it('should return multiple chunks for long text', () => {
      const text = 'It is a long established fact that a reader will be distracted by the readable content of a page when looking at its layout. The point of using Lorem Ipsum is that it has a more-or-less normal distribution of letters, as opposed to using Content here, content here, making it look like readable English. Many desktop publishing packages and web page editors now use Lorem Ipsum as their default model text, and a search for \'lorem ipsum\' will uncover many web sites still in their infancy. Various versions have evolved over the years, sometimes by accident, sometimes on purpose (injected humour and the like.'
      const chunker = new MedicalChunker({ maxTokens: 100 });
      const result = chunker.chunk(text)

      console.log(result.chunks[1].text);
      expect(result.chunks).toHaveLength(2);
    });

    it('should handle empty text', () => {
      const chunker = new MedicalChunker();
      const result = chunker.chunk('');

      expect(result.chunks).toHaveLength(0);
      expect(result.metadata.totalChunks).toBe(0);
    });

    it('should preserve vital signs across chunks', () => {
      const chunker = new MedicalChunker({
        maxTokens: 50,
        overlapTokens: 0,
        preserveVitals: true,
      });

      const text =
        'Patient stable. Vitals: BP 120/80 mmHg measured today. Continue monitoring.';
      const result = chunker.chunk(text);

      // BP should not be split
      const bpChunk = result.chunks.find((c) => c.text.includes('BP'));
      expect(bpChunk?.text).toContain('120/80');
      expect(bpChunk?.text).toContain('mmHg');
    });
  });

  describe('PHI Detection', () => {
    it('should flag chunks with potential PHI', () => {
      const chunker = new MedicalChunker({ phiDetection: 'basic' });
      const result = chunker.chunk(NOTE_WITH_PHI);

      expect(result.metadata.containsPhi).toBe(true);
      expect(result.chunks.some((c) => c.hasPhi)).toBe(true);
    });

    it('should identify PHI markers by type', () => {
      const chunker = new MedicalChunker({ phiDetection: 'basic' });
      const result = chunker.chunk(NOTE_WITH_PHI);

      const allPhiTypes = result.chunks.flatMap((c) =>
        c.phiMarkers.map((m) => m.type)
      );
      expect(allPhiTypes).toContain('email');
      expect(allPhiTypes).toContain('phone');
      expect(allPhiTypes).toContain('mrn');
    });

    it('should not detect PHI when disabled', () => {
      const chunker = new MedicalChunker({ phiDetection: 'none' });
      const result = chunker.chunk(NOTE_WITH_PHI);

      expect(result.metadata.containsPhi).toBe(false);
      result.chunks.forEach((chunk) => {
        expect(chunk.hasPhi).toBe(false);
        expect(chunk.phiMarkers).toHaveLength(0);
      });
    });
  });

  describe('Section Awareness', () => {
    it('should detect clinical sections', () => {
      const chunker = new MedicalChunker({ preserveSections: true });
      const result = chunker.chunk(SIMPLE_NOTE);

      expect(result.metadata.sectionsDetected).toContain('chief_complaint');
      expect(result.metadata.sectionsDetected).toContain('hpi');
      expect(result.metadata.sectionsDetected).toContain('assessment');
    });

    it('should prefer section boundaries for splitting', () => {
      const chunker = new MedicalChunker({
        maxTokens: 150,
        preserveSections: true,
      });
      const result = chunker.chunk(LONG_NOTE);

      // Check that some chunks end at section boundaries
      const sectionBoundarySplits = result.chunks.filter(
        (c) => c.boundaries.splitReason === 'section_boundary'
      );
      expect(sectionBoundarySplits.length).toBeGreaterThan(0);
    });
  });

  describe('Negation Detection', () => {
    it('should detect negations when enabled', () => {
      const chunker = new MedicalChunker({ detectNegations: true });
      const result = chunker.chunk(NOTE_WITH_NEGATIONS);

      const negationsFound = result.chunks.some(
        (c) => c.metadata.negations && c.metadata.negations.length > 0
      );
      expect(negationsFound).toBe(true);
    });

    it('should not detect negations when disabled', () => {
      const chunker = new MedicalChunker({ detectNegations: false });
      const result = chunker.chunk(NOTE_WITH_NEGATIONS);

      result.chunks.forEach((chunk) => {
        expect(chunk.metadata.negations).toBeUndefined();
      });
    });
  });

  describe('Medication Preservation', () => {
    const SPLIT_TEXT =
      'Patient seen in clinic today and the plan was reviewed with her in detail then continue Metoprolol 25 mg PO BID and recheck pressure at the next visit in clinic';

    it('should preserve medications by default', () => {
      expect(new MedicalChunker().getConfig().preserveMedications).toBe(true);
    });

    it('should attach medications with chunk-relative offsets', () => {
      const chunker = new MedicalChunker({ maxTokens: 512 });
      const result = chunker.chunk(NOTE_WITH_MEDICATIONS);

      const meds = result.chunks.flatMap((c) =>
        (c.metadata.medications ?? []).map((m) => ({ chunk: c, m }))
      );
      expect(meds.map(({ m }) => m.name)).toEqual([
        'Metoprolol',
        'Aspirin',
        'Albuterol',
        'Insulin glargine',
      ]);
      for (const { chunk, m } of meds) {
        const absStart = chunk.boundaries.start + m.startOffset;
        const absEnd = chunk.boundaries.start + m.endOffset;
        expect(NOTE_WITH_MEDICATIONS.slice(absStart, absEnd)).toBe(m.raw);
      }
      expect(meds[0].m).toMatchObject({ dose: 25, unit: 'mg', route: 'oral', frequency: 'BID' });
    });

    it('should use offsets relative to a later chunk start', () => {
      const chunker = new MedicalChunker({
        maxTokens: 25,
        minTokens: 1,
        overlapTokens: 0,
      });
      const result = chunker.chunk(SPLIT_TEXT);
      const medChunk = result.chunks.find((c) => c.metadata.medications);

      expect(medChunk).toBeDefined();
      expect(medChunk!.boundaries.start).toBeGreaterThan(0);
      const [med] = medChunk!.metadata.medications!;
      expect(
        SPLIT_TEXT.slice(
          medChunk!.boundaries.start + med.startOffset,
          medChunk!.boundaries.start + med.endOffset
        )
      ).toBe('Metoprolol 25 mg PO BID');
    });

    it('should never split a medication across chunks', () => {
      const chunker = new MedicalChunker({
        maxTokens: 25,
        minTokens: 1,
        overlapTokens: 0,
        preserveMedications: true,
      });
      const result = chunker.chunk(SPLIT_TEXT);

      const medChunk = result.chunks.find((c) => c.text.includes('Metoprolol'));
      expect(medChunk?.text).toContain('Metoprolol 25 mg PO BID');
    });

    it('should split inside the medication when preservation is disabled', () => {
      const chunker = new MedicalChunker({
        maxTokens: 25,
        minTokens: 1,
        overlapTokens: 0,
        preserveMedications: false,
      });
      const result = chunker.chunk(SPLIT_TEXT);

      const medChunk = result.chunks.find((c) => c.text.includes('Metoprolol'));
      expect(medChunk?.text).not.toContain('Metoprolol 25 mg PO BID');
      result.chunks.forEach((c) => expect(c.metadata.medications).toBeUndefined());
      expect(result.metadata.medicationsDetected).toBe(0);
    });

    it('should keep every LONG_NOTE medication intact at small maxTokens', () => {
      const chunker = new MedicalChunker({
        maxTokens: 30,
        minTokens: 1,
        overlapTokens: 0,
      });
      const result = chunker.chunk(LONG_NOTE);

      for (const med of [
        'Metformin 1000mg twice daily',
        'Lisinopril 20mg daily',
        'Atorvastatin 40mg daily',
        'Levothyroxine 75mcg daily',
        'Acetaminophen 650mg as needed',
      ]) {
        expect(result.chunks.some((c) => c.text.includes(med)), med).toBe(true);
      }
      expect(result.metadata.medicationsDetected).toBe(5);
    });
  });

  describe('Temporal and Severity Detection', () => {
    it('should be off by default', () => {
      const chunker = new MedicalChunker();
      const result = chunker.chunk(NOTE_WITH_MEDICATIONS);

      result.chunks.forEach((chunk) => {
        expect(chunk.metadata.temporal).toBeUndefined();
        expect(chunk.metadata.severity).toBeUndefined();
      });
      expect(result.metadata.temporalDetected).toBe(0);
      expect(result.metadata.severityDetected).toBe(0);
    });

    it('should attach temporal expressions when enabled', () => {
      const chunker = new MedicalChunker({ detectTemporal: true });
      const result = chunker.chunk(NOTE_WITH_MEDICATIONS);

      const temporal = result.chunks.flatMap((c) =>
        (c.metadata.temporal ?? []).map((t) => ({ chunk: c, t }))
      );
      expect(temporal.map(({ t }) => t.raw)).toEqual([
        'for 3 days',
        'started 2 days ago',
        'intermittent',
        'since yesterday',
        'worsening',
      ]);
      for (const { chunk, t } of temporal) {
        expect(
          NOTE_WITH_MEDICATIONS.slice(
            chunk.boundaries.start + t.startOffset,
            chunk.boundaries.start + t.endOffset
          )
        ).toBe(t.raw);
      }
      expect(result.metadata.temporalDetected).toBe(5);
    });

    it('should attach severity modifiers when enabled', () => {
      const chunker = new MedicalChunker({ detectSeverity: true });
      const result = chunker.chunk(NOTE_WITH_MEDICATIONS);

      const severity = result.chunks.flatMap((c) => c.metadata.severity ?? []);
      expect(severity.map((s) => s.level)).toEqual(['severe', 'mild']);
      expect(severity[0].modifiedText).toContain('chest pain');
      expect(result.metadata.severityDetected).toBe(2);
    });
  });

  describe('Boundary Information', () => {
    it('should provide accurate boundary positions', () => {
      const chunker = new MedicalChunker({ maxTokens: 100 });
      const result = chunker.chunk(SIMPLE_NOTE);

      result.chunks.forEach((chunk) => {
        expect(chunk.boundaries.start).toBeGreaterThanOrEqual(0);
        expect(chunk.boundaries.end).toBeGreaterThan(chunk.boundaries.start);
        expect(chunk.boundaries.splitReason).toBeDefined();
      });
    });

    it('should have non-overlapping boundaries', () => {
      const chunker = new MedicalChunker({
        maxTokens: 100,
        overlapTokens: 0,
      });
      const result = chunker.chunk(LONG_NOTE);

      for (let i = 1; i < result.chunks.length; i++) {
        const prev = result.chunks[i - 1];
        const curr = result.chunks[i];
        expect(curr.boundaries.start).toBeGreaterThanOrEqual(
          prev.boundaries.end
        );
      }
    });
  });

  describe('Metadata', () => {
    it('should include accurate token counts', () => {
      const chunker = new MedicalChunker();
      const result = chunker.chunk(SIMPLE_NOTE);

      result.chunks.forEach((chunk) => {
        expect(chunk.metadata.tokenCount).toBeGreaterThan(0);
        expect(chunk.metadata.charCount).toBe(chunk.text.length);
        expect(chunk.metadata.wordCount).toBeGreaterThan(0);
      });
    });

    it('should include processing time', () => {
      const chunker = new MedicalChunker();
      const result = chunker.chunk(LONG_NOTE);

      expect(result.metadata.processingTimeMs).toBeGreaterThan(0);
    });

    it('should include vitals count', () => {
      const chunker = new MedicalChunker();
      const result = chunker.chunk(SIMPLE_NOTE);

      expect(result.metadata.vitalsDetected).toBeGreaterThan(0);
    });

    it('should include medication, temporal, and severity counts', () => {
      const chunker = new MedicalChunker({
        detectTemporal: true,
        detectSeverity: true,
      });
      const result = chunker.chunk(NOTE_WITH_MEDICATIONS);

      expect(result.metadata.medicationsDetected).toBe(4);
      expect(result.metadata.temporalDetected).toBe(5);
      expect(result.metadata.severityDetected).toBe(2);
    });

    it('should report zero counts for empty input', () => {
      const result = new MedicalChunker().chunk('');

      expect(result.metadata.medicationsDetected).toBe(0);
      expect(result.metadata.temporalDetected).toBe(0);
      expect(result.metadata.severityDetected).toBe(0);
    });
  });

  describe('Configuration', () => {
    it('should reject invalid maxTokens < minTokens', () => {
      expect(() => {
        new MedicalChunker({ maxTokens: 10, minTokens: 50 });
      }).toThrow();
    });

    it('should reject overlapTokens >= maxTokens', () => {
      expect(() => {
        new MedicalChunker({ maxTokens: 100, overlapTokens: 100 });
      }).toThrow();
    });

    it('should allow creating new instance with updated config', () => {
      const chunker = new MedicalChunker({ maxTokens: 512 });
      const newChunker = chunker.withConfig({ maxTokens: 256 });

      expect(chunker.getConfig().maxTokens).toBe(512);
      expect(newChunker.getConfig().maxTokens).toBe(256);
    });
  });

  describe('Chunk IDs', () => {
    it('should generate unique chunk IDs', () => {
      const chunker = new MedicalChunker({ maxTokens: 100 });
      const result = chunker.chunk(LONG_NOTE);

      const ids = result.chunks.map((c) => c.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });

    it('should include sequential indices', () => {
      const chunker = new MedicalChunker({ maxTokens: 100 });
      const result = chunker.chunk(LONG_NOTE);

      result.chunks.forEach((chunk, index) => {
        expect(chunk.index).toBe(index);
      });
    });
  });

  describe('Short ranges below minTokens', () => {
    it('keeps a short section between two long sections at every maxTokens', () => {
      const normalized = normalizeText(SHORT_SECTION_NOTE);
      const allergiesStart = normalized.indexOf('ALLERGIES');

      for (const maxTokens of [50, 64, 80, 100, 128, 200, 256, 512]) {
        for (const overlapTokens of [0, 20]) {
          const config = { maxTokens, minTokens: Math.min(50, maxTokens), overlapTokens };
          const chunks = expectFullCoverage(SHORT_SECTION_NOTE, config);
          const label = JSON.stringify(config);

          // "NKDA." is in exactly one chunk core
          const holders = chunks.filter((c) => coreNonWs(normalized, c).includes('NKDA.'));
          expect(holders, label).toHaveLength(1);

          // The chunk holding ALLERGIES reports the section at its start
          const holder = holders[0];
          const expected = holder.boundaries.start >= allergiesStart ? 'allergies' : 'hpi';
          expect(holder.metadata.section?.type, label).toBe(expected);

          // Vitals are never split; cores stay within maxTokens
          expect(
            chunks.some((c) => c.text.includes('BP 142/88 mmHg')),
            label
          ).toBe(true);
          for (const c of chunks) {
            const core = normalized.slice(c.boundaries.start, c.boundaries.end).trim();
            expect(estimateTokens(core), label).toBeLessThanOrEqual(maxTokens);
          }
        }
      }
    });

    it('extends a short range ending at a section boundary into the next section', () => {
      // At maxTokens 60 the range from the last HPI sentence to the PHYSICAL
      // EXAM boundary ("He has been taking ... ALLERGIES: NKDA.") estimates
      // below minTokens 40. It used to be dropped; it now extends into the
      // physical exam, up to the next sentence split within maxTokens.
      const normalized = normalizeText(SHORT_SECTION_NOTE);
      const chunks = expectFullCoverage(SHORT_SECTION_NOTE, {
        maxTokens: 60,
        minTokens: 40,
        overlapTokens: 0,
      });
      const holder = chunks.find((c) => c.text.includes('ALLERGIES: NKDA.'))!;

      expect(holder.text.startsWith('He has been taking his medications')).toBe(true);
      expect(holder.text).toContain('PHYSICAL EXAM:\nVitals: BP 142/88 mmHg');
      expect(holder.boundaries.splitReason).toBe('sentence');
      expect(holder.metadata.tokenCount).toBeGreaterThanOrEqual(40);
      expect(holder.metadata.tokenCount).toBeLessThanOrEqual(60);
      // Section at the chunk start
      expect(holder.metadata.section?.type).toBe('hpi');
      // Offsets still map back into the normalized text
      expect(
        normalized.slice(holder.boundaries.start, holder.boundaries.end).trim()
      ).toBe(holder.text);
      const bp = holder.metadata.vitals!.find((v) => v.raw.startsWith('BP'))!;
      expect(
        normalized.slice(
          holder.boundaries.start + bp.startOffset,
          holder.boundaries.start + bp.endOffset
        )
      ).toBe(bp.raw);
    });

    it('loses no text for any maxTokens/minTokens combination (fixtures and generated notes)', () => {
      const aciDir = join(__dirname, 'fixtures', 'aci-bench');
      const notes: string[] = [
        ...['D2N011', 'D2N035', 'D2N041', 'D2N062'].map((id) =>
          readFileSync(join(aciDir, `${id}.txt`), 'utf8')
        ),
        SIMPLE_NOTE,
        NOTE_WITH_PHI,
        LONG_NOTE,
        NOTE_WITH_NEGATIONS,
        NOTE_WITH_MEDICATIONS,
        VITALS_VARIATIONS,
        SHORT_SECTION_NOTE,
        ...Array.from({ length: 25 }, (_, seed) => generateNote(seed + 1)),
      ];

      for (const note of notes) {
        for (const maxTokens of [10, 16, 30, 50, 64, 128, 256]) {
          for (const minTokens of [0, 1, 10, 25, 50, 100]) {
            if (minTokens > maxTokens) continue;
            for (const overlapTokens of [0, Math.floor(maxTokens / 3)]) {
              expectFullCoverage(note, { maxTokens, minTokens, overlapTokens, phiDetection: 'basic' });
            }
          }
        }
      }
    });
  });
});
