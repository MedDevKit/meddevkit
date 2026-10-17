/**
 * MedicalAnalyzer — local detection plus an optional provider cascade
 *
 * @packageDocumentation
 */

import type { PhiMarker } from '../types';
import { detectNegations, detectPhi, detectSections } from '../patterns';
import { normalizeText } from '../utils';
import { extractLocalEntities, rangesOverlap } from './LocalAdapter';
import { mergeEntities, remapRelations } from './merge';
import {
  MaskingPhiProtector,
  abortReason,
  phiMarkersToSpans,
  throwIfAborted,
  type PhiPolicy,
  type PhiProtector,
  type ProtectedText,
} from './phi-protection';
import type {
  AdapterResult,
  AnalyzeOptions,
  EntityRelation,
  MedicalAnalysisResult,
  MedicalAnalyzerConfig,
  MedicalEntity,
  MedicalNlpAdapter,
  NegationPolicy,
  ProviderOutcome,
} from './types';

/** Default per-provider timeout */
const DEFAULT_TIMEOUT_MS = 30000;

/** Maximum length of a provider error message kept in metadata */
const MAX_REASON_LENGTH = 200;

/** Error used internally to tell a timeout apart from a caller abort */
class ProviderTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`timeout after ${timeoutMs}ms`);
    this.name = 'TimeoutError';
  }
}

/** Short, single-line reason from an unknown error (no stack) */
function describeError(err: unknown): string {
  const raw =
    err instanceof Error
      ? err.message || err.name
      : typeof err === 'string'
        ? err
        : 'unknown error';
  const oneLine = raw.replace(/\s+/g, ' ').trim() || 'unknown error';
  return oneLine.length > MAX_REASON_LENGTH
    ? `${oneLine.slice(0, MAX_REASON_LENGTH)}…`
    : oneLine;
}

/**
 * Runs MedDevKit's local detectors and, optionally, external clinical NLP
 * providers, and merges everything into one provider-neutral result.
 *
 * - Text is normalized first (same as MedicalChunker), so result offsets
 *   line up with chunks of `result.text`.
 * - Providers are tried in order; the first that is available and succeeds
 *   wins. Provider failures never throw — the result degrades to local-only
 *   and `metadata.degraded` is set. Aborting the caller's signal does throw.
 * - Before text is sent to a provider, the PHI policy is applied (default:
 *   mask detected PHI). Basic PHI detection is regex/best-effort and misses
 *   most names; masking is NOT HIPAA de-identification.
 *
 * @example
 * ```typescript
 * const analyzer = new MedicalAnalyzer({ providers: [myProvider] });
 * const result = await analyzer.analyze(note);
 * result.entities.filter((e) => e.isNegated);
 * ```
 */
export class MedicalAnalyzer {
  private readonly providers: MedicalNlpAdapter[];
  private readonly phiPolicy: PhiPolicy;
  private readonly phiDetection: 'basic' | 'none';
  private readonly negationPolicy: NegationPolicy;
  private readonly timeoutMs: number;

