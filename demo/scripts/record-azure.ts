/**
 * Record Azure Text Analytics for health results for the demo's sample notes.
 *
 *   pnpm build                                   # builds @meddevkit/chunker and adapter-azure
 *   AZURE_LANGUAGE_ENDPOINT=https://<resource>.cognitiveservices.azure.com \
 *   AZURE_LANGUAGE_KEY=... \
 *   pnpm --filter @meddevkit/demo record:azure
 *
 * For every preset note and PHI policy ('mask', 'send') this runs
 * MedicalAnalyzer with the real AzureHealthAdapter, captures the exact text
 * sent to Azure and the raw adapter result, and writes them to
 * src/data/azure-recordings.json, where the demo's "Azure — recorded" mode
 * replays them. The sample notes are synthetic; keep them that way.
 *
 * The key is read from the environment only and is never printed.
 */

import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import type { AdapterResult } from '@meddevkit/chunker';
import { PRESETS, type PresetKey } from '../src/data/sample-notes';
import type { AzureRecording, AzureRecordingsFile, RecordedPhiPolicy } from '../src/data/recordings';
import { CapturingAdapter } from '../src/utils/capturingAdapter';
import { fnv1a32 } from '../src/utils/hash';

const OUTPUT = fileURLToPath(new URL('../src/data/azure-recordings.json', import.meta.url));
const POLICIES: RecordedPhiPolicy[] = ['mask', 'send'];
const TIMEOUT_MS = 180_000;

function fail(message: string): never {
  process.stderr.write(`record:azure: ${message}\n`);
  process.exit(1);
}

/** Error message without the key, on one line */
function safeMessage(err: unknown, apiKey: string): string {
  const raw = err instanceof Error ? err.message : String(err);
  return raw.split(apiKey).join('[redacted]').replace(/\s+/g, ' ').trim();
}

async function loadPackages() {
  try {
    const chunker = await import('@meddevkit/chunker');
    const azure = await import('@meddevkit/adapter-azure');
    return { MedicalAnalyzer: chunker.MedicalAnalyzer, AzureHealthAdapter: azure.AzureHealthAdapter };
  } catch {
    return fail(
      'could not load the built @meddevkit/chunker / @meddevkit/adapter-azure packages.\n' +
        'Run `pnpm build` (or `pnpm --filter "@meddevkit/demo..." build`) from the repo root first.',
    );
  }
}

async function main(): Promise<void> {
  const endpoint = process.env.AZURE_LANGUAGE_ENDPOINT?.trim();
  const apiKey = process.env.AZURE_LANGUAGE_KEY?.trim();
  const missing = [
    !endpoint && 'AZURE_LANGUAGE_ENDPOINT',
    !apiKey && 'AZURE_LANGUAGE_KEY',
  ].filter(Boolean);
  if (missing.length > 0 || !endpoint || !apiKey) {
    fail(
      `missing ${missing.join(' and ')}.\n` +
        'Set AZURE_LANGUAGE_ENDPOINT (https://<resource>.cognitiveservices.azure.com) and ' +
        'AZURE_LANGUAGE_KEY, then run `pnpm --filter @meddevkit/demo record:azure`.',
    );
  }

  const { MedicalAnalyzer, AzureHealthAdapter } = await loadPackages();

  // Identical sent texts (e.g. notes without PHI under mask vs send) are
  // recorded once and reused, so they are only billed once.
  const cache = new Map<string, AdapterResult>();
  const recordings: AzureRecording[] = [];
  let textRecords = 0;

  for (const preset of Object.keys(PRESETS) as PresetKey[]) {
    for (const phiPolicy of POLICIES) {
      const azure = new AzureHealthAdapter({ endpoint, apiKey });
      const capturing = new CapturingAdapter({
        name: azure.name,
        version: azure.version,
        capabilities: azure.capabilities,
        isAvailable: () => azure.isAvailable(),
        estimateCost: (t) => azure.estimateCost(t),
        analyze: async (t, options) => {
          const cached = cache.get(fnv1a32(t));
          if (cached) return structuredClone(cached);
          return azure.analyze(t, options);
        },
      });
      const analyzer = new MedicalAnalyzer({
        providers: [capturing],
        phiPolicy,
        timeoutMs: TIMEOUT_MS,
      });

      const analysis = await analyzer.analyze(PRESETS[preset].note);
      const outcome = analysis.metadata.providers[0];
      const { sentText, result } = capturing.capture;
      if (outcome?.status !== 'ok' || sentText === undefined || !result) {
        const reason = outcome?.reason ? safeMessage(new Error(outcome.reason), apiKey) : outcome?.status ?? 'no outcome';
        fail(`${preset} / ${phiPolicy}: Azure call failed (${reason}). Nothing was written.`);
      }

      const inputHash = fnv1a32(sentText);
      const reused = cache.has(inputHash);
      if (!reused) {
        cache.set(inputHash, structuredClone(result));
        textRecords += azure.estimateCost(sentText).units;
      }

      const meta = result.metadata ?? {};
      const apiVersion = typeof meta.apiVersion === 'string' ? meta.apiVersion : 'unknown';
      const modelVersion = typeof meta.modelVersion === 'string' ? meta.modelVersion : undefined;
      const retries = typeof meta.retries === 'number' ? meta.retries : 0;

      recordings.push({
        preset,
        phiPolicy,
        inputHash,
        recordedAt: new Date().toISOString(),
        apiVersion,
        ...(modelVersion ? { modelVersion } : {}),
        result,
      });

      console.log(
        `${preset.padEnd(10)} ${phiPolicy.padEnd(5)} ${String(result.entities.length).padStart(4)} entities  ` +
          `${String(Math.round(result.processingTimeMs)).padStart(6)} ms  retries ${retries}` +
          (reused ? '  (same text as previous recording, reused)' : ''),
      );
    }
  }

  recordings.sort((a, b) => a.preset.localeCompare(b.preset) || a.phiPolicy.localeCompare(b.phiPolicy));
  const file: AzureRecordingsFile = { version: 1, recordings };
  await writeFile(OUTPUT, `${JSON.stringify(file, null, 2)}\n`, 'utf8');

  console.log(`\nWrote ${recordings.length} recordings to src/data/azure-recordings.json`);
  console.log(`Text records used: ${textRecords}`);
}

main().catch((err: unknown) => {
  const key = process.env.AZURE_LANGUAGE_KEY?.trim();
  const message = key ? safeMessage(err, key) : err instanceof Error ? err.message : String(err);
  fail(message);
});
