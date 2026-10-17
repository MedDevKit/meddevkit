/**
 * Azure AI Language "Text Analytics for health" adapter
 *
 * Calls the analyze-text jobs REST API with `fetch` only (no Azure SDK, no
 * Node-only APIs), so it runs in Node >= 18, browsers and edge runtimes.
 *
 * Privacy: error messages and warnings produced here never contain the
 * analyzed text. Sending clinical text to Azure is only appropriate under
 * an agreement (e.g. a BAA) that permits it; that is the caller's
 * responsibility.
 *
 * @packageDocumentation
 */

import type {
  AdapterCapabilities,
  AdapterResult,
  AnalyzeOptions,
  CostEstimate,
  EntityRelation,
  MedicalEntity,
  MedicalNlpAdapter,
} from '@meddevkit/chunker';
import type {
  AzureError,
  AzureErrorResponse,
  AzureHealthcareResults,
  AzureJobState,
} from './azure-types';
import { mapAzureEntity, parseEntityRef } from './mapping';
import { batchSegments, splitText, type TextSegment } from './split';
import { ADAPTER_VERSION } from './version';

/** Adapter name used in `MedicalEntity.sources` */
export const AZURE_HEALTH_ADAPTER_NAME = 'azure-health';

/** Maximum characters per document (Azure counts text elements) */
export const AZURE_MAX_DOCUMENT_LENGTH = 125_000;

/** Maximum documents per asynchronous job */
export const AZURE_MAX_DOCUMENTS_PER_JOB = 25;

/** Maximum characters across all documents of one Text Analytics for health job */
export const AZURE_MAX_CHARS_PER_JOB = 125_000;

/** Characters per billable text record */
const TEXT_RECORD_CHARS = 1000;

/** Longest provider error message kept in thrown errors */
const MAX_PROVIDER_MESSAGE = 300;

/**
 * Configuration for {@link AzureHealthAdapter}.
 */
export interface AzureHealthAdapterConfig {
  /** Language resource endpoint, e.g. `https://<resource>.cognitiveservices.azure.com` */
  endpoint: string;
  /** Resource key, sent as `Ocp-Apim-Subscription-Key`. Takes precedence over `getToken`. */
  apiKey?: string;
  /**
   * Microsoft Entra ID token provider (scope
   * `https://cognitiveservices.azure.com/.default`), sent as
   * `Authorization: Bearer <token>`. Called for every request, so it should
   * cache tokens itself. Requires a custom-subdomain endpoint.
   */
  getToken?: () => Promise<string>;
  /** REST API version. @default '2023-04-01' */
  apiVersion?: string;
  /** Model version. @default 'latest' */
  modelVersion?: string;
  /** Default document language (overridden by `analyze(text, { language })`). @default 'en' */
  language?: string;
  /** Delay between job status polls when the service sends no Retry-After. @default 1000 */
  pollIntervalMs?: number;
  /** Give up polling a job after this long. @default 60000 */
  maxPollMs?: number;
  /** fetch implementation (for tests or custom agents). @default globalThis.fetch */
  fetch?: typeof fetch;
}

/**
 * Error thrown for failed Azure requests or jobs. The message holds the
 * HTTP status and Azure error code/message, never the analyzed text.
 */
export class AzureHealthError extends Error {
  /** HTTP status, when the error came from a non-2xx response */
  readonly status?: number;
  /** Azure error code, if any */
  readonly code?: string;

  constructor(message: string, options: { status?: number; code?: string } = {}) {
    super(message);
    this.name = 'AzureHealthError';
    this.status = options.status;
    this.code = options.code;
  }
}

/**
 * {@link MedicalNlpAdapter} for Azure AI Language Text Analytics for health.
 *
 * @example
 * ```typescript
 * const analyzer = new MedicalAnalyzer({
 *   providers: [new AzureHealthAdapter({ endpoint, apiKey })],
 * });
 * const result = await analyzer.analyze(note); // PHI masked by default
 * ```
 */
