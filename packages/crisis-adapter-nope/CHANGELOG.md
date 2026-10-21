# @meddevkit/crisis-adapter-nope

## 0.1.1

### Patch Changes

- First release published from GitHub Actions via npm trusted publishing,
  with provenance. No code changes.

## 0.1.0

### Minor Changes

- README: measured results from one local run (Ollama, Q8_0): on the fresh
  held-out set crisis recall rose from 15/31 to 31/31 and any-flag recall
  from 36/56 to 53/56; the model added 11/134 everyday/idiom false alarms on
  the dev set. A `chronic`-to-`concern` mapping was tested and rejected.
- Initial release (in development, unreviewed): `NopeEdgeAdapter`, a
  `CrisisSecondOpinion` for `screenTextWithSecondOpinion` in
  `@meddevkit/crisis-signals` 0.2, backed by a **self-hosted** nope-edge
  model on any OpenAI-compatible chat-completions server (Ollama, llama.cpp
  `llama-server`, vLLM, SGLang).
- Calls `${baseUrl}/chat/completions` with `fetch` only (no SDK, no runtime
  dependencies). Sends the format the model card prescribes: no system
  prompt, the text as the single user message, `temperature: 0` and
  `max_tokens: 300` by default.
- Parses the model's `<risks>` XML: robust to code fences, `<think>` blocks
  and whitespace; drops risks whose type is not one of the 9 documented
  types or whose severity is `none`, as NOPE's own parser does; throws on
  unparseable output instead of reporting "no risk". `features` are never
  used for decisions.
- Maps risks to levels: self-attributed `suicide`/`self_harm` at moderate,
  high or critical severity to `crisis`; mild to `concern`; subject `other`
  or `unknown`, and `self_neglect`, to `concern` at most; other risk types
  to `providerScores` only. `immediacy` from `urgent`/`emergency`
  imminence. `raw` holds the parsed risks only, never the reflection.
- Retries HTTP 429, 5xx and network errors with `Retry-After` support or
  exponential backoff with full jitter (`retries`, `retryBaseDelayMs`,
  `maxRetryDelayMs`); per-attempt `requestTimeoutMs`; passes the caller's
  abort signal to `fetch`. Errors (`NopeEdgeError`) never contain the input
  text, the response body or model output.
- `scripts/eval.mjs` (repository only) compares local-only and combined
  SPEC §8 metrics with Wilson confidence intervals.
