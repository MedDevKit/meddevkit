# @meddevkit/adapter-azure

## 0.1.1

### Patch Changes

- First release published from GitHub Actions via npm trusted publishing,
  with provenance.
- Fix the `repository.url` format that npm auto-corrected on publish.

## 0.1.0

### Minor Changes

- Initial release: `AzureHealthAdapter`, a `MedicalNlpAdapter` for Azure AI
  Language Text Analytics for health, for use with `MedicalAnalyzer` from
  `@meddevkit/chunker` 0.3.
- Calls the analyze-text jobs REST API with `fetch` only (no Azure SDK, no
  runtime dependencies); works in Node >= 18, browsers and edge runtimes.
- Key (`Ocp-Apim-Subscription-Key`) or Microsoft Entra ID bearer-token auth.
- Requests UTF-16 offsets (`stringIndexType: 'Utf16CodeUnit'`) so entity
  offsets match JavaScript string indices.
- Maps entities (category, assertion, negation, UMLS-source codes,
  normalized name) and relations onto the provider-neutral entity model.
- Splits text over 125,000 characters into multiple documents and jobs and
  shifts offsets back onto the original text.
- Polls with Retry-After support, a polling deadline and abort-signal
  support. Errors and warnings never include the analyzed text.
- Retries the job submit and each status poll after HTTP 429, 500, 502, 503,
  504 or a network error, honoring `retry-after-ms`, `x-ms-retry-after-ms`
  and `Retry-After`, else exponential backoff with full jitter. Configurable
  with `maxRetries` (default 4, `0` disables), `retryBaseDelayMs` (default
  1000) and `maxRetryDelayMs` (default 30000); abort-aware and bounded by
  `maxPollMs` while polling. Other 4xx responses are not retried. The retry
  count is reported in `metadata.retries`.
