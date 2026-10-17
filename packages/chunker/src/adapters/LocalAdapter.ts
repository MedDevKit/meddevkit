/**
 * LocalAdapter — MedDevKit's regex detectors behind the adapter interface
 *
 * @packageDocumentation
 */

import type { ClinicalSection, NegationContext } from '../types';
import {
  detectMedications,
  detectNegations,
  detectSections,
  detectSeverity,
  detectTemporal,
  detectVitals,
  getSectionAtPosition,
} from '../patterns';
import type {
  AdapterCapabilities,
  AdapterResult,
  AnalyzeOptions,
  CostEstimate,
  MedicalEntity,
  MedicalNlpAdapter,
} from './types';
import { throwIfAborted } from './phi-protection';

/** Adapter name used in `MedicalEntity.sources` for local entities */
export const LOCAL_ADAPTER_NAME = 'meddevkit-local';

/** Version of the LocalAdapter entity mapping */
export const LOCAL_ADAPTER_VERSION = '1.0.0';

/** Confidence used for vital signs (the vitals detector has none) */
const DEFAULT_VITAL_CONFIDENCE = 0.9;

/**
 * Whether two half-open ranges overlap.
 * @internal
 */
export function rangesOverlap(
  aStart: number,
  aEnd: number,
  bStart: number,
  bEnd: number
): boolean {
  return aStart < bEnd && bStart < aEnd;
}

/**
 * Whether `[start, end)` overlaps any local negation span.
 * @internal
 */
export function overlapsNegation(
  start: number,
  end: number,
  negations: NegationContext[]
): boolean {
  return negations.some((n) =>
    rangesOverlap(start, end, n.startOffset, n.endOffset)
  );
}

/** Copy only defined values into an attributes object */
function defined(values: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined) out[key] = value;
  }
  return out;
}

/**
 * Build local entities from MedDevKit's detectors.
 *
 * Sections and negations may be passed in when the caller already
 * computed them for the same text (the analyzer does), to avoid running
 * those detectors twice.
 *
 * @param text - Text to analyze; offsets are relative to it
 * @returns Entities sorted by startOffset, then endOffset
 */
export function extractLocalEntities(
  text: string,
  precomputed: { sections?: ClinicalSection[]; negations?: NegationContext[] } = {}
): MedicalEntity[] {
  const sections = precomputed.sections ?? detectSections(text);
  const negations = precomputed.negations ?? detectNegations(text);
  const entities: MedicalEntity[] = [];

  const push = (
    partial: Omit<MedicalEntity, 'text' | 'isNegated' | 'negation' | 'section' | 'sources'>
  ): void => {
    const local = overlapsNegation(partial.startOffset, partial.endOffset, negations);
    const section = getSectionAtPosition(sections, partial.startOffset)?.type;
    entities.push({
      ...partial,
      text: text.slice(partial.startOffset, partial.endOffset),
      isNegated: local,
      negation: { local, agreement: true },
      ...(section ? { section } : {}),
      sources: [LOCAL_ADAPTER_NAME],
    });
  };

  for (const v of detectVitals(text)) {
    push({
      category: 'VitalSign',
      startOffset: v.startOffset,
      endOffset: v.endOffset,
      confidence: DEFAULT_VITAL_CONFIDENCE,
      attributes: defined({
        type: v.type,
        value: v.value,
        value2: v.value2,
        unit: v.unit,
      }),
    });
  }

  for (const m of detectMedications(text)) {
    push({
      category: 'MedicationName',
      startOffset: m.startOffset,
      endOffset: m.endOffset,
      confidence: m.confidence,
      attributes: defined({
        name: m.name,
        dose: m.dose,
        doseMax: m.doseMax,
        unit: m.unit,
        route: m.route,
        frequency: m.frequency,
      }),
    });
  }

  for (const t of detectTemporal(text)) {
    push({
      category: 'Time',
      startOffset: t.startOffset,
      endOffset: t.endOffset,
      confidence: t.confidence,
      attributes: defined({ type: t.type, value: t.value, unit: t.unit }),
    });
  }

  for (const s of detectSeverity(text)) {
    push({
      category: 'Severity',
      startOffset: s.startOffset,
      endOffset: s.endOffset,
      confidence: s.confidence,
      attributes: defined({
        level: s.level,
        term: s.term,
        modifiedText: s.modifiedText,
      }),
    });
  }

  return entities.sort(
    (a, b) => a.startOffset - b.startOffset || a.endOffset - b.endOffset
  );
}

/**
 * Adapter wrapping MedDevKit's pattern detectors (vitals, medications,
 * temporal expressions, severity) with local negation and section context.
 *
 * Runs fully offline and never sends text anywhere. Pattern-based: it does
 * not find diagnoses, symptoms or procedures and does not link codes.
 *
 * @example
 * ```typescript
 * const adapter = new LocalAdapter();
 * const { entities } = await adapter.analyze('Metoprolol 25 mg PO BID');
 * // [{ category: 'MedicationName', attributes: { dose: 25, ... }, ... }]
 * ```
 */
export class LocalAdapter implements MedicalNlpAdapter {
  readonly name = LOCAL_ADAPTER_NAME;
  readonly version = LOCAL_ADAPTER_VERSION;
  readonly capabilities: AdapterCapabilities = {
    entityExtraction: false,
    negationDetection: true,
    assertionDetection: false,
    relationExtraction: false,
    ontologyLinking: false,
    phiDetection: false,
    offline: true,
    requiresNetwork: false,
  };

  /**
   * Analyze text with the local detectors. Offsets are relative to `text`
   * as given (no normalization is applied).
   */
  async analyze(text: string, options?: AnalyzeOptions): Promise<AdapterResult> {
    throwIfAborted(options?.signal);
    const start = performance.now();
    const entities = extractLocalEntities(text);
    return { entities, processingTimeMs: performance.now() - start };
  }

  /** Always available: no configuration needed */
  async isAvailable(): Promise<boolean> {
    return true;
  }

  /** Local analysis is free */
  estimateCost(): CostEstimate {
    return { units: 0, unitType: 'documents', estimatedCost: 0, currency: 'USD' };
  }
}
