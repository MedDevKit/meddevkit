# @meddevkit/crisis-adapter-nope

An opt-in second opinion for
[`@meddevkit/crisis-signals`](https://github.com/MedDevKit/meddevkit/tree/main/packages/crisis-signals)
from **nope-edge**, NopeNet's MIT-licensed crisis classifier (a Qwen3-4B
fine-tune), running on a server **you host**.

`@meddevkit/crisis-signals` is a keyword-and-context screen for first-person crisis language. It is not a diagnostic or risk-assessment tool, it will miss some expressions of risk, and it must never be the only safeguard. Route any flagged text to a person according to your own escalation policy.

This adapter does not change any of that. Adding a model's opinion can raise
a flag the patterns missed. The combination is still not a diagnostic or
risk-assessment tool, it will still miss some expressions of risk, and it
must never be the only safeguard.

> **Status: in development, unreviewed.** No clinician has reviewed the
> mapping from the model's output to the screen's levels. Do not describe
> this adapter, or the screen combined with it, as validated. The combined
> numbers in [Measured results](#measured-results) come from one run on one
> machine, not from CI. Measure your own deployment with
> [`scripts/eval.mjs`](#evaluating).

- `fetch` only: no SDK and no runtime dependencies
- Works with any OpenAI-compatible chat-completions server: Ollama,
  llama.cpp `llama-server`, vLLM, SGLang
- Retries, timeouts and abort signals; errors never contain text

> **Your responsibility**
>
> - **Self-hosted only.** The adapter sends each text to the server at
>   `baseUrl`, which you choose, run and secure. Crisis-related text is
>   health information. Where that server runs, what it logs, who can reach
>   it, how the text travels (use TLS for anything beyond `localhost`) and
>   any HIPAA or other legal duties are yours. The adapter itself logs
>   nothing.
> - **Do not use NOPE's hosted API for health data.** NopeNet's privacy
>   policy says: "We do not sign Business Associate Agreements (BAAs) at this
>   time. Our services are not intended for use with Protected Health
>   Information (PHI)." This adapter does not call that API; it talks only to
>   the model server you configure.
> - **A second opinion only.** The model's own
>   [disclaimer](https://huggingface.co/nopenet/nope-edge/blob/main/DISCLAIMER.md)
>   lists "Real-time, time-critical, or emergency assessment" and any
>   significant action "taken **solely** on an Edge output without human
>   review" as out of scope. So the adapter only ever **raises** a flag for a
>   person to review. It never lowers the offline screen's level, and it must
>   never be the only safeguard. The disclaimer also asks deployers to give
>   people informed consent about the model's role and a way to dispute a
>   classification.
> - **No compliance claim.** This package makes no HIPAA or other regulatory
>   compliance claim.

## Install

```bash
npm install @meddevkit/crisis-adapter-nope @meddevkit/crisis-signals
```

`@meddevkit/crisis-signals` (>= 0.2) is a peer dependency.

## Run the model

You need a model server first. Each of these exposes an OpenAI-compatible
`/v1/chat/completions` endpoint. Keep it bound to `127.0.0.1`, or behind
authentication and TLS, unless you mean to share it.

### Ollama (GGUF, CPU or Apple Silicon)

NopeNet publishes a GGUF build with a ready `Modelfile` (temperature 0):

```bash
huggingface-cli download nopenet/nope-edge-GGUF nope-edge-q8_0.gguf Modelfile --local-dir nope-edge
cd nope-edge && ollama create nope-edge -f Modelfile
```

```ts
new NopeEdgeAdapter({ baseUrl: 'http://localhost:11434/v1', model: 'nope-edge' });
```

The GGUF card lists about 5 GB of RAM and about 2 s per call on CPU for the
Q8_0 4B model.

### llama.cpp `llama-server`

```bash
huggingface-cli download nopenet/nope-edge-GGUF nope-edge-q8_0.gguf --local-dir nope-edge
llama-server -m nope-edge/nope-edge-q8_0.gguf --chat-template chatml --host 127.0.0.1 --port 8080
```

`--chat-template chatml` gives the same prompt layout as NopeNet's
`Modelfile`.

```ts
new NopeEdgeAdapter({ baseUrl: 'http://localhost:8080/v1', model: 'nope-edge' });
```

### vLLM or SGLang (GPU)

These are the model card's commands, with `--host 127.0.0.1` added:

```bash
# vLLM
python -m vllm.entrypoints.openai.api_server \
    --model nopenet/nope-edge --dtype bfloat16 --max-model-len 2048 \
    --host 127.0.0.1 --port 8000

# SGLang
python -m sglang.launch_server --model nopenet/nope-edge --dtype bfloat16 \
    --host 127.0.0.1 --port 8000
```

```ts
new NopeEdgeAdapter({ baseUrl: 'http://localhost:8000/v1', model: 'nopenet/nope-edge' });
```

With `--max-model-len 2048`, a text longer than about 1,700 tokens is
rejected by the server. The adapter reports that as an error, and the
combined result falls back to the offline screen.

## Usage

```ts
import { screenTextWithSecondOpinion } from '@meddevkit/crisis-signals';
import { NopeEdgeAdapter } from '@meddevkit/crisis-adapter-nope';

const nope = new NopeEdgeAdapter({
  baseUrl: 'http://localhost:11434/v1', // your own server
  model: 'nope-edge',
});

const r = await screenTextWithSecondOpinion(text, nope, { timeoutMs: 10000 });

r.level;     // max(offline level, model level): the model can raise, never lower
r.immediacy; // offline immediacy, or the model's when the final level is 'crisis'
r.local;     // exactly what screenText(text) returns
r.raisedBy;  // 'local' | 'secondOpinion' | 'both' | 'none'
r.degraded;  // true when the model did not answer usably; r.level is then the offline level
r.secondOpinion; // { name: 'nope-edge', version, status, result?, reason?, durationMs }

if (r.level !== 'none') {
  // Route the text to a person under your escalation policy.
  // raisedBy 'secondOpinion' means no rule, span or modifiers explain the flag.
}
```

`screenTextWithSecondOpinion` never rejects because of the adapter. If the
server is down, slow, returns an error or returns output the adapter cannot
parse, you get the offline result with `degraded: true`. Aborting your
`signal` rejects with an `AbortError` and aborts the HTTP request.

The library shows no crisis resources, because the right ones depend on
locale and setting. For example, a US consumer might surface 988 (Suicide &
Crisis Lifeline) on `crisis`.

The adapter can also be called on its own:
`await nope.assess(text, { signal })` returns the mapped
`SecondOpinionResult`, or throws a `NopeEdgeError`.

## Configuration

| Option | Default | Description |
| --- | --- | --- |
| `baseUrl` | (required) | OpenAI-compatible base URL including the version path, e.g. `http://localhost:11434/v1`. The adapter POSTs to `${baseUrl}/chat/completions` |
| `model` | (required) | Model name on that server: the Ollama tag (`nope-edge`) or the vLLM/SGLang model id (`nopenet/nope-edge`) |
| `apiKey` | | Sent as `Authorization: Bearer <apiKey>`. Keep it server-side |
| `fetch` | `globalThis.fetch` | Custom `fetch` (tests, proxies) |
| `temperature` | `0` | The model card decodes greedily (`do_sample=False`, `"temperature": 0`), and so does the Modelfile. Always sent, so a server default (the weights' `generation_config.json` says 0.6) cannot apply |
| `maxTokens` | `300` | `max_tokens`, as the model card uses. Output cut off before `</risks>` is an error, never "no risk" |
| `requestTimeoutMs` | `10000` | Time for each attempt, including reading the body; `0` disables it. A timed-out attempt is not retried |
| `retries` | `2` | Retries after HTTP 429, any 5xx or a network error; `0` disables them |
| `retryBaseDelayMs` | `250` | Base for exponential backoff with full jitter, when the server sends no `retry-after-ms` or `Retry-After` |
| `maxRetryDelayMs` | `2000` | Cap on any single retry wait, including server-requested ones |

The constructor throws a `NopeEdgeError` with code `InvalidConfig` for a
missing or non-http(s) `baseUrl`, an empty `model` or an out-of-range number.

`screenTextWithSecondOpinion`'s `timeoutMs` (default 10000) bounds the whole
call, retries included. A model on CPU takes about 1–2 s per call, and the
first call after a server starts can take much longer while the model loads.

## Mapping

Each `<risk>` the model returns maps to a level:

| nope-edge `type` | `subject` | `severity` | Level |
|---|---|---|---|
| `suicide`, `self_harm` | `self` | `moderate`, `high`, `critical` | `crisis` |
| `suicide`, `self_harm` | `self` | `mild` | `concern` |
| `suicide`, `self_harm` | `self` | a value outside the documented set | `concern` |
| `suicide`, `self_harm` | `other` | any | `concern` (at most; never `none`) |
| `suicide`, `self_harm` | `unknown` or missing | any | `concern` |
| `self_neglect` | any | any | `concern` |
| `violence`, `abuse`, `sexual_violence`, `exploitation`, `stalking`, `neglect` | any | any | `none`: recorded in `providerScores` only. Risk to others is out of scope until v2 |
| `<risks/>` (no risk) | | | `none` |

Then:

| Result field | Value |
|---|---|
| `level` | The highest level over all risks |
| `subject` | The subject of a risk at that level, preferring `self`, then `unknown`, then `other`. Omitted when the level is `none` |
| `immediacy` | `true` when any `suicide` or `self_harm` risk whose subject is not `other` has `imminence` `urgent` or `emergency`. The combiner uses it only when the final level is `crisis` |
| `providerScores` | `risks` (the number of risks), and for each risk `i`: `risk.<i>.type`, `risk.<i>.subject`, `risk.<i>.severity`, `risk.<i>.imminence` |
| `raw` | `{ risks }`: the parsed risks only. Never the model's reflection, which can quote the input |

Why:

- **Only a self-attributed signal reaches `crisis`.** A risk about someone
  else (`other`), or one the model cannot attribute (`unknown`), raises the
  level to `concern` at most. It is never dropped, because NopeNet says
  subject attribution "is not always reliable — do not use it to dismiss or
  deprioritize a detection". The combiner in `@meddevkit/crisis-signals`
  applies the same cap to `subject: 'other'` again, as a safety net.
- **`self_neglect`** (eating disorders, medical neglect) is related but not
  a suicide or self-harm signal, so it raises to `concern` at most.
- **`features` are never used.** The card calls them "low-confidence" and
  says "don't gate decisions on it". Label-like values are kept in `raw` for
  your audit.

## What the model adds, and what it cannot do

- **It can catch what the patterns miss.** On text it was not written
  against, the offline screen catches about half of crisis statements (see
  the `@meddevkit/crisis-signals` README). The misses are mostly oblique
  language. In our run the model caught all 16 crisis statements the
  patterns missed on the fresh held-out set (see
  [Measured results](#measured-results)). NopeNet's own figures ("~92%
  recall, ~75% specificity" for a single call) are self-reported on a test
  suite it does not name.
- **A model-only flag is unexplained.** It has no rule id, span, offsets or
  modifiers. Route it to a person on the same footing as any other flag.
- **Known weaknesses** listed in the model's disclaimer: deep multi-turn
  needles ("~33% detection at 18–25 turns"), "resolution syndrome", and
  implicit, religious or metaphorical ideation. False positives and false
  negatives will occur.
- **It raises false alarms** that the offline screen's context handling
  avoids: about 8% of everyday sentences in our run ("cut myself shaving",
  "pills with lunch"), rated high severity by the model itself.
- **It often rates one level too high.** Statements about the past ("I used
  to cut in high school"), negated statements and some "I can't take it"
  messages often come back as `crisis`, and mentions of a friend or relative
  as `concern`. Every flag goes to a person anyway, but expect more `crisis`
  flags to review than the offline screen alone produces.
- **English text, one message.** The model card serializes a multi-turn
  conversation into one string (`"User: ...\n\nAI: ...\n\nUser: ..."`). If
  you want that, pass the serialized text yourself.

## Measured results

One run, 2026-10-20: `@meddevkit/crisis-signals` 0.2.0 patterns, this
adapter's default mapping, the nope-edge Q8_0 GGUF on Ollama, an Apple
Silicon Mac. All 766 calls succeeded. A warm call took about 1.3 s (the
first about 3 s). Counts with Wilson 95% confidence intervals:

**Fresh held-out set** (`vectors.heldout.v2.jsonl`, 167 vectors written
without seeing the patterns; the honest number):

| Metric | Offline screen alone | Combined with nope-edge |
|---|---|---|
| Crisis recall | 15/31 = 48% (32–65%) | **31/31 = 100% (89–100%)** |
| Any-flag recall | 36/56 = 64% (51–76%) | **53/56 = 95% (85–98%)** |
| Grief false alarms (`crisis`) | 0/14 | 0/14 |
| Idiom and everyday false alarms | 2/34 = 6% | 2/34 = 6% |

The 3 statements still missed are all threats against the writer from
another person. This adapter maps nope-edge's `violence` and `abuse` risks
to `none` (risk involving others is out of scope until v2), so it does not
raise them.

**Dev set** (`vectors.jsonl`, 534 vectors). The patterns were written
against this set and catch all of it, so it measures only what the model
adds in false alarms. The model never saw it:

| Metric | Offline screen alone | Combined with nope-edge |
|---|---|---|
| Crisis recall | 172/172 | 172/172 (model alone: 167/172) |
| Grief false alarms (`crisis`) | 0/28 | 0/28 |
| Idiom and everyday false alarms | 0/134 | **11/134 = 8.2% (4.6–14.1%)** |

**First held-out set** (`vectors.heldout.jsonl`, 65 vectors): crisis recall
10/11 → 11/11, any-flag recall 18/19 → 19/19, idiom and everyday false
alarms 0/16 → 1/16.

**Mapping alternatives tested** (on the dev set only): lowering risks the
model marks `chronic` to `concern` halved the past-history statements
raised to `crisis` (9 → 4 of 39), but also dropped model-alone crisis recall
from 167 to 162 of 172, because the model marks some current crises
`chronic`. A safety screen should not trade recall for fewer reviews, so the
mapping is unchanged.

These are synthetic, unreviewed vectors, small samples and one model build.
They are not a validation.

## How the text is sent

From the [model card](https://huggingface.co/nopenet/nope-edge) (read
2026-10-18): no system prompt, and one user message whose content is the
text itself, unchanged. The adapter sends exactly that, with
`temperature: 0`, `max_tokens: 300` and `stream: false`:

```json
{
  "model": "nope-edge",
  "messages": [{ "role": "user", "content": "<your text>" }],
  "temperature": 0,
  "max_tokens": 300,
  "stream": false
}
```

The card advises keeping emojis, punctuation, slang and casual spelling, and
removing only zero-width characters, decorative fonts and excessive
whitespace. The adapter does no preprocessing; do that yourself if you want
it.

## Parsing

The model answers with a `<reflection>` (free-text reasoning) and a
`<risks>` element:

```xml
<reflection>...</reflection>
<risks>
  <risk subject="self" type="suicide" severity="high" imminence="urgent"/>
</risks>
```

or `<risks/>` for no risk. The parser:

- drops every `<risk>` whose `type` is not one of the 9 documented types, or
  whose `severity` is `none` or missing, as NOPE's own parser does;
- ignores code fences, a `<think>` block, the reflection, and extra or
  missing whitespace; attribute values are case-insensitive;
- turns attribute values outside the documented sets into `unknown`
  (subject) or `unrecognised` (severity, imminence), so no free text from
  the model reaches the result;
- **throws** when there is no `<risks>` element, when `<risks>` is not
  closed (for example when the output hit `maxTokens`), or when a `<risk>` is
  malformed. Unparseable output is never read as "no risk"; the combined
  result is marked `degraded`.

`parseNopeOutput` and `mapNopeRisks` are exported if you call the model
yourself.

## Errors, retries and timeouts

Every failure throws a `NopeEdgeError` with a `code`, and an HTTP `status`
where there is one:

| Code | When |
|---|---|
| `HttpError` | A non-2xx response, after retries for 429 and 5xx |
| `NetworkError` | No HTTP response (connection refused, reset, DNS), after retries. The message may name a system code such as `ECONNREFUSED` |
| `Timeout` | No complete response within `requestTimeoutMs` |
| `InvalidResponse`, `EmptyResponse` | The body is not a chat completion, or it has no message content |
| `ParseError` | The model output is not the documented XML |
| `Aborted` | The request was aborted by something other than your signal |
| `InvalidConfig`, `InvalidInput`, `NoFetch` | Bad configuration, a non-string text, or no `fetch` available |

When your own `signal` aborts, the adapter rejects with your signal's reason,
as `fetch` does.

Retries cover HTTP 429, every 5xx and network errors, up to `retries` times.
The wait comes from the response's `retry-after-ms` or `Retry-After`
header, else exponential backoff with full jitter, capped at
`maxRetryDelayMs`. Other 4xx responses, timeouts and aborts are not retried.

## Privacy

- No logging and no telemetry.
- Error messages are fixed text plus, at most, an HTTP status, an attempt
  count or a system error code. They never contain the input text, the
  server's response body or the model's output, and no `cause` is attached.
  The combiner in `@meddevkit/crisis-signals` drops adapter errors anyway.
- The model's reflection is discarded as soon as the answer is parsed. It
  can quote the input, so it never reaches the result, `raw` or an error.
- The text goes to the server at `baseUrl`, and only there. What that server
  keeps is up to you: check its request logging (for example vLLM's and
  SGLang's request logs, or a reverse proxy's access log).

## Evaluating

From a checkout of this repository, after `pnpm build`:

```bash
node packages/crisis-adapter-nope/scripts/eval.mjs packages/crisis-signals/data/vectors.jsonl \
  --base-url http://localhost:11434/v1 --model nope-edge
```

It sends every vector's text to your server, one at a time, and prints the
SPEC §8 metrics for the offline screen alone and combined with the model:
crisis recall, any-flag recall, the grief false-alarm rate and the idiom and
everyday false-alarm rate, each with a Wilson 95% confidence interval. It
also prints how many calls failed and which vectors the model raised. It
never prints vector text or model output. Tune on the dev set
(`vectors.jsonl`) only; the held-out sets are for release scoring.

## Licence and attribution

This package is MIT-licensed. It does not include or redistribute the model
weights; you download them from NopeNet.

nope-edge is © 2026 NopeNet, LLC, under the MIT licence. It is built on
Qwen3-4B (© Alibaba Cloud, Apache-2.0). See [`NOTICE`](./NOTICE). This
package is not affiliated with or endorsed by NopeNet.

If anyone is in immediate danger, contact local emergency services.
