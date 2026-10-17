/**
 * PHI protection applied before text leaves the process
 *
 * IMPORTANT: MedDevKit's built-in PHI detection is regex-based and
 * best-effort. It finds labeled identifiers (MRN, SSN, phone, email, dates,
 * "Dr. X", "Patient: X") but misses most free-text names, locations and
 * other identifiers. Masking what it finds is NOT HIPAA de-identification
 * (neither Safe Harbor nor Expert Determination). Only send clinical text
 * to a third-party provider under an agreement (e.g. a BAA) that permits it.
 *
 * @packageDocumentation
 */

import type { PhiMarker, PhiType } from '../types';

/**
 * A span of detected PHI, in absolute offsets of the text being protected.
 */
export interface PhiSpan {
  /** PHI type */
  type: PhiType;
  /** Start offset (inclusive) */
  startOffset: number;
  /** End offset (exclusive) */
  endOffset: number;
}

/**
 * Text after PHI protection, plus the information needed to map provider
 * results back onto the original text.
 */
export interface ProtectedText {
  /**
   * The text that is sent to the provider
   */
  text: string;

  /**
   * Maps an offset in the protected text (as returned by a provider) to the
   * corresponding offset in the original text. Used for both start and
   * (exclusive) end offsets.
   */
  toOriginalOffset(offset: number): number;

  /**
   * Spans in the PROTECTED text that are placeholders. Provider entities
   * overlapping these are artifacts of protection and are dropped.
   */
  protectedSpans: { start: number; end: number }[];

  /**
   * Optional: re-identify text produced from the protected text (e.g. a
   * summary containing tokens). Only reversible protectors implement it.
   */
  restore?(text: string): Promise<string>;
}

/**
 * Replaces PHI in text before it is sent to an external provider.
 *
 * The interface is asynchronous and offset-mapping so that a future
 * reversible protector can replace PHI with session-scoped tokens kept in
 * an external key store (a "vault"): tokens have a different length than
 * the PHI they replace, so such a protector returns a non-identity
 * `toOriginalOffset` and implements `restore()` to re-identify output.
 * The built-in {@link MaskingPhiProtector} replaces PHI with same-length
 * masks, so its offset map is the identity.
 *
 * Protection is only as good as the PHI spans it is given; see the module
 * note on the limits of basic PHI detection.
 */
export interface PhiProtector {
  /** Protector name, reported as `metadata.phiPolicy` */
  readonly name: string;

  /**
   * Produce the protected text for `text`, replacing every span in `phi`.
   */
  protect(
    text: string,
    phi: PhiSpan[],
    options?: { signal?: AbortSignal }
  ): Promise<ProtectedText>;
}

/**
 * What the analyzer does with detected PHI before calling a provider.
 * - `'mask'`: replace detected PHI with same-length masks
 *   ({@link MaskingPhiProtector}) — the default
 * - `'send'`: send the normalized text unchanged
 * - `'block'`: if any PHI is detected, do not call providers at all
 * - a {@link PhiProtector}: custom protection (e.g. a token vault)
 *
 * Detection is regex/best-effort and misses most names; `'mask'` reduces
 * exposure but is NOT HIPAA de-identification.
 */
export type PhiPolicy = 'mask' | 'send' | 'block' | PhiProtector;

/**
 * Convert PHI markers from `detectPhi(text)` into PHI spans. `detectPhi`
 * offsets are relative to the text it was given, so passing the same text
 * to the protector yields absolute spans.
 */
export function phiMarkersToSpans(markers: PhiMarker[]): PhiSpan[] {
  return markers.map((m) => ({
    type: m.type,
    startOffset: m.startOffset,
    endOffset: m.endOffset,
  }));
}

/**
 * Clamp spans to the text, drop empty ones, sort, and merge overlapping
 * spans (a merged span keeps the type of its earliest span). Adjacent
 * spans (one ends where the next starts) stay separate.
 */
export function normalizePhiSpans(
  spans: PhiSpan[],
  textLength: number
): PhiSpan[] {
  const clamped = spans
    .map((s) => ({
      type: s.type,
      startOffset: Math.max(0, Math.min(textLength, Math.floor(s.startOffset))),
      endOffset: Math.max(0, Math.min(textLength, Math.floor(s.endOffset))),
    }))
    .filter((s) => s.endOffset > s.startOffset)
    .sort((a, b) => a.startOffset - b.startOffset || b.endOffset - a.endOffset);

  const merged: PhiSpan[] = [];
  for (const span of clamped) {
    const last = merged[merged.length - 1];
    if (last && span.startOffset < last.endOffset) {
      last.endOffset = Math.max(last.endOffset, span.endOffset);
    } else {
      merged.push({ ...span });
    }
  }
  return merged;
}

/**
 * Build the same-length mask for one span of text.
 *
 * Line breaks inside the span are kept so the protected text has the same
 * length and line structure. The `[TYPE]` label (uppercase PHI type) goes
 * in the first line segment long enough to hold it, right-padded with `_`;
 * every other character becomes `_`.
 */
export function buildMask(original: string, type: PhiType): string {
  const label = `[${type.toUpperCase()}]`;
  let labelPlaced = false;
  return original
    .split(/(\r\n|\r|\n)/)
    .map((segment, i) => {
      // Odd indexes are the captured line breaks
      if (i % 2 === 1) return segment;
      if (!labelPlaced && segment.length >= label.length) {
        labelPlaced = true;
        return label.padEnd(segment.length, '_');
      }
      return '_'.repeat(segment.length);
    })
    .join('');
}

/**
 * Built-in protector that replaces each PHI span with a same-length mask,
 * e.g. `MRN: 12345678` → `[MRN]________`, `555-1234` → `[PHONE]_`, and
 * spans shorter than their label → `____`.
 *
 * Because the replacement has the same length, `toOriginalOffset` is the
 * identity and provider offsets apply directly to the original text.
 *
 * Masking only covers what basic PHI detection found (regex, best-effort,
 * misses most names). It is NOT HIPAA de-identification.
 */
export class MaskingPhiProtector implements PhiProtector {
  readonly name = 'mask';

  async protect(
    text: string,
    phi: PhiSpan[],
    options?: { signal?: AbortSignal }
  ): Promise<ProtectedText> {
    throwIfAborted(options?.signal);

    const spans = normalizePhiSpans(phi, text.length);
    let out = '';
    let cursor = 0;
    for (const span of spans) {
      out += text.slice(cursor, span.startOffset);
      out += buildMask(text.slice(span.startOffset, span.endOffset), span.type);
      cursor = span.endOffset;
    }
    out += text.slice(cursor);

    return {
      text: out,
      toOriginalOffset: (offset: number) => offset,
      protectedSpans: spans.map((s) => ({
        start: s.startOffset,
        end: s.endOffset,
      })),
    };
  }
}

/**
 * Throw the signal's abort reason if it has been aborted.
 * @internal
 */
export function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw abortReason(signal);
  }
}

/**
 * The error to throw for an aborted signal: its reason when it is an Error,
 * otherwise a generic `AbortError`.
 * @internal
 */
export function abortReason(signal: AbortSignal): Error {
  const reason: unknown = signal.reason;
  if (reason instanceof Error) return reason;
  const err = new Error('The operation was aborted');
  err.name = 'AbortError';
  return err;
}
