import { describe, it, expect } from 'vitest';
import { MedicalChunker } from '../src/MedicalChunker';
import {
  SIMPLE_NOTE,
  NOTE_WITH_PHI,
  LONG_NOTE,
  NOTE_WITH_NEGATIONS,
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
