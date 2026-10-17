import type { AdapterResult } from '@meddevkit/chunker';
import type { PresetKey } from './sample-notes';
import recordingsJson from './azure-recordings.json';

/** PHI policies recordings are made for ('block' sends nothing or the same text as 'send') */
export type RecordedPhiPolicy = 'mask' | 'send';

/** One recorded Azure Text Analytics for health response */
export interface AzureRecording {
  /** Preset the note came from */
  preset: PresetKey;
  /** PHI policy the analyzer applied before sending */
  phiPolicy: RecordedPhiPolicy;
  /** FNV-1a 32-bit hex hash of the exact text sent to Azure */
  inputHash: string;
  /** ISO timestamp of the recording */
  recordedAt: string;
  /** Azure REST API version used */
  apiVersion: string;
  /** Model version reported by Azure, if any */
  modelVersion?: string;
  /** Raw adapter result (offsets relative to the sent text) */
  result: AdapterResult;
}

/** Shape of azure-recordings.json */
export interface AzureRecordingsFile {
  version: 1;
  recordings: AzureRecording[];
}

/** Recordings bundled with the demo (written by `pnpm --filter @meddevkit/demo record:azure`) */
export const AZURE_RECORDINGS: AzureRecording[] =
  (recordingsJson as unknown as AzureRecordingsFile).recordings ?? [];