export class AzureHealthAdapter implements MedicalNlpAdapter {
  readonly name = AZURE_HEALTH_ADAPTER_NAME;
  readonly version = ADAPTER_VERSION;
  readonly capabilities: AdapterCapabilities = {
    entityExtraction: true,
    negationDetection: true,
    assertionDetection: true,
    relationExtraction: true,
    ontologyLinking: true,
    phiDetection: false,
    offline: false,
    requiresNetwork: true,
    maxDocumentLength: AZURE_MAX_DOCUMENT_LENGTH,
  };

  private readonly endpoint: string;
  private readonly apiKey?: string;
  private readonly getToken?: () => Promise<string>;
  private readonly apiVersion: string;
  private readonly modelVersion: string;
  private readonly language: string;
  private readonly pollIntervalMs: number;
  private readonly maxPollMs: number;
  private readonly fetchImpl?: typeof fetch;

  constructor(config: AzureHealthAdapterConfig) {
    this.endpoint = (config.endpoint ?? '').trim().replace(/\/+$/, '');
    this.apiKey = config.apiKey || undefined;
    this.getToken = config.getToken;
    this.apiVersion = config.apiVersion ?? '2023-04-01';
    this.modelVersion = config.modelVersion ?? 'latest';
    this.language = config.language ?? 'en';
    this.pollIntervalMs = config.pollIntervalMs ?? 1000;
    this.maxPollMs = config.maxPollMs ?? 60_000;
    this.fetchImpl = config.fetch;
  }

  /**
   * True when an endpoint and a credential (key or token provider) are
   * configured. Makes no network call.
   */
  async isAvailable(): Promise<boolean> {
    return Boolean(this.endpoint && (this.apiKey || this.getToken));
  }

  /**
   * Billable text records: one per started 1,000 characters of each
   * document the text is split into. No price is given because pricing
   * varies by tier, region and agreement.
   */
  estimateCost(text: string): CostEstimate {
    const units = text.length
      ? splitText(text, AZURE_MAX_DOCUMENT_LENGTH).reduce(
          (sum, s) => sum + Math.ceil(s.text.length / TEXT_RECORD_CHARS),
          0
        )
      : 0;
    return { units, unitType: 'text-records', currency: 'USD' };
  }

  /**
   * Analyze text. Long text is split into documents of at most 125,000
   * UTF-16 code units, sent in as few jobs as the service limits allow
   * (run one after another); entity offsets are relative to `text`.
   */
  async analyze(text: string, options: AnalyzeOptions = {}): Promise<AdapterResult> {
    const started = Date.now();
    const { signal } = options;
    throwIfAborted(signal);
    if (!(await this.isAvailable())) {
      throw new AzureHealthError('Azure health adapter is not configured (endpoint and apiKey or getToken required)');
    }
    if (text.length === 0) {
      return { entities: [], relations: [], processingTimeMs: 0 };
    }

    const language = options.language ?? this.language;
    const segments = splitText(text, AZURE_MAX_DOCUMENT_LENGTH);
    const batches = batchSegments(segments, AZURE_MAX_DOCUMENTS_PER_JOB, AZURE_MAX_CHARS_PER_JOB);

    const entities: MedicalEntity[] = [];
    const relations: EntityRelation[] = [];
    const warnings: string[] = [];
    const failedDocs: string[] = [];
    let modelVersion: string | undefined;
    let docIndex = 0;

    for (const batch of batches) {
      const docs = batch.map((seg) => ({ seg, id: String(docIndex++) }));
      const results = await this.runJob(docs, language, signal);
      modelVersion = results.modelVersion ?? modelVersion;
      this.collect(results, docs, entities, relations, warnings, failedDocs);
    }

    if (failedDocs.length === segments.length) {
      throw new AzureHealthError(`Azure health analysis failed for all documents: ${failedDocs.join('; ')}`);
    }
    for (const f of failedDocs) warnings.push(`document failed: ${f}`);

    return {
      entities,
      relations,
      processingTimeMs: Date.now() - started,
      ...(warnings.length ? { warnings } : {}),
      metadata: {
        apiVersion: this.apiVersion,
        ...(modelVersion ? { modelVersion } : {}),
        documents: segments.length,
        jobs: batches.length,
      },
    };
  }

  // --------------------------------------------------------------------------
  // Result mapping
  // --------------------------------------------------------------------------

