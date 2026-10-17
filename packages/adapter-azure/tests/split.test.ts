import { describe, it, expect } from 'vitest';
import { batchSegments, splitText } from '../src/split';

describe('splitText', () => {
  it('returns one segment when within the limit', () => {
    expect(splitText('short text', 100)).toEqual([{ text: 'short text', offset: 0 }]);
    expect(splitText('', 100)).toEqual([{ text: '', offset: 0 }]);
  });

  it('prefers paragraph, then line, then sentence breaks, then a hard cut', () => {
    expect(splitText('aaaa\n\nbbb\nccc', 10).map((s) => s.text)).toEqual(['aaaa\n\n', 'bbb\nccc']);
    expect(splitText('aaaa\nbbb. cccccc', 10).map((s) => s.text)).toEqual(['aaaa\n', 'bbb. ', 'cccccc']);
    expect(splitText('aaa. bbbbbbbbbb', 10).map((s) => s.text)).toEqual(['aaa. ', 'bbbbbbbbbb']);
    expect(splitText('abcdefghijklmnop', 10).map((s) => s.text)).toEqual(['abcdefghij', 'klmnop']);
  });

  it('is contiguous with correct offsets', () => {
    const text = 'Line one.\nLine two is longer. More.\n\nPara two.\n'.repeat(20);
    const segs = splitText(text, 37);
    expect(segs.map((s) => s.text).join('')).toBe(text);
    for (const s of segs) {
      expect(s.text.length).toBeLessThanOrEqual(37);
      expect(text.slice(s.offset, s.offset + s.text.length)).toBe(s.text);
    }
  });

  it('never splits a surrogate pair on a hard cut', () => {
    const text = 'abcdefghi\u{1F600}xyz';
    const segs = splitText(text, 10);
    expect(segs.map((s) => s.text)).toEqual(['abcdefghi', '\u{1F600}xyz']);
  });

  it('rejects invalid limits', () => {
    expect(() => splitText('x', 1)).toThrow(RangeError);
  });
});

describe('batchSegments', () => {
  const seg = (n: number) => ({ text: 'x'.repeat(n), offset: 0 });

  it('caps documents per batch', () => {
    const batches = batchSegments(Array.from({ length: 30 }, () => seg(1)), 25, 1000);
    expect(batches.map((b) => b.length)).toEqual([25, 5]);
  });

  it('caps characters per batch', () => {
    const batches = batchSegments([seg(60), seg(50), seg(40)], 25, 100);
    expect(batches.map((b) => b.map((s) => s.text.length))).toEqual([[60], [50, 40]]);
  });
});
