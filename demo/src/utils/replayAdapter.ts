import type {
  AdapterCapabilities,
  AdapterResult,
  AnalyzeOptions,
  MedicalNlpAdapter,
} from '@meddevkit/chunker';
import type { AzureRecording } from '../data/recordings';
import { fnv1a32 } from './hash';

/**
 * Replays recorded Azure Text Analytics for health results. Named
 * 'azure-health' so entity sources and badges match a live run. Looks up
 * the exact text it is given (after the analyzer's PHI policy) by hash.
 */
export class ReplayAdapter implements MedicalNlpAdapter {
  readonly name = 'azure-health';
  readonly version = 'recorded';
  readonly capabilities: AdapterCapabilities = {
    entityExtraction: true,
    negationDetection: true,
    assertionDetection: true,
    relationExtraction: true,
    ontologyLinking: true,
    phiDetection: false,
    offline: true,
    requiresNetwork: false,
  };

  private readonly byHash: Map<string, AzureRecording>;

  constructor(recordings: AzureRecording[]) {
    this.byHash = new Map();
    for (const r of recordings) {
      if (!this.byHash.has(r.inputHash)) this.byHash.set(r.inputHash, r);
    }
  }

  async analyze(text: string, options?: AnalyzeOptions): Promise<AdapterResult> {
    if (options?.signal?.aborted) {
      throw options.signal.reason instanceof Error ? options.signal.reason : new Error('aborted');
    }
    const recording = this.byHash.get(fnv1a32(text));
    if (!recording) throw new Error('no recording for this text');
    return structuredClone(recording.result);
  }

  async isAvailable(): Promise<boolean> {
    return this.byHash.size > 0;
  }
}

/** Whether any recording exists for a preset */
export function hasRecordingFor(recordings: AzureRecording[], preset: string): boolean {
  return recordings.some((r) => r.preset === preset);
}
