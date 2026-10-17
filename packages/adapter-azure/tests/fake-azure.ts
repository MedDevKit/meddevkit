/**
 * In-memory fake of the analyze-text jobs API, served through an injected
 * fetch. No network.
 */
import type { AzureHealthcareResults, AzureJobState } from '../src/azure-types';

export const ENDPOINT = 'https://unit-test.cognitiveservices.azure.com';
export const FAKE_KEY = 'fake-key-for-tests';

export interface SubmittedDocument {
  id: string;
  language: string;
  text: string;
}

export interface RecordedRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: unknown;
}

export interface FakeAzureOptions {
  /** Build the task results for a submitted job */
  results?: (docs: SubmittedDocument[]) => AzureHealthcareResults;
  /** Override the full job state returned once finished */
  finalState?: (docs: SubmittedDocument[]) => AzureJobState;
  /** Number of 'running' polls before the final state */
  runningPolls?: number;
  /** Retry-After header on 'running' polls */
  retryAfter?: string;
  /** Respond to submit with this status and error body instead of 202 */
  submitError?: { status: number; body: unknown };
  /** Override operation-location */
  operationLocation?: (jobId: string) => string;
}

export class FakeAzure {
  readonly requests: RecordedRequest[] = [];
  readonly jobs = new Map<string, { docs: SubmittedDocument[]; polls: number }>();
  private nextJob = 1;

  constructor(private readonly options: FakeAzureOptions = {}) {}

  get submissions(): SubmittedDocument[][] {
    return this.requests
      .filter((r) => r.method === 'POST')
      .map((r) => (r.body as { analysisInput: { documents: SubmittedDocument[] } }).analysisInput.documents);
  }

  get polls(): RecordedRequest[] {
    return this.requests.filter((r) => r.method === 'GET');
  }

  readonly fetch: typeof fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const method = init?.method ?? 'GET';
    const headers: Record<string, string> = {};
    new Headers(init?.headers).forEach((v, k) => {
      headers[k] = v;
    });
    if (init?.signal?.aborted) throw init.signal.reason;
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
    this.requests.push({ url, method, headers, body });

    if (method === 'POST') {
      if (this.options.submitError) {
        return json(this.options.submitError.body, this.options.submitError.status);
      }
      const jobId = `job-${this.nextJob++}`;
      this.jobs.set(jobId, { docs: body.analysisInput.documents, polls: 0 });
      const location =
        this.options.operationLocation?.(jobId) ??
        `${ENDPOINT}/language/analyze-text/jobs/${jobId}?api-version=2023-04-01`;
      return new Response(null, { status: 202, headers: { 'operation-location': location } });
    }

    const jobId = /jobs\/([^?]+)/.exec(url)?.[1] ?? '';
    const job = this.jobs.get(jobId);
    if (!job) return json({ error: { code: 'NotFound', message: 'Job not found.' } }, 404);
    job.polls++;
    if (job.polls <= (this.options.runningPolls ?? 1)) {
      const h: Record<string, string> = {};
      if (this.options.retryAfter) h['retry-after'] = this.options.retryAfter;
      return json({ jobId, status: 'running', errors: [], tasks: { completed: 0, inProgress: 1, total: 1, items: [] } }, 200, h);
    }
    const state: AzureJobState = this.options.finalState?.(job.docs) ?? {
      jobId,
      status: 'succeeded',
      errors: [],
      tasks: {
        completed: 1,
        failed: 0,
        inProgress: 0,
        total: 1,
        items: [
          {
            kind: 'HealthcareLROResults',
            status: 'succeeded',
            results: this.options.results?.(job.docs) ?? { documents: [], errors: [], modelVersion: 'test' },
          },
        ],
      },
    };
    return json(state, 200);
  };
}

export function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}