  private collect(
    results: AzureHealthcareResults,
    docs: { seg: TextSegment; id: string }[],
    entities: MedicalEntity[],
    relations: EntityRelation[],
    warnings: string[],
    failedDocs: string[]
  ): void {
    const byId = new Map(docs.map((d) => [d.id, d.seg]));
    const resultDocs = results.documents ?? [];
    // Flat-array index of entity 0 of each result document (by position)
    const entityBase: (number | undefined)[] = [];

    resultDocs.forEach((doc, position) => {
      const seg = byId.get(doc.id);
      if (!seg) {
        warnings.push(`unexpected document id in response (position ${position}); skipped`);
        entityBase[position] = undefined;
        return;
      }
      entityBase[position] = entities.length;
      for (const e of doc.entities ?? []) {
        entities.push(mapAzureEntity(e, seg.offset, this.name));
      }
      for (const w of doc.warnings ?? []) {
        warnings.push(`document ${doc.id}: ${w.code || 'warning'}`);
      }
    });

    resultDocs.forEach((doc, position) => {
      const base = entityBase[position];
      if (base === undefined) return;
      const count = (doc.entities ?? []).length;
      for (const rel of doc.relations ?? []) {
        const roles: EntityRelation['roles'] = [];
        let valid = rel.entities?.length > 0;
        for (const re of rel.entities ?? []) {
          const ref = parseEntityRef(re.ref);
          // Relations only link entities of their own document, so the
          // entity index is resolved against this document's entities
          if (!ref || ref.entity >= count) {
            valid = false;
            break;
          }
          roles.push({ role: re.role, entityIndex: base + ref.entity });
        }
        if (!valid) {
          warnings.push(`document ${doc.id}: dropped relation ${rel.relationType} with unresolvable entity reference`);
          continue;
        }
        relations.push({
          type: rel.relationType,
          roles,
          ...(typeof rel.confidenceScore === 'number' ? { confidence: rel.confidenceScore } : {}),
          source: this.name,
        });
      }
    });

    for (const err of results.errors ?? []) {
      failedDocs.push(`document ${err.id}: ${describeError(err.error)}`);
    }
    const seen = new Set([...resultDocs.map((d) => d.id), ...(results.errors ?? []).map((e) => e.id)]);
    for (const d of docs) {
      if (!seen.has(d.id)) failedDocs.push(`document ${d.id}: missing from response`);
    }
  }

  // --------------------------------------------------------------------------
  // HTTP
  // --------------------------------------------------------------------------

  private get fetchFn(): typeof fetch {
    const f = this.fetchImpl ?? globalThis.fetch;
    if (typeof f !== 'function') {
      throw new AzureHealthError('No fetch implementation available; pass config.fetch');
    }
    return f;
  }

  private async headers(json: boolean): Promise<Record<string, string>> {
    const h: Record<string, string> = { Accept: 'application/json' };
    if (json) h['Content-Type'] = 'application/json';
    if (this.apiKey) {
      h['Ocp-Apim-Subscription-Key'] = this.apiKey;
    } else if (this.getToken) {
      h.Authorization = `Bearer ${await this.getToken()}`;
    }
    return h;
  }

  /** Submit one job and poll it to completion; returns the Healthcare task results */
  private async runJob(
    docs: { seg: TextSegment; id: string }[],
    language: string,
    signal: AbortSignal | undefined
  ): Promise<AzureHealthcareResults> {
    const url = `${this.endpoint}/language/analyze-text/jobs?api-version=${encodeURIComponent(this.apiVersion)}`;
    const body = {
      displayName: 'meddevkit',
      analysisInput: {
        documents: docs.map((d) => ({ id: d.id, language, text: d.seg.text })),
      },
      tasks: [
        {
          kind: 'Healthcare',
          taskName: 'meddevkit-health',
          parameters: { modelVersion: this.modelVersion, stringIndexType: 'Utf16CodeUnit' },
        },
      ],
    };

    const submit = await this.fetchFn(url, {
      method: 'POST',
      headers: await this.headers(true),
      body: JSON.stringify(body),
      signal,
    });
    if (!submit.ok) throw await httpError('submit', submit);
    const location = submit.headers.get('operation-location');
    if (!location) {
      throw new AzureHealthError(`Azure health submit returned HTTP ${submit.status} without an operation-location header`, {
        status: submit.status,
      });
    }
    this.assertSameOrigin(location);
    // Release the (empty) body
    await submit.text().catch(() => undefined);

    const deadline = Date.now() + this.maxPollMs;
    let wait = retryAfterMs(submit.headers) ?? this.pollIntervalMs;
    for (;;) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) {
        throw new AzureHealthError(`Azure health job did not finish within ${this.maxPollMs} ms`, {
          code: 'PollTimeout',
        });
      }
      await sleep(Math.min(wait, remaining), signal);

