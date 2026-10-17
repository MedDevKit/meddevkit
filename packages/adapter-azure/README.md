# @meddevkit/adapter-azure

Azure AI Language **Text Analytics for health** adapter for
[`@meddevkit/chunker`](https://www.npmjs.com/package/@meddevkit/chunker)'s
`MedicalAnalyzer`.

It turns a clinical note into MedDevKit's provider-neutral entities: diagnoses,
symptoms, medications with dosage/route/frequency, negation and other
assertions, relations, and codes (ICD-10-CM, SNOMED CT, RxNorm, UMLS, ...).

- `fetch` only: no Azure SDK and no runtime dependencies
- Runs in Node.js >= 18, modern browsers and edge runtimes
- Offsets line up with JavaScript string indices (UTF-16)

> **Your responsibility:** this adapter sends clinical text to Microsoft Azure.
> Only do that under an agreement that permits it (for PHI, a Business
> Associate Agreement with Microsoft covering the Language service) and with
> a configuration that meets your own HIPAA and security requirements.
> `MedicalAnalyzer` masks PHI it detects before calling the adapter, but that
> detection is regex-based and best-effort. It is **not** HIPAA
> de-identification (neither Safe Harbor nor Expert Determination) and it
> misses most free-text names and other identifiers.

Text Analytics for health is not a medical device and is not a substitute for
clinical judgment; see Microsoft's
[transparency note](https://learn.microsoft.com/en-us/azure/ai-foundry/responsible-ai/language-service/transparency-note).

## Install

```bash
npm install @meddevkit/adapter-azure @meddevkit/chunker
```

`@meddevkit/chunker` (>= 0.3) is a peer dependency.

## Usage

```ts
import { MedicalAnalyzer } from '@meddevkit/chunker';
import { AzureHealthAdapter } from '@meddevkit/adapter-azure';

const analyzer = new MedicalAnalyzer({
  providers: [
    new AzureHealthAdapter({
      endpoint: process.env.AZURE_LANGUAGE_ENDPOINT!, // https://<resource>.cognitiveservices.azure.com
      apiKey: process.env.AZURE_LANGUAGE_KEY,
    }),
  ],
  // phiPolicy: 'mask' is the default: detected PHI is replaced before the text leaves the process
});

const result = await analyzer.analyze(note);

for (const e of result.entities) {
  console.log(e.category, e.text, e.isNegated, e.codes);
}
```

If Azure is unavailable or fails, `MedicalAnalyzer` falls back to its local
detectors and reports the failure in `result.metadata.providers`.

The adapter can also be used directly (no PHI masking):
`await new AzureHealthAdapter({ endpoint, apiKey }).analyze(text)`.

## Configuration

| Option | Default | Description |
| --- | --- | --- |
| `endpoint` | (required) | Language resource endpoint, `https://<resource>.cognitiveservices.azure.com` |
| `apiKey` | | Resource key, sent as `Ocp-Apim-Subscription-Key` |
| `getToken` | | `() => Promise<string>` returning a Microsoft Entra ID access token |
| `apiVersion` | `'2023-04-01'` | REST API version |
| `modelVersion` | `'latest'` | Model version |
| `language` | `'en'` | Document language (`analyze(text, { language })` overrides it) |
| `pollIntervalMs` | `1000` | Delay between job status polls when Azure sends no `Retry-After` |
| `maxPollMs` | `60000` | Give up waiting for a job after this long |
| `maxRetries` | `4` | Retries per request after a 429, 5xx or network error; `0` disables retries |
| `retryBaseDelayMs` | `1000` | Base delay for exponential backoff when Azure sends no retry header |
| `maxRetryDelayMs` | `30000` | Upper bound for any single retry wait, including server-requested ones |
| `fetch` | `globalThis.fetch` | Custom `fetch` (tests, proxies) |

### Authentication

- **Key:** pass `apiKey`. Keep it server-side; never ship a key to a browser.
- **Microsoft Entra ID:** pass `getToken`, which must return an access token
  for the scope `https://cognitiveservices.azure.com/.default`. The adapter has
  no `@azure/identity` dependency, so bring your own token source, e.g.

  ```ts
  import { DefaultAzureCredential } from '@azure/identity';
  const credential = new DefaultAzureCredential();
  const getToken = async () =>
    (await credential.getToken('https://cognitiveservices.azure.com/.default')).token;
  ```

  `getToken` is called for every request, so it should cache tokens
  (`@azure/identity` credentials do). Entra ID auth requires a resource with a
  custom subdomain endpoint. If both are given, `apiKey` is used.

`isAvailable()` only checks that an endpoint and a credential are configured;
it makes no network call.

## What is mapped

Each Azure entity becomes a `MedicalEntity`:

| `MedicalEntity` | From Azure |
| --- | --- |
| `text`, `startOffset`, `endOffset` | `text`, `offset`, `offset + length` (UTF-16 offsets in the text passed to `analyze`) |
| `category` | see table below |
| `providerCategory` | Azure `category`, always |
| `confidence` | `confidenceScore` |
| `isNegated` | `assertion.certainty` is `negative` or `negativePossible` |
| `assertion` | `certainty`, `conditionality`, `association` (only those present) |
| `codes` | `links` as `{ system: dataSource, code: id }` |
| `normalizedText` | `name` (UMLS preferred name) |
| `attributes` | `temporality` and `subcategory`, when present |
| `sources` | `['azure-health']` |

Category mapping:

| Azure category | MedDevKit `EntityCategory` |
| --- | --- |
| `Diagnosis` | `Diagnosis` |
| `SymptomOrSign` | `SymptomOrSign` |
| `MedicationName`, `MedicationClass` | `MedicationName` |
| `Dosage` | `Dosage` |
| `MedicationRoute` | `MedicationRoute` |
| `MedicationForm` | `MedicationForm` |
| `Frequency` | `MedicationFrequency` (Azure also uses it for conditions and treatments) |
| `BodyStructure` | `BodyStructure` |
| `TreatmentName` | `ProcedureName` |
| `ExaminationName` | `TestName` (diagnostic procedures, tests, vital signs) |
| `MeasurementValue` | `MeasurementValue` |
| `Time`, `Date` | `Time` |
| `ConditionQualifier`, `ConditionScale` | `Severity` (qualifiers also include quality and timing terms) |
| `Allergen` | `Allergen` |
| everything else (`Age`, `Gender`, `FamilyRelation`, `HealthcareProfession`, `MeasurementUnit`, `Direction`, `Course`, `SubstanceUse`, genomics, ...) | `Other` |

Relations become `{ type: relationType, roles: [{ role, entityIndex }],
confidence, source: 'azure-health' }`, with `entityIndex` pointing into the
result's `entities` array. Document warnings are reported as
`warnings` (warning codes only).

## Limits

- **Document size:** Azure accepts at most 125,000 characters per document
  (counted as text elements/graphemes) and 125,000 characters and 25 documents
  per job. Longer text is split into documents at the last paragraph break,
  else line break, else `'. '`, else a hard cut, before 125,000 UTF-16 code
  units. UTF-16 length is never smaller than the grapheme count, so this is a
  safe approximation. Documents are sent in as many jobs as needed, one after
  another, and offsets are shifted back onto the original text. Entities and
  relations that would span a cut are not detected.
- **Rate limits:** depend on your pricing tier; see [Retries](#retries).
- **Polling:** the job is polled until it finishes, honoring `Retry-After`,
  for at most `maxPollMs`. Aborting the signal stops polling (the Azure job
  itself is not cancelled; results expire after 24 hours).
- **Errors:** `AzureHealthError` carries the HTTP `status` and Azure error
  `code`. Error messages and warnings never contain the analyzed text. If some
  documents fail, the rest are returned with a warning; if all fail, it throws.

## Retries

Azure returns `429 Too Many Requests` under load and on the free tier. The job
submit request and every status poll are retried, up to `maxRetries` times
each (default 4, so at most 5 attempts), after:

- HTTP `429`, `500`, `502`, `503` or `504`
- a network error (`fetch` rejects)

Other `4xx` responses (`400`, `401`, `403`, `404`, ...) and aborts are never
retried.

The wait before a retry is taken from the response's `retry-after-ms` or
`x-ms-retry-after-ms` header, else `Retry-After` (seconds or HTTP date).
Without one, it is exponential backoff with full jitter: a random delay
between 0 and `retryBaseDelayMs * 2^retry`. Every wait is capped at
`maxRetryDelayMs` and stops immediately when the abort signal fires. Poll
retries also respect `maxPollMs`: a retry that would wait past the deadline
fails with the `PollTimeout` error instead.

When retries run out, the `AzureHealthError` carries the last HTTP `status`
and Azure error `code`, and its message gives the number of attempts, e.g.
`Azure health submit request was rate limited (HTTP 429) after 5 attempts`.
Repeated network failures throw with code `NetworkError`. The total number of
retries is reported as `result.metadata.retries`.

A submit that fails with a network error may still have reached Azure, so
retrying it can, rarely, create (and bill) a duplicate job whose results are
never read. Set `maxRetries: 0` and retry yourself if that matters more than
resilience. `getToken` is called again for every attempt.

## Cost

`estimateCost(text)` returns the number of billable **text records** (one per
started 1,000 characters of each document). It does not return a price:
pricing depends on tier, region and agreement; see
[Azure Language pricing](https://aka.ms/unifiedLanguagePricing).

## License

MIT
