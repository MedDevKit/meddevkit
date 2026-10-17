import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { MedicalAnalyzer } from '@meddevkit/chunker';
import {
  AzureHealthAdapter,
  AzureHealthError,
  ADAPTER_VERSION,
  AZURE_MAX_DOCUMENT_LENGTH,
  mapAzureCategory,
  retryAfterMs,
} from '../src';
import type { AzureHealthcareResults, AzureJobState } from '../src/azure-types';
import { ENDPOINT, FAKE_KEY, FakeAzure, type SubmittedDocument } from './fake-azure';
import { NOTE } from './fixtures/note';
import fixture from './fixtures/ta4h-response.json';

const FIXTURE = fixture as unknown as AzureJobState;
const fixtureResults = (): AzureHealthcareResults =>
  JSON.parse(JSON.stringify(FIXTURE.tasks!.items![0].results));

function adapter(fake: FakeAzure, extra: Partial<ConstructorParameters<typeof AzureHealthAdapter>[0]> = {}) {
  return new AzureHealthAdapter({
    endpoint: ENDPOINT,
    apiKey: FAKE_KEY,
    pollIntervalMs: 1,
    fetch: fake.fetch,
    ...extra,
  });
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('package', () => {
  it('version constant matches package.json', () => {
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
    expect(ADAPTER_VERSION).toBe(pkg.version);
    expect(new AzureHealthAdapter({ endpoint: ENDPOINT, apiKey: 'k' }).version).toBe(pkg.version);
  });

  it('fixture offsets match the synthetic note', () => {
    for (const e of fixtureResults().documents![0].entities!) {
      expect(NOTE.slice(e.offset, e.offset + e.length)).toBe(e.text);
    }
  });

  it('declares capabilities', () => {
    const a = new AzureHealthAdapter({ endpoint: ENDPOINT, apiKey: 'k' });
    expect(a.name).toBe('azure-health');
    expect(a.capabilities).toEqual({
      entityExtraction: true,
      negationDetection: true,
      assertionDetection: true,
      relationExtraction: true,
      ontologyLinking: true,
      phiDetection: false,
      offline: false,
      requiresNetwork: true,
      maxDocumentLength: 125000,
    });
  });
});

describe('isAvailable', () => {
  it('is true with endpoint + apiKey or endpoint + getToken, without network', async () => {
    const fetchSpy = vi.fn();
    const f = fetchSpy as unknown as typeof fetch;
    expect(await new AzureHealthAdapter({ endpoint: ENDPOINT, apiKey: 'k', fetch: f }).isAvailable()).toBe(true);
    expect(
      await new AzureHealthAdapter({ endpoint: ENDPOINT, getToken: async () => 't', fetch: f }).isAvailable()
    ).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('is false without endpoint or credentials', async () => {
    expect(await new AzureHealthAdapter({ endpoint: ENDPOINT }).isAvailable()).toBe(false);
    expect(await new AzureHealthAdapter({ endpoint: ENDPOINT, apiKey: '' }).isAvailable()).toBe(false);
    expect(await new AzureHealthAdapter({ endpoint: '', apiKey: 'k' }).isAvailable()).toBe(false);
  });

  it('analyze rejects when not configured', async () => {
    await expect(new AzureHealthAdapter({ endpoint: ENDPOINT }).analyze('x')).rejects.toThrow(/not configured/);
  });
});

describe('request', () => {
  it('submits the documented job body with the subscription key, then polls operation-location', async () => {
    const fake = new FakeAzure({ results: fixtureResults, runningPolls: 1 });
    await adapter(fake, { endpoint: `${ENDPOINT}/` }).analyze(NOTE);

    const [submit, poll1, poll2] = fake.requests;
    expect(fake.requests).toHaveLength(3);
    expect(submit.method).toBe('POST');
    expect(submit.url).toBe(`${ENDPOINT}/language/analyze-text/jobs?api-version=2023-04-01`);
    expect(submit.headers['ocp-apim-subscription-key']).toBe(FAKE_KEY);
    expect(submit.headers['content-type']).toBe('application/json');
    expect(submit.headers.authorization).toBeUndefined();
    expect(submit.body).toEqual({
      displayName: 'meddevkit',
      analysisInput: { documents: [{ id: '0', language: 'en', text: NOTE }] },
      tasks: [
        {
          kind: 'Healthcare',
          taskName: 'meddevkit-health',
          parameters: { modelVersion: 'latest', stringIndexType: 'Utf16CodeUnit' },
        },
      ],
    });
    expect(poll1.method).toBe('GET');
    expect(poll1.url).toBe(`${ENDPOINT}/language/analyze-text/jobs/job-1?api-version=2023-04-01`);
    expect(poll1.headers['ocp-apim-subscription-key']).toBe(FAKE_KEY);
    expect(poll2.url).toBe(poll1.url);
  });

  it('uses a bearer token from getToken and honors apiVersion/modelVersion/language', async () => {
    const fake = new FakeAzure({ results: fixtureResults });
    const getToken = vi.fn(async () => 'token-123');
    await new AzureHealthAdapter({
      endpoint: ENDPOINT,
      getToken,
      apiVersion: '2024-11-01',
      modelVersion: '2023-04-15',
      language: 'es',
      pollIntervalMs: 1,
      fetch: fake.fetch,
    }).analyze(NOTE, { language: 'en' });

    const submit = fake.requests[0];
    expect(submit.url).toContain('api-version=2024-11-01');
    expect(submit.headers.authorization).toBe('Bearer token-123');
    expect(submit.headers['ocp-apim-subscription-key']).toBeUndefined();
    const body = submit.body as { analysisInput: { documents: SubmittedDocument[] }; tasks: { parameters: unknown }[] };
    expect(body.analysisInput.documents[0].language).toBe('en');
    expect(body.tasks[0].parameters).toEqual({ modelVersion: '2023-04-15', stringIndexType: 'Utf16CodeUnit' });
    expect(fake.polls.every((p) => p.headers.authorization === 'Bearer token-123')).toBe(true);
    expect(getToken).toHaveBeenCalledTimes(fake.requests.length);
  });

  it('honors Retry-After between polls', async () => {
    vi.useFakeTimers();
    const fake = new FakeAzure({ results: fixtureResults, runningPolls: 1, retryAfter: '2' });
    const promise = adapter(fake, { pollIntervalMs: 10 }).analyze(NOTE);

    await vi.advanceTimersByTimeAsync(10); // default interval before the first poll
    expect(fake.polls).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1990);
    expect(fake.polls).toHaveLength(1); // still waiting for Retry-After: 2s
    await vi.advanceTimersByTimeAsync(10);
    expect(fake.polls).toHaveLength(2);
    const result = await promise;
    expect(result.entities.length).toBeGreaterThan(0);
  });

  it('parses Retry-After as seconds or HTTP date', () => {
    expect(retryAfterMs(new Headers({ 'retry-after': '3' }))).toBe(3000);
    expect(retryAfterMs(new Headers())).toBeUndefined();
    expect(retryAfterMs(new Headers({ 'retry-after': 'nonsense' }))).toBeUndefined();
    const future = new Date(Date.now() + 5000).toUTCString();
    const ms = retryAfterMs(new Headers({ 'retry-after': future }))!;
    expect(ms).toBeGreaterThan(3000);
    expect(ms).toBeLessThanOrEqual(5000);
  });

  it('returns an empty result for empty text without calling the service', async () => {
    const fake = new FakeAzure();
    const result = await adapter(fake).analyze('');
    expect(result.entities).toEqual([]);
    expect(fake.requests).toHaveLength(0);
  });
});

describe('mapping', () => {
  async function run() {
    const fake = new FakeAzure({ results: fixtureResults });
    return adapter(fake).analyze(NOTE);
  }

  it('maps every entity field', async () => {
    const { entities } = await run();
    expect(entities).toHaveLength(9);
    for (const e of entities) {
      expect(NOTE.slice(e.startOffset, e.endOffset)).toBe(e.text);
      expect(e.sources).toEqual(['azure-health']);
    }

    const chestPain = entities[0];
    expect(chestPain).toEqual({
      text: 'chest pain',
      category: 'SymptomOrSign',
      providerCategory: 'SymptomOrSign',
      startOffset: NOTE.indexOf('chest pain'),
      endOffset: NOTE.indexOf('chest pain') + 'chest pain'.length,
      confidence: 0.98,
      isNegated: true,
      assertion: { certainty: 'negative' },
      codes: [
        { system: 'UMLS', code: 'C0008031' },
        { system: 'SNOMEDCT_US', code: '29857009' },
      ],
      normalizedText: 'Chest Pain',
      sources: ['azure-health'],
    });

    const mother = entities[1];
    expect(mother.category).toBe('Other');
    expect(mother.providerCategory).toBe('FamilyRelation');
    expect(mother.assertion).toBeUndefined();
    expect(mother.isNegated).toBe(false);

    const cancer = entities[2];
    expect(cancer.category).toBe('Diagnosis');
    expect(cancer.assertion).toEqual({ association: 'other' });
    expect(cancer.attributes).toEqual({ temporality: 'past' });
    expect(cancer.isNegated).toBe(false);
    expect(cancer.codes).toContainEqual({ system: 'ICD10CM', code: 'C50.919' });

    const dizziness = entities[3];
    expect(dizziness.assertion).toEqual({ conditionality: 'hypothetical', certainty: 'positivePossible' });
    expect(dizziness.isNegated).toBe(false);

    const lisinopril = entities[4];
    expect(lisinopril.category).toBe('MedicationName');
    expect(lisinopril.normalizedText).toBe('lisinopril');
    expect(lisinopril.codes).toContainEqual({ system: 'RXNORM', code: '29046' });
    expect(lisinopril.confidence).toBe(1);

    expect(entities[5]).toMatchObject({ text: '10 mg', category: 'Dosage', providerCategory: 'Dosage' });
    expect(entities[5].codes).toBeUndefined();
    expect(entities[5].normalizedText).toBeUndefined();
    expect(entities[6]).toMatchObject({ text: 'PO', category: 'MedicationRoute' });
    expect(entities[7]).toMatchObject({ text: 'daily', category: 'MedicationFrequency', providerCategory: 'Frequency' });

    const htn = entities[8];
    expect(htn.category).toBe('Diagnosis');
    expect(htn.codes).toEqual([
      { system: 'UMLS', code: 'C0085580' },
      { system: 'ICD10CM', code: 'I10' },
      { system: 'SNOMEDCT_US', code: '59621000' },
    ]);
  });

  it('treats negativePossible as negated', async () => {
    const fake = new FakeAzure({
      results: () => {
        const r = fixtureResults();
        r.documents![0].entities![0].assertion = { certainty: 'negativePossible' };
        return r;
      },
    });
    const { entities } = await adapter(fake).analyze(NOTE);
    expect(entities[0].isNegated).toBe(true);
  });

  it('maps relations onto flat entity indexes', async () => {
    const { relations, entities } = await run();
    expect(relations).toEqual([
      {
        type: 'DosageOfMedication',
        roles: [
          { role: 'Dosage', entityIndex: 5 },
          { role: 'Medication', entityIndex: 4 },
        ],
        confidence: 0.99,
        source: 'azure-health',
      },
      {
        type: 'RouteOfMedication',
        roles: [
          { role: 'Route', entityIndex: 6 },
          { role: 'Medication', entityIndex: 4 },
        ],
        confidence: 0.98,
        source: 'azure-health',
      },
      {
        type: 'FrequencyOfMedication',
        roles: [
          { role: 'Medication', entityIndex: 4 },
          { role: 'Frequency', entityIndex: 7 },
        ],
        confidence: 0.97,
        source: 'azure-health',
      },
    ]);
    expect(entities[relations![0].roles[0].entityIndex].text).toBe('10 mg');
  });

  it('reports document warnings as codes and metadata without text', async () => {
    const result = await run();
    expect(result.warnings).toEqual(['document 0: DocumentTruncated']);
    expect(result.metadata).toEqual({ apiVersion: '2023-04-01', modelVersion: '2023-04-15', documents: 1, jobs: 1, retries: 0 });
    expect(result.processingTimeMs).toBeGreaterThanOrEqual(0);
  });

  it('drops relations with unresolvable references, with a warning', async () => {
    const fake = new FakeAzure({
      results: () => {
        const r = fixtureResults();
        r.documents![0].relations![0].entities[0].ref = '#/results/documents/0/entities/99';
        r.documents![0].relations![1].entities[0].ref = 'garbage';
        return r;
      },
    });
    const result = await adapter(fake).analyze(NOTE);
    expect(result.relations).toHaveLength(1);
    expect(result.warnings?.filter((w) => w.includes('dropped relation'))).toHaveLength(2);
  });

  it('category table', () => {
    expect(mapAzureCategory('TreatmentName')).toBe('ProcedureName');
    expect(mapAzureCategory('ExaminationName')).toBe('TestName');
    expect(mapAzureCategory('MedicationClass')).toBe('MedicationName');
    expect(mapAzureCategory('MedicationForm')).toBe('MedicationForm');
    expect(mapAzureCategory('BodyStructure')).toBe('BodyStructure');
    expect(mapAzureCategory('MeasurementValue')).toBe('MeasurementValue');
    expect(mapAzureCategory('Time')).toBe('Time');
    expect(mapAzureCategory('Date')).toBe('Time');
    expect(mapAzureCategory('Allergen')).toBe('Allergen');
    expect(mapAzureCategory('ConditionQualifier')).toBe('Severity');
    expect(mapAzureCategory('ConditionScale')).toBe('Severity');
    expect(mapAzureCategory('Age')).toBe('Other');
    expect(mapAzureCategory('toString')).toBe('Other');
  });
});

describe('long documents', () => {
  const PARA = 'Patient reports headache today.\n\n';
  const LONG = PARA.repeat(Math.ceil(270_000 / PARA.length));

  /** Echo fake: per document, entities for "Patient" and "headache" and a relation between them */
  const echo = (docs: SubmittedDocument[]): AzureHealthcareResults => ({
    documents: docs.map((d, position) => {
      const p = d.text.indexOf('Patient');
      const h = d.text.indexOf('headache');
      return {
        id: d.id,
        entities: [
          { text: 'Patient', category: 'Other', offset: p, length: 7, confidenceScore: 0.9 },
          { text: 'headache', category: 'SymptomOrSign', offset: h, length: 8, confidenceScore: 0.9 },
        ],
        relations: [
          {
            relationType: 'TimeOfCondition',
            entities: [
              { ref: `#/results/documents/${position}/entities/1`, role: 'Condition' },
              { ref: `#/results/documents/${position}/entities/0`, role: 'Subject' },
            ],
          },
        ],
        warnings: [],
      };
    }),
    errors: [],
    modelVersion: 'test',
  });

  it('splits at paragraph breaks, respects limits and shifts offsets back', async () => {
    const fake = new FakeAzure({ results: echo });
    const result = await adapter(fake).analyze(LONG);

    const docs = fake.submissions.flat();
    expect(docs.length).toBe(3);
    expect(docs.map((d) => d.text).join('')).toBe(LONG);
    for (const d of docs) expect(d.text.length).toBeLessThanOrEqual(AZURE_MAX_DOCUMENT_LENGTH);
    for (const d of docs.slice(0, -1)) expect(d.text.endsWith('\n\n')).toBe(true);
    for (const job of fake.submissions) {
      expect(job.length).toBeLessThanOrEqual(25);
      expect(job.reduce((n, d) => n + d.text.length, 0)).toBeLessThanOrEqual(125_000);
    }
    expect(docs.map((d) => d.id)).toEqual(['0', '1', '2']);

    expect(result.entities).toHaveLength(6);
    for (const e of result.entities) expect(LONG.slice(e.startOffset, e.endOffset)).toBe(e.text);
    // Entities of later documents land at their document offset
    expect(result.entities[2].startOffset).toBe(docs[0].text.length);
    expect(result.entities[4].startOffset).toBe(docs[0].text.length + docs[1].text.length);

    expect(result.relations).toHaveLength(3);
    result.relations!.forEach((rel, i) => {
      expect(rel.roles).toEqual([
        { role: 'Condition', entityIndex: i * 2 + 1 },
        { role: 'Subject', entityIndex: i * 2 },
      ]);
    });
    expect(result.metadata).toMatchObject({ documents: 3, jobs: 3 });
  });

  it('warns when some documents fail and throws when all fail', async () => {
    const someFail = new FakeAzure({
      results: (docs) => {
        const r = echo(docs);
        if (docs[0].id === '1') {
          return { documents: [], errors: [{ id: '1', error: { code: 'InvalidDocument', message: 'Document text is empty.' } }] };
        }
        return r;
      },
    });
    const partial = await adapter(someFail).analyze(LONG);
    expect(partial.entities).toHaveLength(4);
    expect(partial.warnings).toContain('document failed: document 1: InvalidDocument: Document text is empty.');

    const allFail = new FakeAzure({
      results: (docs) => ({ documents: [], errors: docs.map((d) => ({ id: d.id, error: { code: 'InvalidDocument' } })) }),
    });
    await expect(adapter(allFail).analyze(NOTE)).rejects.toThrow(/failed for all documents: document 0: InvalidDocument/);
  });
});

describe('errors never contain input text', () => {
  const SECRET_NOTE = `${NOTE} Unique synthetic marker ZXQ-7781.`;

  async function failure(fake: FakeAzure, extra: Parameters<typeof adapter>[1] = {}, signal?: AbortSignal) {
    const err = await adapter(fake, extra)
      .analyze(SECRET_NOTE, { signal })
      .then(
        () => undefined,
        (e: unknown) => e
      );
    expect(err).toBeDefined();
    const text = `${(err as Error).message} ${String((err as Error).stack)}`;
    expect(text).not.toContain('ZXQ-7781');
    expect(text).not.toContain('chest pain');
    return err as AzureHealthError;
  }

  it('401 on submit', async () => {
    const fake = new FakeAzure({
      submitError: {
        status: 401,
        body: { error: { code: '401', message: 'Access denied due to invalid subscription key or wrong API endpoint.' } },
      },
    });
    const err = await failure(fake);
    expect(err).toBeInstanceOf(AzureHealthError);
    expect(err.status).toBe(401);
    expect(err.message).toMatch(/HTTP 401: 401: Access denied/);
    expect(fake.polls).toHaveLength(0);
  });

  it('400 without a JSON body', async () => {
    const fake = new FakeAzure({ submitError: { status: 400, body: 'not-json' } });
    const f: typeof fetch = async (input, init) =>
      (init?.method === 'POST' ? new Response('<html>bad</html>', { status: 400 }) : fake.fetch(input, init));
    const err = await failure(fake, { fetch: f });
    expect(err.message).toBe('Azure health submit request failed with HTTP 400');
  });

  it('failed job', async () => {
    const fake = new FakeAzure({
      finalState: () => ({
        status: 'failed',
        errors: [{ code: 'InternalServerError', message: 'Job failed.', innererror: { code: 'ModelVersionIncorrect' } }],
      }),
    });
    const err = await failure(fake);
    expect(err.message).toBe('Azure health job failed: InternalServerError: Job failed. (ModelVersionIncorrect)');
    expect(err.code).toBe('InternalServerError');
  });

  it('cancelled job', async () => {
    const fake = new FakeAzure({ finalState: () => ({ status: 'cancelled' }) });
    const err = await failure(fake);
    expect(err.message).toMatch(/cancelled/);
  });

  it('partiallyCompleted with results is accepted', async () => {
    const fake = new FakeAzure({
      finalState: () => ({
        status: 'partiallyCompleted',
        tasks: { items: [{ kind: 'HealthcareLROResults', status: 'succeeded', results: fixtureResults() }] },
      }),
    });
    const result = await adapter(fake).analyze(NOTE);
    expect(result.entities).toHaveLength(9);
  });

  it('poll timeout', async () => {
    const fake = new FakeAzure({ runningPolls: Number.POSITIVE_INFINITY });
    const err = await failure(fake, { pollIntervalMs: 5, maxPollMs: 30 });
    expect(err.message).toBe('Azure health job did not finish within 30 ms');
    expect(err.code).toBe('PollTimeout');
  });

  it('poll HTTP error', async () => {
    const fake = new FakeAzure({ operationLocation: () => `${ENDPOINT}/language/analyze-text/jobs/missing?api-version=2023-04-01` });
    const err = await failure(fake);
    expect(err.status).toBe(404);
    expect(err.message).toMatch(/status request failed with HTTP 404: NotFound/);
  });

  it('refuses an operation-location on another origin', async () => {
    const fake = new FakeAzure({ operationLocation: (id) => `https://elsewhere.example.com/jobs/${id}` });
    const err = await failure(fake);
    expect(err.message).toMatch(/does not match the configured endpoint origin/);
    expect(fake.polls).toHaveLength(0);
  });

  it('abort while polling', async () => {
    const fake = new FakeAzure({ runningPolls: Number.POSITIVE_INFINITY });
    const controller = new AbortController();
    setTimeout(() => controller.abort(new Error('caller aborted')), 20);
    const err = await failure(fake, { pollIntervalMs: 5 }, controller.signal);
    expect(err.message).toBe('caller aborted');
  });

  it('abort before start', async () => {
    const fake = new FakeAzure();
    const controller = new AbortController();
    controller.abort();
    await failure(fake, {}, controller.signal);
    expect(fake.requests).toHaveLength(0);
  });
});

describe('retries', () => {
  type Step = Response | Error;

  /** Serve scripted failures for the given method before falling through to the fake */
  function flaky(fake: FakeAzure, method: 'POST' | 'GET', steps: Step[] | (() => Step)) {
    let calls = 0;
    const f: typeof fetch = async (input, init) => {
      if ((init?.method ?? 'GET') === method) {
        calls++;
        const step = typeof steps === 'function' ? steps() : steps.shift();
        if (step) {
          if (init?.signal?.aborted) throw init.signal.reason;
          if (step instanceof Error) throw step;
          return step;
        }
      }
      return fake.fetch(input, init);
    };
    return { fetch: f, calls: () => calls };
  }

  const status = (code: number, headers: Record<string, string> = {}, body: unknown = { error: { code: 'TooManyRequests', message: 'Rate limit exceeded.' } }) =>
    new Response(JSON.stringify(body), { status: code, headers: { 'content-type': 'application/json', ...headers } });

  async function rejection(promise: Promise<unknown>): Promise<AzureHealthError> {
    const err = await promise.then(
      () => undefined,
      (e: unknown) => e
    );
    expect(err).toBeDefined();
    const text = `${(err as Error).message} ${String((err as Error).stack)}`;
    expect(text).not.toContain('chest pain');
    return err as AzureHealthError;
  }

  it('retries a 429 submit after Retry-After, then succeeds', async () => {
    vi.useFakeTimers();
    const fake = new FakeAzure({ results: fixtureResults });
    const f = flaky(fake, 'POST', [status(429, { 'retry-after': '2' })]);
    const promise = adapter(fake, { fetch: f.fetch }).analyze(NOTE);

    await vi.advanceTimersByTimeAsync(1999);
    expect(f.calls()).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(f.calls()).toBe(2);
    await vi.advanceTimersByTimeAsync(10);
    const result = await promise;
    expect(result.entities.length).toBeGreaterThan(0);
    expect(result.metadata?.retries).toBe(1);
    expect(fake.submissions).toHaveLength(1);
  });

  it('retries a 429 status poll using retry-after-ms / x-ms-retry-after-ms', async () => {
    vi.useFakeTimers();
    const fake = new FakeAzure({ results: fixtureResults, runningPolls: 0 });
    const f = flaky(fake, 'GET', [status(429, { 'retry-after-ms': '300', 'retry-after': '20' }), status(429, { 'x-ms-retry-after-ms': '200' })]);
    const promise = adapter(fake, { fetch: f.fetch }).analyze(NOTE);

    await vi.advanceTimersByTimeAsync(1); // poll interval
    expect(f.calls()).toBe(1);
    await vi.advanceTimersByTimeAsync(299);
    expect(f.calls()).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(f.calls()).toBe(2);
    await vi.advanceTimersByTimeAsync(200);
    expect(f.calls()).toBe(3);
    const result = await promise;
    expect(result.entities.length).toBeGreaterThan(0);
    expect(result.metadata?.retries).toBe(2);
  });

  it('backs off exponentially on 503 without Retry-After', async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const fake = new FakeAzure({ results: fixtureResults });
    const f = flaky(fake, 'POST', [status(503, {}, {}), status(503, {}, {})]);
    const promise = adapter(fake, { fetch: f.fetch, retryBaseDelayMs: 100 }).analyze(NOTE);

    await vi.advanceTimersByTimeAsync(49);
    expect(f.calls()).toBe(1);
    await vi.advanceTimersByTimeAsync(1); // 0.5 * 100
    expect(f.calls()).toBe(2);
    await vi.advanceTimersByTimeAsync(99);
    expect(f.calls()).toBe(2);
    await vi.advanceTimersByTimeAsync(1); // 0.5 * 200
    expect(f.calls()).toBe(3);
    await vi.advanceTimersByTimeAsync(10);
    expect((await promise).metadata?.retries).toBe(2);
  });

  it('retries 500, 502 and 504 too', async () => {
    const fake = new FakeAzure({ results: fixtureResults });
    const f = flaky(fake, 'GET', [status(500, {}, {}), status(502, {}, {}), status(504, {}, {})]);
    const result = await adapter(fake, { fetch: f.fetch, retryBaseDelayMs: 1 }).analyze(NOTE);
    expect(result.metadata?.retries).toBe(3);
  });

  it('retries a network error, then succeeds', async () => {
    const fake = new FakeAzure({ results: fixtureResults });
    const f = flaky(fake, 'POST', [new TypeError('fetch failed')]);
    const result = await adapter(fake, { fetch: f.fetch, retryBaseDelayMs: 1 }).analyze(NOTE);
    expect(result.entities.length).toBeGreaterThan(0);
    expect(result.metadata?.retries).toBe(1);
    expect(f.calls()).toBe(2);
  });

  it('throws with status 429 and the attempt count when retries are exhausted', async () => {
    const fake = new FakeAzure();
    const f = flaky(fake, 'POST', () => status(429, { 'retry-after': '0' }));
    const err = await rejection(adapter(fake, { fetch: f.fetch }).analyze(NOTE));
    expect(err).toBeInstanceOf(AzureHealthError);
    expect(err.status).toBe(429);
    expect(err.code).toBe('TooManyRequests');
    expect(err.message).toBe(
      'Azure health submit request was rate limited (HTTP 429) after 5 attempts: TooManyRequests: Rate limit exceeded.'
    );
    expect(f.calls()).toBe(5);
    expect(fake.polls).toHaveLength(0);
  });

  it('throws a NetworkError after repeated network failures', async () => {
    const fake = new FakeAzure();
    const cause = new TypeError('fetch failed');
    const f = flaky(fake, 'POST', () => cause);
    const err = await rejection(adapter(fake, { fetch: f.fetch, maxRetries: 2, retryBaseDelayMs: 1 }).analyze(NOTE));
    expect(err.message).toBe('Azure health submit request failed with a network error after 3 attempts');
    expect(err.code).toBe('NetworkError');
    expect(err.status).toBeUndefined();
    expect(err.cause).toBe(cause);
    expect(f.calls()).toBe(3);
  });

  it('does not retry 401, 400 or 404', async () => {
    for (const code of [401, 400, 404]) {
      const fake = new FakeAzure();
      const f = flaky(fake, 'POST', () => status(code, {}, { error: { code: String(code), message: 'No.' } }));
      const err = await rejection(adapter(fake, { fetch: f.fetch, retryBaseDelayMs: 1 }).analyze(NOTE));
      expect(err.status).toBe(code);
      expect(err.message).toBe(`Azure health submit request failed with HTTP ${code}: ${code}: No.`);
      expect(f.calls()).toBe(1);
    }
  });

  it('does not retry a caller abort raised by fetch', async () => {
    const fake = new FakeAzure();
    const controller = new AbortController();
    const f: typeof fetch = async () => {
      controller.abort(new Error('caller aborted'));
      throw controller.signal.reason;
    };
    const spy = vi.fn(f);
    const err = await rejection(adapter(fake, { fetch: spy as typeof fetch }).analyze(NOTE, { signal: controller.signal }));
    expect(err.message).toBe('caller aborted');
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('rejects promptly when aborted during a retry wait', async () => {
    const fake = new FakeAzure();
    const f = flaky(fake, 'POST', () => status(429, { 'retry-after': '10' }));
    const controller = new AbortController();
    setTimeout(() => controller.abort(new Error('caller aborted')), 20);
    const started = Date.now();
    const err = await rejection(adapter(fake, { fetch: f.fetch }).analyze(NOTE, { signal: controller.signal }));
    expect(err.message).toBe('caller aborted');
    expect(Date.now() - started).toBeLessThan(1000);
    expect(f.calls()).toBe(1);
  });

  it('maxRetries 0 disables retries', async () => {
    const fake = new FakeAzure();
    const f = flaky(fake, 'POST', () => status(503, {}, {}));
    const err = await rejection(adapter(fake, { fetch: f.fetch, maxRetries: 0 }).analyze(NOTE));
    expect(err.status).toBe(503);
    expect(err.message).toBe('Azure health submit request failed with HTTP 503');
    expect(f.calls()).toBe(1);
  });

  it('poll retries never wait past maxPollMs', async () => {
    const fake = new FakeAzure();
    const f = flaky(fake, 'GET', () => status(503, { 'retry-after': '10' }, {}));
    const started = Date.now();
    const err = await rejection(adapter(fake, { fetch: f.fetch, maxPollMs: 200 }).analyze(NOTE));
    expect(err.code).toBe('PollTimeout');
    expect(err.message).toBe('Azure health job did not finish within 200 ms');
    expect(Date.now() - started).toBeLessThan(1000);
    expect(f.calls()).toBe(1);
  });

  it('poll retries with short delays still stop at maxPollMs', async () => {
    vi.useFakeTimers();
    const fake = new FakeAzure();
    const f = flaky(fake, 'GET', () => status(503, { 'retry-after-ms': '40' }, {}));
    const promise = rejection(adapter(fake, { fetch: f.fetch, maxPollMs: 100, maxRetries: 100 }).analyze(NOTE));
    await vi.advanceTimersByTimeAsync(200);
    const err = await promise;
    expect(err.code).toBe('PollTimeout');
    // poll at 1 ms, retries at 41 and 81; a retry at 121 would pass the deadline
    expect(f.calls()).toBe(3);
  });

  it('caps jittered backoff and server delays at maxRetryDelayMs', async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0.9999);
    const fake = new FakeAzure({ results: fixtureResults });
    const f = flaky(fake, 'POST', [status(503, {}, {}), status(503, {}, {}), status(429, { 'retry-after': '120' })]);
    const promise = adapter(fake, { fetch: f.fetch, retryBaseDelayMs: 1000, maxRetryDelayMs: 1500 }).analyze(NOTE);

    await vi.advanceTimersByTimeAsync(999); // floor(0.9999 * 1000)
    expect(f.calls()).toBe(2);
    await vi.advanceTimersByTimeAsync(1498);
    expect(f.calls()).toBe(2);
    await vi.advanceTimersByTimeAsync(1); // min(2000, 1500) * 0.9999
    expect(f.calls()).toBe(3);
    await vi.advanceTimersByTimeAsync(1500); // Retry-After 120 s capped at 1.5 s
    expect(f.calls()).toBe(4);
    await vi.advanceTimersByTimeAsync(10);
    expect((await promise).metadata?.retries).toBe(3);
  });

  it('gets a fresh token for every attempt', async () => {
    const fake = new FakeAzure({ results: fixtureResults });
    const f = flaky(fake, 'POST', [status(503, {}, {})]);
    let n = 0;
    const getToken = vi.fn(async () => `token-${++n}`);
    const result = await new AzureHealthAdapter({
      endpoint: ENDPOINT,
      getToken,
      pollIntervalMs: 1,
      retryBaseDelayMs: 1,
      fetch: f.fetch,
    }).analyze(NOTE);
    expect(result.metadata?.retries).toBe(1);
    expect(getToken).toHaveBeenCalledTimes(f.calls() + fake.polls.length);
    expect(fake.requests[0].headers.authorization).toBe('Bearer token-2');
  });
});

describe('estimateCost', () => {
  it('counts started 1,000-character text records per document', () => {
    const a = new AzureHealthAdapter({ endpoint: ENDPOINT, apiKey: 'k' });
    expect(a.estimateCost('')).toEqual({ units: 0, unitType: 'text-records', currency: 'USD' });
    expect(a.estimateCost('x').units).toBe(1);
    expect(a.estimateCost('x'.repeat(1000)).units).toBe(1);
    expect(a.estimateCost('x'.repeat(1001)).units).toBe(2);
    // 250,001 chars, no separators: 125,000 + 125,000 + 1 → 125 + 125 + 1
    expect(a.estimateCost('x'.repeat(250_001)).units).toBe(251);
    expect(a.estimateCost('x').estimatedCost).toBeUndefined();
  });
});

describe('with MedicalAnalyzer', () => {
  const PHONE = '555-867-5309';
  const NOTE_WITH_PHI = `${NOTE}\nPhone: ${PHONE}`;

  /** Echo the fixture entities at wherever their text occurs in the received document */
  const located = (docs: SubmittedDocument[]): AzureHealthcareResults => {
    const r = fixtureResults();
    const doc = r.documents![0];
    doc.id = docs[0].id;
    for (const e of doc.entities!) e.offset = docs[0].text.indexOf(e.text);
    return r;
  };

  it('returns merged entities with provider codes, and the provider never sees the phone number', async () => {
    const fake = new FakeAzure({ results: located });
    const analyzer = new MedicalAnalyzer({ providers: [adapter(fake)] });
    const result = await analyzer.analyze(NOTE_WITH_PHI);

    const sent = fake.submissions.flat().map((d) => d.text).join('');
    expect(sent).not.toContain(PHONE);
    expect(sent).toContain('Lisinopril');

    expect(result.metadata.provider).toBe('azure-health');
    expect(result.metadata.phiSpansProtected).toBeGreaterThan(0);
    const lisinopril = result.entities.find((e) => e.text === 'Lisinopril');
    expect(lisinopril?.sources).toContain('azure-health');
    expect(lisinopril?.codes).toContainEqual({ system: 'RXNORM', code: '29046' });
    const htn = result.entities.find((e) => e.text === 'Essential hypertension');
    expect(htn?.codes).toContainEqual({ system: 'ICD10CM', code: 'I10' });
    const chestPain = result.entities.find((e) => e.text === 'chest pain');
    expect(chestPain?.isNegated).toBe(true);
    expect(result.relations.some((r) => r.type === 'DosageOfMedication')).toBe(true);
    for (const e of result.entities) expect(result.text.slice(e.startOffset, e.endOffset)).toBe(e.text);
  });
});