      const poll = await this.fetchFn(location, {
        method: 'GET',
        headers: await this.headers(false),
        signal,
      });
      if (!poll.ok) throw await httpError('status', poll);
      const state = (await poll.json()) as AzureJobState;
      wait = retryAfterMs(poll.headers) ?? this.pollIntervalMs;

      switch (state.status) {
        case 'succeeded':
        case 'partiallyCompleted': {
          const item = (state.tasks?.items ?? []).find((t) => t.results) ?? state.tasks?.items?.[0];
          if (!item?.results) {
            throw new AzureHealthError(
              `Azure health job ${state.status} but returned no task results${jobErrors(state)}`
            );
          }
          return item.results;
        }
        case 'failed':
          throw new AzureHealthError(`Azure health job failed${jobErrors(state)}`, {
            code: state.errors?.[0]?.code,
          });
        case 'cancelled':
        case 'cancelling':
          throw new AzureHealthError(`Azure health job was ${state.status}`);
        default:
          // notStarted / running: keep polling
          break;
      }
    }
  }

  /**
   * Refuse to send credentials to a host other than the configured endpoint.
   */
  private assertSameOrigin(location: string): void {
    let ok = false;
    try {
      ok = new URL(location).origin === new URL(this.endpoint).origin;
    } catch {
      ok = false;
    }
    if (!ok) {
      throw new AzureHealthError('Azure health operation-location does not match the configured endpoint origin');
    }
  }
}

// ============================================================================
// Helpers
// ============================================================================

function truncate(s: string): string {
  return s.length > MAX_PROVIDER_MESSAGE ? `${s.slice(0, MAX_PROVIDER_MESSAGE)}...` : s;
}

/** `code: message (inner: code)` from an Azure error object */
function describeError(error: AzureError | undefined): string {
  if (!error) return 'unknown error';
  const parts = [error.code ?? 'Error'];
  if (error.message) parts.push(`: ${truncate(error.message)}`);
  if (error.innererror?.code) parts.push(` (${error.innererror.code})`);
  return parts.join('');
}

function jobErrors(state: AzureJobState): string {
  const errs = state.errors ?? [];
  return errs.length ? `: ${errs.map(describeError).join('; ')}` : '';
}

/** Build an error from a non-2xx response; uses only status and Azure's error body */
async function httpError(stage: 'submit' | 'status', res: Response): Promise<AzureHealthError> {
  let error: AzureError | undefined;
  try {
    const body = (await res.json()) as AzureErrorResponse;
    error = body?.error;
  } catch {
    error = undefined;
  }
  const detail = error ? `: ${describeError(error)}` : '';
  return new AzureHealthError(`Azure health ${stage} request failed with HTTP ${res.status}${detail}`, {
    status: res.status,
    code: error?.code,
  });
}

/** Parse a Retry-After header (seconds or HTTP date) into milliseconds */
export function retryAfterMs(headers: Headers): number | undefined {
  const value = headers.get('retry-after');
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const date = Date.parse(value);
  if (!Number.isNaN(date)) return Math.max(0, date - Date.now());
  return undefined;
}

function abortReason(signal: AbortSignal): unknown {
  return signal.reason ?? new AzureHealthError('Azure health request aborted', { code: 'Aborted' });
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw abortReason(signal);
}

function sleep(ms: number, signal: AbortSignal | undefined): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortReason(signal));
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortReason(signal as AbortSignal));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}