  constructor(config: MedicalAnalyzerConfig = {}) {
    this.providers = [...(config.providers ?? [])];
    this.phiPolicy = config.phiPolicy ?? 'mask';
    this.phiDetection = config.phiDetection ?? 'basic';
    this.negationPolicy = config.negationPolicy ?? 'either';
    const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
      throw new RangeError('timeoutMs must be a positive number');
    }
    this.timeoutMs = timeoutMs;
  }

  /** Name reported in `metadata.phiPolicy` */
  private get phiPolicyName(): string {
    return typeof this.phiPolicy === 'string' ? this.phiPolicy : this.phiPolicy.name;
  }

  /** Protector for the configured policy, or undefined for 'send'/'block' */
  private get protector(): PhiProtector | undefined {
    if (this.phiPolicy === 'mask') return new MaskingPhiProtector();
    if (typeof this.phiPolicy === 'object') return this.phiPolicy;
    return undefined;
  }

  /**
   * Analyze clinical text.
   *
   * @param text - Raw clinical text (it is normalized first)
   * @param options - Abort signal and language, forwarded to providers
   * @throws The abort reason if `options.signal` is aborted
   */
  async analyze(text: string, options: AnalyzeOptions = {}): Promise<MedicalAnalysisResult> {
    const startTime = performance.now();
    const callerSignal = options.signal;
    throwIfAborted(callerSignal);

    // 1-2. Normalize and run the local pass
    const normalized = normalizeText(text);
    const sections = detectSections(normalized);
    const phi: PhiMarker[] = this.phiDetection === 'none' ? [] : detectPhi(normalized, 'basic');
    const negations = detectNegations(normalized);
    const local = extractLocalEntities(normalized, { sections, negations });

    // 3. Provider cascade
    const outcomes: ProviderOutcome[] = [];
    const warnings: string[] = [];
    let winner: { name: string; result: AdapterResult; protectedText?: ProtectedText } | undefined;
    let protectedText: ProtectedText | undefined;
    let protectionFailed = false;
    const blocked = this.phiPolicy === 'block' && phi.length > 0;

    for (const provider of this.providers) {
      throwIfAborted(callerSignal);

      if (blocked) {
        outcomes.push({ name: provider.name, status: 'skipped', reason: 'phi-blocked' });
        continue;
      }
      if (protectionFailed) {
        outcomes.push({ name: provider.name, status: 'skipped', reason: 'phi-protection-failed' });
        continue;
      }

      let available: boolean;
      try {
        available = await provider.isAvailable();
      } catch {
        available = false;
      }
      if (!available) {
        outcomes.push({ name: provider.name, status: 'unavailable' });
        continue;
      }

      // Apply PHI protection once, lazily, and reuse it for every provider
      const protector = this.protector;
      if (protector && !protectedText) {
        try {
          protectedText = await protector.protect(normalized, phiMarkersToSpans(phi), {
            signal: callerSignal,
          });
        } catch {
          throwIfAborted(callerSignal);
          // Never fall back to sending unprotected text
          protectionFailed = true;
          outcomes.push({ name: provider.name, status: 'skipped', reason: 'phi-protection-failed' });
          continue;
        }
      }
      const payload = protector ? (protectedText as ProtectedText).text : normalized;

      const callStart = performance.now();
      try {
        const result = await this.callWithTimeout(provider, payload, options);
        if (!result || !Array.isArray(result.entities)) {
          throw new Error('adapter returned an invalid result');
        }
        outcomes.push({
          name: provider.name,
          status: 'ok',
          processingTimeMs: performance.now() - callStart,
        });
        winner = { name: provider.name, result, protectedText: protector ? protectedText : undefined };
        break;
      } catch (err) {
        throwIfAborted(callerSignal);
        outcomes.push({
          name: provider.name,
          status: 'failed',
          reason: describeError(err),
          processingTimeMs: performance.now() - callStart,
        });
      }
    }

    // 4. Map provider offsets back and drop masking artifacts
    let providerEntities: MedicalEntity[] | undefined;
    let providerRelations: EntityRelation[] | undefined;
    let droppedMaskedEntities = 0;
    if (winner) {
      const mapped = this.mapProviderEntities(winner.name, winner.result, normalized, winner.protectedText);
      providerEntities = mapped.entities;
      providerRelations = mapped.relations;
      droppedMaskedEntities = mapped.droppedMasked;
      if (mapped.droppedInvalid > 0) {
        warnings.push(
          `${mapped.droppedInvalid} entities from ${winner.name} had invalid offsets and were dropped`
        );
      }
      for (const w of winner.result.warnings ?? []) {
        warnings.push(`${winner.name}: ${w}`);
      }
    }

    // 5. Merge
    const merged = mergeEntities({
      local,
      provider: providerEntities,
      relations: providerRelations,
      negations,
      sections,
      negationPolicy: this.negationPolicy,
    });

    // 6. Result
    return {
      text: normalized,
      entities: merged.entities,
      relations: merged.relations,
      sections,
      phi,
      negations,
      metadata: {
        providers: outcomes,
        ...(winner ? { provider: winner.name } : {}),
        degraded: this.providers.length > 0 && !winner,
        phiPolicy: this.phiPolicyName,
        phiSpansProtected: protectedText?.protectedSpans.length ?? 0,
        droppedMaskedEntities,
        negationDisagreements: merged.negationDisagreements,
        processingTimeMs: performance.now() - startTime,
        ...(warnings.length ? { warnings } : {}),
      },
    };
  }

  /**
   * Call `provider.analyze` with a timeout combined with the caller's
   * signal. Rejects with the caller's abort reason, a timeout error, or the
   * provider's own error. Settles even if the provider ignores the signal.
   */
  private callWithTimeout(
    provider: MedicalNlpAdapter,
    payload: string,
    options: AnalyzeOptions
  ): Promise<AdapterResult> {
    const callerSignal = options.signal;
    const controller = new AbortController();
    const timeoutError = new ProviderTimeoutError(this.timeoutMs);

    return new Promise<AdapterResult>((resolve, reject) => {
      let settled = false;
      const finish = (fn: () => void): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        callerSignal?.removeEventListener('abort', onCallerAbort);
        fn();
      };
      const onCallerAbort = (): void => {
        const reason = callerSignal ? abortReason(callerSignal) : new Error('aborted');
        controller.abort(reason);
        finish(() => reject(reason));
      };
      const timer = setTimeout(() => {
        controller.abort(timeoutError);
        finish(() => reject(timeoutError));
      }, this.timeoutMs);
      callerSignal?.addEventListener('abort', onCallerAbort, { once: true });

      let call: Promise<AdapterResult>;
      try {
        call = Promise.resolve(
          provider.analyze(payload, {
            ...(options.language !== undefined ? { language: options.language } : {}),
            signal: controller.signal,
          })
        );
      } catch (err) {
        finish(() => reject(err));
        return;
      }
      call.then(
        (result) => finish(() => resolve(result)),
        (err: unknown) => finish(() => reject(err))
      );
    });
  }

  /**
   * Map provider entities to original (normalized) offsets, drop entities
   * that overlap a protected placeholder or have invalid offsets, re-slice
   * entity text from the original text, and re-index relations.
   */
  private mapProviderEntities(
    providerName: string,
    result: AdapterResult,
    original: string,
    protectedText: ProtectedText | undefined
  ): {
    entities: MedicalEntity[];
    relations: EntityRelation[];
    droppedMasked: number;
    droppedInvalid: number;
  } {
    const sentLength = protectedText ? protectedText.text.length : original.length;
    const placeholders = protectedText?.protectedSpans ?? [];
    const toOriginal = protectedText
      ? (o: number) => protectedText.toOriginalOffset(o)
      : (o: number) => o;

    const entities: MedicalEntity[] = [];
    const indexMap: (number | undefined)[] = [];
    let droppedMasked = 0;
    let droppedInvalid = 0;

    for (const entity of result.entities) {
      const { startOffset: s, endOffset: e } = entity;
      if (
        !Number.isInteger(s) ||
        !Number.isInteger(e) ||
        s < 0 ||
        e <= s ||
        e > sentLength
      ) {
        droppedInvalid++;
        indexMap.push(undefined);
        continue;
      }
      if (placeholders.some((p) => rangesOverlap(s, e, p.start, p.end))) {
        droppedMasked++;
        indexMap.push(undefined);
        continue;
      }
      const startOffset = toOriginal(s);
      const endOffset = toOriginal(e);
      if (
        !Number.isInteger(startOffset) ||
        !Number.isInteger(endOffset) ||
        startOffset < 0 ||
        endOffset <= startOffset ||
        endOffset > original.length
      ) {
        droppedInvalid++;
        indexMap.push(undefined);
        continue;
      }
      indexMap.push(entities.length);
      entities.push({
        ...entity,
        startOffset,
        endOffset,
        text: original.slice(startOffset, endOffset),
        sources: entity.sources?.includes(providerName)
          ? [...entity.sources]
          : [...(entity.sources ?? []), providerName],
      });
    }

    const relations = remapRelations(result.relations ?? [], indexMap).map((r) => ({
      ...r,
      source: r.source || providerName,
    }));

    return {
      entities,
      relations,
      droppedMasked,
      droppedInvalid,
    };
  }
}
