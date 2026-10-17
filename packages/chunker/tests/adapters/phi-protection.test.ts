import { describe, it, expect } from 'vitest';
import {
  MaskingPhiProtector,
  buildMask,
  normalizePhiSpans,
  phiMarkersToSpans,
  type PhiSpan,
} from '../../src/adapters/phi-protection';
import { detectPhi } from '../../src/patterns/phi';

const protector = new MaskingPhiProtector();

describe('MaskingPhiProtector', () => {
  it('is named "mask"', () => {
    expect(protector.name).toBe('mask');
  });

  it('replaces a span with a same-length padded label', async () => {
    const text = 'MRN: 12345678 seen today';
    const spans: PhiSpan[] = [{ type: 'mrn', startOffset: 0, endOffset: 13 }];
    const result = await protector.protect(text, spans);

    expect(result.text).toHaveLength(text.length);
    expect(result.text).toBe('[MRN]________ seen today');
    expect(result.protectedSpans).toEqual([{ start: 0, end: 13 }]);
  });

  it('uses the uppercase PHI type as label, exact fit has no padding', async () => {
    const text = 'call 555-1234 now';
    const padded = await protector.protect(text, [
      { type: 'phone', startOffset: 5, endOffset: 13 },
    ]);
    expect(padded.text).toBe('call [PHONE]_ now');

    const exact = await protector.protect('id 1234567 x', [
      { type: 'phone', startOffset: 3, endOffset: 10 },
    ]);
    expect(exact.text).toBe('id [PHONE] x');
  });

  it('fills spans shorter than the label with underscores', async () => {
    const text = 'age 93 yo';
    const result = await protector.protect(text, [
      { type: 'age_over_89', startOffset: 4, endOffset: 6 },
    ]);
    expect(result.text).toBe('age __ yo');
  });

  it('labels multi-word PHI types', () => {
    expect(buildMask('x'.repeat(15), 'age_over_89')).toBe('[AGE_OVER_89]__');
  });

  it('preserves newlines inside a span and keeps line structure', async () => {
    const text = 'Address: 123 Main Street\nSpringfield\nnext line';
    const end = text.indexOf('\nnext');
    const result = await protector.protect(text, [
      { type: 'address', startOffset: 0, endOffset: end },
    ]);

    expect(result.text).toHaveLength(text.length);
    expect(result.text.split('\n')).toHaveLength(text.split('\n').length);
    const [first, second, third] = result.text.split('\n');
    expect(first).toBe('[ADDRESS]'.padEnd('Address: 123 Main Street'.length, '_'));
    expect(second).toBe('_'.repeat('Springfield'.length));
    expect(third).toBe('next line');
  });

  it('places the label in the first line segment long enough to hold it', () => {
    expect(buildMask('Jo\nSmithsonian', 'name')).toBe('__\n[NAME]_____');
    expect(buildMask('ab\r\ncd', 'ssn')).toBe('__\r\n__');
  });

  it('has an identity offset map', async () => {
    const text = 'SSN 123-45-6789 and more';
    const result = await protector.protect(text, [
      { type: 'ssn', startOffset: 0, endOffset: 15 },
    ]);
    for (const offset of [0, 5, 15, 16, text.length]) {
      expect(result.toOriginalOffset(offset)).toBe(offset);
    }
    expect(result.restore).toBeUndefined();
  });

  it('merges overlapping spans into one mask (earliest type wins)', async () => {
    const text = 'Contact: 555-123-4567 today';
    const result = await protector.protect(text, [
      { type: 'phone', startOffset: 9, endOffset: 21 },
      { type: 'name', startOffset: 0, endOffset: 12 },
    ]);
    expect(result.protectedSpans).toEqual([{ start: 0, end: 21 }]);
    expect(result.text).toBe('[NAME]_______________ today');
    expect(result.text).toHaveLength(text.length);
  });

  it('keeps adjacent spans separate', async () => {
    const text = 'aaaaaaaabbbbbbbb';
    const result = await protector.protect(text, [
      { type: 'mrn', startOffset: 0, endOffset: 8 },
      { type: 'ssn', startOffset: 8, endOffset: 16 },
    ]);
    expect(result.protectedSpans).toEqual([
      { start: 0, end: 8 },
      { start: 8, end: 16 },
    ]);
    expect(result.text).toBe('[MRN]___[SSN]___');
  });

  it('returns text unchanged when there is no PHI', async () => {
    const text = 'BP 120/80 mmHg, no chest pain';
    const result = await protector.protect(text, []);
    expect(result.text).toBe(text);
    expect(result.protectedSpans).toEqual([]);
  });

  it('clamps out-of-range spans and ignores empty ones', async () => {
    const text = 'abcdefghij';
    const result = await protector.protect(text, [
      { type: 'mrn', startOffset: -5, endOffset: 3 },
      { type: 'ssn', startOffset: 5, endOffset: 5 },
      { type: 'date', startOffset: 8, endOffset: 99 },
    ]);
    expect(result.text).toBe('___defgh__');
    expect(result.protectedSpans).toEqual([
      { start: 0, end: 3 },
      { start: 8, end: 10 },
    ]);
  });

  it('removes synthetic PHI found by detectPhi', async () => {
    const text = 'MRN: 98765432. Phone: 555-867-5309. SSN 078-05-1120. Denies fever.';
    const spans = phiMarkersToSpans(detectPhi(text));
    const result = await protector.protect(text, spans);

    expect(result.text).toHaveLength(text.length);
    expect(result.text).not.toContain('98765432');
    expect(result.text).not.toContain('555-867-5309');
    expect(result.text).not.toContain('078-05-1120');
    expect(result.text).toContain('Denies fever.');
  });

  it('rejects when the signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      protector.protect('text', [], { signal: controller.signal })
    ).rejects.toThrow();
  });
});

describe('phiMarkersToSpans', () => {
  it('copies type and offsets, dropping confidence', () => {
    expect(
      phiMarkersToSpans([{ type: 'email', startOffset: 2, endOffset: 9, confidence: 0.95 }])
    ).toEqual([{ type: 'email', startOffset: 2, endOffset: 9 }]);
  });
});

describe('normalizePhiSpans', () => {
  it('sorts and merges nested spans', () => {
    expect(
      normalizePhiSpans(
        [
          { type: 'date', startOffset: 10, endOffset: 12 },
          { type: 'mrn', startOffset: 0, endOffset: 4 },
          { type: 'ssn', startOffset: 1, endOffset: 2 },
        ],
        20
      )
    ).toEqual([
      { type: 'mrn', startOffset: 0, endOffset: 4 },
      { type: 'date', startOffset: 10, endOffset: 12 },
    ]);
  });
});
