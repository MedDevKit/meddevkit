# @meddevkit/adapter-azure

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
