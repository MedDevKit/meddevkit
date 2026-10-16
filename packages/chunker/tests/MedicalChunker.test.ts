import { describe, it, expect } from 'vitest';
import { MedicalChunker } from '../src/MedicalChunker';
import {
  SIMPLE_NOTE,
  NOTE_WITH_PHI,
  LONG_NOTE,
  NOTE_WITH_NEGATIONS,
  NOTE_WITH_MEDICATIONS,
} from './fixtures/sample-notes';

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
});
