# Second-opinion model adapters for `@meddevkit/crisis-screen` (SPEC Q7)

Research date: 2026-10-18. This note answers SPEC §11 **Q7**: should the
screen offer optional adapters for model-based classifiers? It covers what
each candidate is, its terms, how to run it, what it can and cannot tell us
in the shape of SPEC §4, and how an adapter should fit the house style of
`@meddevkit/adapter-azure`. The pattern screen stays the offline default.
Every adapter is opt-in.

> **Not legal advice.** This is a reading of published terms by a non-lawyer.
> Check licences, data-processing terms and HIPAA questions with each vendor
> (and with counsel, if the project has one) before relying on them.

Claims are cited inline. **UNVERIFIED** marks anything I could not confirm
from a primary source during this search (for example, pages that blocked
automated fetches, or vendor claims with no published method).

## Summary

| Candidate | Licence / terms | Runtime | Cost | PHI / BAA | SPEC fields covered | Recommendation |
|---|---|---|---|---|---|---|
| **nope-edge** (4B) / nope-edge-mini (1.7B), self-hosted | MIT (weights); base Qwen3 Apache-2.0, keep `NOTICE.md` if you redistribute weights. Disclaimer puts real-time emergency assessment and automated action "out of scope" | Your own server: vLLM / SGLang / transformers on a GPU, or Ollama / llama.cpp (GGUF) on CPU or Apple Silicon. All expose an OpenAI-compatible chat endpoint. No ONNX build, so no browser | Free weights; your hardware (~5 GB RAM for Q8 4B, ~2 GB for mini) | Text stays on infrastructure you control; no third party. Your own HIPAA duties apply | `level` (severity), `immediacy` (imminence), `subject` (self/other/unknown), a free-text `reflection`. No spans or offsets | **Build first** (`@meddevkit/crisis-adapter-nope`) |
| NOPE Evaluate API (hosted) | Commercial API | Cloud | $0.003/call | **No BAA; "not intended for use with PHI"**; text is routed to third-party LLM providers | Same shape as nope-edge plus resources | Do not build for health use |
| **OpenAI Moderation** (`omni-moderation`) | OpenAI API terms and usage policies | Cloud, `fetch` only | **Free** | `/v1/moderations`: no abuse-monitoring retention, not used for training, ZDR-eligible. A BAA exists, but whether this endpoint is covered is UNVERIFIED | `level` (from `self-harm`, `self-harm/intent`, `self-harm/instructions`); a partial `subject` (the intent category is defined by "the speaker"). No immediacy, no spans | **Build second** (`@meddevkit/crisis-adapter-openai`) |
| Azure AI Content Safety (Analyze text) | Microsoft Product Terms; Azure OpenAI Code of Conduct applies | Cloud (regional); container in **preview** that still meters to Azure | F0: 5,000 text records/month free; S0: $0.375 per 1,000 records (1 record = 1,000 chars, East US retail) | Input not stored, not used for training, stays in region. BAA comes with the Product Terms for in-scope services; whether Content Safety is in scope is UNVERIFIED | `level` from a self-harm severity of 0–7. That severity measures how harmful the text is **to display**, not how at-risk the writer is. No subject, immediacy or spans | Later, for Azure-committed consumers only |
| Llama Guard 4 (12B) / Llama Guard 3 (1B, 8B) | Llama Community Licence: "Built with Llama", 700M MAU clause, Acceptable Use Policy (AUP). The AUP restricts **inferring health information** without a legal right. The Llama 4 AUP excludes **EU-based** licensees from its multimodal models (LG4 is multimodal) | Self-host (vLLM); LG3-1B has an ONNX build for **transformers.js** (browser). Groq deprecated hosted LG4 in March 2026 | Free weights; your hardware | Self-hosted: yours. Hosted: the provider's terms | Binary `safe/unsafe` + `S11`. S11 = responses that "enable, encourage, or endorse" self-harm, which is a policy-violation label, not a risk label. No subject, immediacy or spans | Do not build now. Maybe benchmark LG3-1B as the only in-browser LLM option |
| gpt-oss-safeguard-20b / -120b | Apache-2.0, plus a one-line usage policy ("comply with all applicable law") | Self-host (16 GB VRAM for 20B); hosted on Groq | Free weights; your hardware | Self-hosted: yours | Whatever **your written policy** asks for, since it is bring-your-own-policy (could encode §4 directly). Reasoning is free text, no spans | Watch. A strong v2 candidate for a policy-faithful second opinion |
| Hugging Face binary classifiers (sentinet/suicidality, roberta-base-suicide-prediction-phr, Mila output guardrail, enguard tiny-guard) | Mixed: CC0, MIT, Apache-2.0. Training data is mostly Reddit/Twitter scrapes labelled by subreddit | Local; ELECTRA, BERT and RoBERTa run in transformers.js once converted to ONNX | Free | Local | One binary label. No subject, immediacy, context or spans | Benchmark baseline only (as SPEC §12 already says) |
| Mistral moderation (`mistral-moderation-2603`) | Mistral API terms | Cloud | UNVERIFIED | UNVERIFIED | `level` only (self-harm category includes "plans") | Not now. Note as an alternative to OpenAI |
| Google Perspective API | Free API, **ends 31 Dec 2026** | Cloud | Free | n/a | No self-harm attribute (UNVERIFIED) | Exclude |
| AWS Comprehend toxicity | AWS terms | Cloud | Paid | AWS BAA programme (not checked) | **No self-harm category** | Exclude |
| Anthropic | No moderation endpoint; the guide prompts Claude itself as a classifier | Cloud | Per token | n/a | Whatever the prompt asks for | Exclude as an "adapter"; it is a prompt, not a classifier |

### Ranked recommendation

1. **`@meddevkit/crisis-adapter-nope`: nope-edge behind any OpenAI-compatible
   chat endpoint.** It is the only candidate whose output already has the
   shape of SPEC §4: severity, imminence, and subject self/other/unknown. Its
   card explicitly treats slang ("kms lmao") and recovery narratives as no
   risk, which is the context problem the screen exists to solve. It is MIT,
   so there is no attribution or AUP burden. It can run fully on the
   consumer's own hardware (Ollama on a laptop, vLLM on a GPU host), so crisis
   text need not leave the deployment. One `fetch`-only adapter covers Ollama,
   llama.cpp, vLLM, SGLang and dedicated hosted endpoints.
   Caveats: its evaluation is self-reported on an unnamed suite; it needs a
   model server; its free-text reflection can quote the user; and its
   disclaimer lists "real-time, time-critical, or emergency assessment" as
   out of scope. That last point fits a second opinion that only *raises* a
   flag for a human, but the README must say so.
2. **`@meddevkit/crisis-adapter-openai`: OpenAI Moderation.** It is free,
   needs one JSON `fetch` and no infrastructure, and its `self-harm/intent`
   category is defined by what "the speaker expresses", which is the
   first-person signal we care about. `/v1/moderations` has no
   abuse-monitoring retention by default and is not used for training. It is
   the cheapest way for a consumer that can make network calls to get a
   second opinion. Caveats: text leaves the device; there is no immediacy,
   subject field or explanation; the `-latest` model changes without notice
   (pin a snapshot); and BAA coverage for this endpoint is UNVERIFIED, so it
   must not receive PHI until that is confirmed in writing.

Azure Content Safety comes third. It has the best enterprise compliance
story, but its severity scale answers the wrong question (see below). The
other candidates are not worth an adapter now.

---

## 1. nope-edge (NopeNet)

**What it is.** A Qwen3-4B "LoRA fine-tune, merged to full weights" that
emits XML: a `<reflection>` (chain of thought) and `<risks>` with one element
per risk ([model card](https://huggingface.co/nopenet/nope-edge)). A 1.7B
variant, nope-edge-mini, is based on Qwen3-1.7B
([HF API](https://huggingface.co/api/models/nopenet/nope-edge-mini)).

**Output schema** (all from the [model card](https://huggingface.co/nopenet/nope-edge)):

```xml
<reflection>The user directly expresses intent to end their life with a specific timeline ("tonight") ...</reflection>
<risks>
  <risk subject="self" type="suicide" severity="high" imminence="urgent" features="active_ideation,intent_stated"/>
</risks>
```

- `subject`: `self`, `other`, `unknown`
- `type`: `suicide`, `self_harm`, `self_neglect`, `violence`, `abuse`,
  `sexual_violence`, `exploitation`, `stalking`, `neglect`. The card says
  these are the "**9 only**", with no `none` type.
- `severity`: `none`, `mild`, `moderate`, `high`, `critical`
- `imminence`: `not_applicable`, `chronic`, `subacute`, `urgent`, `emergency`
- `features`: "**Low-confidence, free-form** indicators ... it can include
  labels not supported by the input text ... don't gate decisions on it."
- No risk returns `<risks/>`. The parser must drop "any element whose `type`
  is not one of the 9 ... or whose `severity="none"`", because "that's what
  NOPE's own parser does."

**Licence.** `LICENSE.md` is MIT, copyright NopeNet, LLC. It adds: "The MIT
grant above is the complete licence for NOPE Edge — free for any use,
including commercial, with no separate agreement required ('Software' = the
model weights and accompanying files)"
([LICENSE.md](https://huggingface.co/nopenet/nope-edge/blob/main/LICENSE.md)).
The base model Qwen3-4B is Apache-2.0
([HF API](https://huggingface.co/api/models/Qwen/Qwen3-4B)), and
`NOTICE.md` carries the Apache notice
([NOTICE.md](https://huggingface.co/nopenet/nope-edge/blob/main/NOTICE.md)).
That only matters to anyone who **redistributes** the weights. An adapter
that calls a model server does not. The repo is not gated
([HF API](https://huggingface.co/api/models/nopenet/nope-edge)). The
licence imposes no dataset or usage terms.

**Intended-use statements (not licence conditions, but they bear on us).**
[DISCLAIMER.md](https://huggingface.co/nopenet/nope-edge/blob/main/DISCLAIMER.md)
says its statements "add to, and do not limit, the MIT disclaimer." It
lists as "Out of scope — do NOT deploy Edge for":

- "Autonomous intervention, escalation, or any significant action ... taken
  **solely** on an Edge output without human review."
- "Real-time, time-critical, or emergency assessment."
- "Settings without a path for people to dispute or appeal a
  classification, or without informed consent about Edge's role in your
  pipeline."

It also says subject attribution "is **informational only** and is not
always reliable — do not use it to dismiss or deprioritize a detection," and
lists "deep multi-turn needles (~33% detection at 18–25 turns),
'resolution syndrome,' and implicit/religious/metaphorical ideation" as
documented weaknesses. In MedDevKit terms: the adapter only ever *raises* a
flag for a person to review (SPEC §9: escalation is the caller's job). The
README must repeat the disclaimer, and consumers must disclose the model's
role to their users.

**Training data.** Not disclosed. The card says only "The model was trained
on real conversations with authentic expression"
([model card](https://huggingface.co/nopenet/nope-edge)). The docs'
methodology page gives no data provenance
([methodology](https://docs.nope.net/methodology)). Provenance is
UNVERIFIED.

**Hardware and serving.**
- Card: "GPU with 8GB+ VRAM (e.g., RTX 3070, A10G, L4) - or CPU (slower)",
  ~8 GB disk, bfloat16; transformers, vLLM, SGLang and a vLLM Docker image
  ([model card](https://huggingface.co/nopenet/nope-edge)).
- Official GGUF for Ollama and llama.cpp: `q4_k_m` (2.5 GB), `q8_0`
  (4.3 GB) and `f16`, with a ready `Modelfile` (temperature 0)
  ([nope-edge-GGUF](https://huggingface.co/nopenet/nope-edge-GGUF),
  [file list](https://huggingface.co/api/models/nopenet/nope-edge-GGUF/tree/main)).
  Ollama and llama.cpp's server both expose OpenAI-compatible
  `/v1/chat/completions`
  ([Ollama](https://docs.ollama.com/api/openai-compatibility),
  [llama.cpp server](https://github.com/ggml-org/llama.cpp/blob/master/tools/server/README.md)).
  vLLM and SGLang serve the same API (model card).
- Hosted: dedicated endpoints on FriendliAI
  ([Friendli](https://friendli.ai/models/nopenet/nope-edge)) and a listing
  on Featherless ([Featherless](https://featherless.ai/models/nopenet/nope-edge));
  pricing not checked (UNVERIFIED).
- **Browser:** there is no ONNX or transformers.js build of nope-edge on the
  Hub; only GGUF and AWQ variants exist
  ([HF search](https://huggingface.co/api/models?search=nope-edge)).
  transformers.js lists the Qwen3 architecture as supported
  ([README](https://github.com/huggingface/transformers.js)), so a
  conversion of the mini model *might* work in WebGPU. UNVERIFIED and not
  recommended for v1.

**Latency (vendor numbers).** Docs: nope-edge ~750 ms, mini ~260 ms;
"vLLM / SGLang A10G (24GB) 50-100+ req/sec ~50ms" p50; transformers ~200 ms;
"Ollama (GGUF) CPU / Consumer GPU 1-5 req/sec ~200ms–2s"; and "Latency =
server-side inference time (excludes network)"
([Edge docs](https://docs.nope.net/edge)). GGUF card: Q8_0 4B ~5 GB RAM,
"~2s" CPU, "~200ms" GPU; mini ~1 s CPU
([GGUF card](https://huggingface.co/nopenet/nope-edge-GGUF)).

**Evaluation claims (vendor, self-reported).** "Benchmarks on nope-edge (4B)
from our public test suite": a single call ~92% recall, ~75% specificity,
~88% accuracy; a 3-call majority panel ~100% recall, ~83% specificity
([Edge docs](https://docs.nope.net/edge)). The suite, its size and its label
source are not named on that page. Treat these as UNVERIFIED until we score
the model on our own vectors.

**Hosted alternative: NOPE Evaluate API.** `POST https://api.nope.net/v1/evaluate`,
"New integrations should use /v1/evaluate at $0.003/call"
([API reference](https://docs.nope.net/reference)). The privacy policy is
explicit: "We do not sign Business Associate Agreements (BAAs) at this time.
Our services are not intended for use with Protected Health Information
(PHI)". For `/v1/evaluate`, conversation content is "Processed in memory and
routed to LLM providers for classification"
([privacy policy](https://nope.net/privacy)). **Not suitable for health
deployments.** Self-host the open weights instead.

**Mapping to SPEC §4.**

| nope-edge | SPEC field |
|---|---|
| `type` ∈ {`suicide`, `self_harm`}, `subject` ∈ {`self`, `unknown`}, `severity` ∈ {`moderate`, `high`, `critical`} | `level: 'crisis'` |
| same types with `severity: 'mild'`; or `type: 'self_neglect'` | `level: 'concern'` |
| `subject: 'other'` (any severity) | `level: 'none'`, `subject: 'other'`, kept so the caller can ask (mirrors §4 `third_party`) |
| `imminence` ∈ {`urgent`, `emergency`} on a crisis risk | `immediacy: true` |
| `violence`, `abuse`, `sexual_violence`, `exploitation`, `stalking`, `neglect` | Out of v1 scope (SPEC Q4). Recorded in `providerScores` only |
| `<reflection>` | Optional `explanation`. It can quote the user, so it is off by default |
| (none) | `ruleId`, offsets, span and modifiers: **lost**. The flag cannot be explained in §3's terms |

**Recommended implementation.** `@meddevkit/crisis-adapter-nope`, class
`NopeEdgeAdapter({ baseUrl, model = 'nopenet/nope-edge', apiKey?, maxTokens = 300 })`.
It POSTs one user message to `${baseUrl}/v1/chat/completions` with
`temperature: 0` (the card and Modelfile use greedy decoding) and parses the
XML with NOPE's own rules. Unparseable output becomes a `failed` outcome,
never `none`. Because the transport is generic, the same package serves a
laptop Ollama, an on-prem vLLM, or a hosted dedicated endpoint.
`dataLeavesDevice` is `false` only when `baseUrl` is a loopback address;
otherwise `true`, with an explicit override.

## 2. Azure AI Content Safety (self-harm)

**API.** `POST {endpoint}/contentsafety/text:analyze?api-version=2024-09-01`
with header `Ocp-Apim-Subscription-Key` (or Entra ID). The body is `{ text,
categories?: ['SelfHarm', ...], blocklistNames?, haltOnBlocklistHit?,
outputType?: 'FourSeverityLevels' | 'EightSeverityLevels' }`, and the
response is `{ blocklistsMatch, categoriesAnalysis: [{ category, severity }] }`
([quickstart](https://learn.microsoft.com/en-us/azure/ai-services/content-safety/quickstart-text)).
Text supports the full 0–7 scale, or a trimmed 0/2/4/6
([harm categories](https://learn.microsoft.com/en-us/azure/ai-services/content-safety/concepts/harm-categories)).
Limit: "Default maximum length: 10K characters (split longer texts as
needed)" ([service limits](https://learn.microsoft.com/en-us/azure/ai-services/content-safety/region-availability)).
Rate limits: F0 5 RPS; S0 1000 requests per 10 seconds
([overview](https://learn.microsoft.com/en-us/azure/ai-services/content-safety/overview)).
Latency is not published (UNVERIFIED).

**What severity means (the core problem).** "The severity level indicates
the severity of the consequences of showing the flagged content"
([harm categories](https://learn.microsoft.com/en-us/azure/ai-services/content-safety/concepts/harm-categories)).
It is a content-moderation scale, and it is not monotone in writer risk.
From the same page's self-harm table:

- Level 3: "Personal experiences related to self-harm, such as asking for
  help before hurting themselves or committing suicide". That is our
  `crisis`.
- Level 4: "fantasies or wishes of self-harm", "Self-injury presented as a
  solution to a problem, emotional distress", but also "Content that mocks
  victims or survivors of suicide".
- Level 5: "Go kill yourself, you are worthless" (bullying aimed at
  someone else), and "personal past and present experiences of self-harm
  that contains explicit details".
- Levels 6–7: instructions, and glorification.

There is no subject, no tense and no immediacy. The transparency note also
warns: "Azure AI Content Safety might be unable to analyze content in
context", and "Time sensitivity: ... might be unable to identify these
types of content quickly in order to alert moderators." Its listed intended
uses are social media, e-commerce, gaming, news and video platforms, with
nothing in health
([transparency note](https://learn.microsoft.com/en-us/azure/foundry/responsible-ai/content-safety/transparency-note)).
Use "is subject to the requirements of the Azure OpenAI Service Code of
Conduct" (same note).

**Data handling.** "No input texts or images are stored in the model during
detection (except for customer-supplied blocklists ...), and user inputs are
not used to train, retrain, or improve the Azure AI Content Safety models."
Data "remains within Azure AI Content Safety and in the region you chose."
Inputs are "not stored or made available for human review by Microsoft
employees"
([data, privacy, and security](https://learn.microsoft.com/en-us/azure/foundry/responsible-ai/content-safety/data-privacy)).

**HIPAA/BAA.** Microsoft offers its HIPAA BAA "as part of the Microsoft
Product Terms ... to all customers who are covered entities or business
associates under HIPAA for use of such in-scope Azure services", with "no
separate contract to sign"
([HIPAA offering](https://learn.microsoft.com/en-us/azure/compliance/offerings/offering-hipaa-us)).
The list of in-scope services lives in a Service Trust Portal document
([audit scope](https://learn.microsoft.com/en-us/azure/compliance/offerings/cloud-services-in-audit-scope)).
**Whether Content Safety is in HIPAA scope is UNVERIFIED.** (It is listed
only in the *Azure Government* table, for FedRAMP High and DoD IL2, and not
in the Azure public table:
[FedRAMP/DoD scope](https://learn.microsoft.com/en-us/azure/azure-government/compliance/azure-services-in-fedramp-auditscope).)

**Regions.** Text moderation is offered in, among others, East US, East US
2, Central US, North and South Central US, West US 2 and 3, Canada East,
France Central, Poland Central, Switzerland North, and several APAC regions
([region availability](https://learn.microsoft.com/en-us/azure/ai-services/content-safety/region-availability)).

**Pricing.** F0: "5,000 text records per month"; "A text record ... contains
up to 1,000 characters"
([pricing page](https://azure.microsoft.com/en-us/pricing/details/cognitive-services/content-safety/)).
S0 "Standard Text Records": $0.375 per 1K in East US
([Azure retail prices API](https://prices.azure.com/api/retail/prices?$filter=contains%28productName,%27Content%20Safety%27%29%20and%20armRegionName%20eq%20%27eastus%27)).

**Offline?** An Analyze-text container exists, but "The content safety
container is available in public preview", and "Content safety containers aren't
licensed to run without being connected to Azure for metering". Disconnected use needs
an approved request
([containers](https://learn.microsoft.com/en-us/azure/ai-services/content-safety/how-to/containers/container-overview)).

**Mapping to SPEC §4** (with `EightSeverityLevels`): 0–2 → `none`; 3 →
`concern`; ≥ 4 → `crisis`. All thresholds are configurable and must be tuned
on dev vectors only. Subject, immediacy, explanation and spans are all lost.
Keep the raw severity in `providerScores`.

**Recommended implementation (later).** A separate package,
`@meddevkit/crisis-adapter-azure` (`AzureContentSafetyAdapter`). It should
not go into `@meddevkit/adapter-azure`, which peers on `@meddevkit/chunker`
and implements `MedicalNlpAdapter`. It should reuse that package's
conventions: `apiKey` or `getToken`, retry on 429/5xx with `retry-after-ms`,
and no text in errors.

## 3. OpenAI Moderation (`omni-moderation`)

**API.** `POST https://api.openai.com/v1/moderations` with `{ input: string
| string[] | multimodal[], model? }`. Models: `omni-moderation-latest`,
`omni-moderation-2024-09-26`, `text-moderation-latest`,
`text-moderation-stable`
([API reference](https://developers.openai.com/api/reference/resources/moderations/methods/create)).
The response has `flagged`, `categories` (booleans), `category_scores` (0–1)
and `category_applied_input_types`
([guide](https://developers.openai.com/api/docs/guides/moderation)).

**Self-harm categories (verified names and definitions)**
([guide](https://developers.openai.com/api/docs/guides/moderation)):

- `self-harm`: "Content that promotes, encourages, or depicts acts of
  self-harm, such as suicide, cutting, and eating disorders."
- `self-harm/intent`: "Content where the speaker expresses that they are
  engaging or intend to engage in acts of self-harm, such as suicide,
  cutting, and eating disorders."
- `self-harm/instructions`: "Content that encourages performing acts of
  self-harm, such as suicide, cutting, and eating disorders, or that gives
  instructions or advice on how to commit such acts."

**Cost.** "The moderation endpoint is free to use"
([guide](https://developers.openai.com/api/docs/guides/moderation)). Older
docs reportedly limited free use to "monitoring the inputs and outputs of
OpenAI APIs" and disallowed other uses
([community thread](https://community.openai.com/t/can-the-moderation-api-be-used-or-non-openai-related-content/566304)).
The current guide contains no such clause, but confirm against the current
Service Terms (UNVERIFIED: `openai.com/policies/*` returned 403 to fetches).

**Stability.** "We plan to continuously upgrade the moderation endpoint's
underlying model. Therefore, custom policies that rely on category_scores
may need recalibration over time"
([guide](https://developers.openai.com/api/docs/guides/moderation)). The
adapter should therefore default to the pinned snapshot
`omni-moderation-2024-09-26` and record `model` in every result.

**Data retention.** The storage table lists `/v1/moderations` as: data used
for training "No"; abuse-monitoring retention "None"; application-state
retention "None"; Zero Data Retention eligible "Yes"
([your data](https://developers.openai.com/api/docs/guides/your-data)).
Regional processing is available for the US and EU (same page).

**BAA.** OpenAI has an "OpenAI Business Associate and Healthcare Addendum".
For customers who have one, "BAA-eligible endpoints can be used for
processing PHI" once their org is provisioned
([your data](https://developers.openai.com/api/docs/guides/your-data)).
I found no primary list saying `/v1/moderations` is BAA-eligible.
Secondary sources say the BAA covers ZDR-eligible endpoints
([AccountableHQ](https://www.accountablehq.com/post/is-openai-hipaa-compliant-what-healthcare-teams-need-to-know)).
**UNVERIFIED.** Treat the adapter as non-PHI until OpenAI confirms in
writing.

**Usage policies.** Via search snippets of
[usage policies](https://openai.com/policies/usage-policies/) (the page
blocked direct fetch, so UNVERIFIED wording): no "provision of tailored
advice that requires a license, such as legal or medical advice, without
appropriate involvement by a licensed professional"; no "suicide, self-harm,
or disordered eating promotion or facilitation"; no "automation of
high-stakes decisions in sensitive areas without human review", which
includes medical. Detection that routes to a person fits these. Automated
action on a model verdict would not.

**Latency.** Not published (UNVERIFIED). Expect a normal API round-trip;
budget with a timeout.

**Mapping to SPEC §4.** `categories['self-harm/intent']` → `crisis` with
`subject: 'self'` (the definition is about "the speaker").
`categories['self-harm']` or `['self-harm/instructions']` → `concern`.
Optionally, lower score thresholds for recall, tuned on dev vectors only.
Correction to SPEC §12: `self-harm/instructions` is about content that gives
or encourages instructions, not about the writer having a plan, so it does
**not** map to `immediacy`. Immediacy, explanation and spans are lost.

**Recommended implementation.** `@meddevkit/crisis-adapter-openai`,
`OpenAIModerationAdapter({ apiKey, model = 'omni-moderation-2024-09-26',
baseUrl = 'https://api.openai.com', thresholds? })`. One `fetch`, no SDK,
and retries on 429/5xx as in adapter-azure. Server-side only, because keys
must never ship to a browser (same rule as the adapter-azure README).

## 4. Llama Guard (4-12B latest; 3-1B, 3-8B)

**Taxonomy and semantics.** S1–S14, with **S11 "Suicide & Self-Harm"**
defined as "Responses that enable, encourage, or endorse acts of intentional
self-harm, including: (1) suicide, (2) self-injury (ex: cutting), and (3)
disordered eating". Output is `safe`, or `unsafe` plus the category codes
([LG4 card](https://huggingface.co/meta-llama/Llama-Guard-4-12B)). It is
built to find policy-violating prompts and responses (MLCommons-style). It
is **not** built to find a person disclosing risk. Whether it flags "I keep
thinking about ending it" as S11 is UNVERIFIED and must be benchmarked.

**Evaluation (Meta, all categories, not S11-specific).** LG4 English output
filtering: recall 69%, FPR 11%, F1 61%
([LG4 card](https://huggingface.co/meta-llama/Llama-Guard-4-12B)). LG3-1B:
F1 0.899, FPR 0.090 on internal testing
([LG3-1B card](https://huggingface.co/meta-llama/Llama-Guard-3-1B)).

**Licence.** LG4 is under the Llama 4 Community License (effective
2025-04-05): "prominently display 'Built with Llama'"; derivative model
names must start with "Llama"; keep the notice "Llama 4 is licensed under
the Llama 4 Community License, Copyright © Meta Platforms, Inc. All Rights
Reserved."; a separate licence is needed above "700 million monthly active
users"; and the AUP is "incorporated by reference"
([Llama 4 licence](https://dev.meta.ai/llama/llama4/license/)). The repo is
gated with manual approval
([HF API](https://huggingface.co/api/models/meta-llama/Llama-Guard-4-12B)).
The [Llama 4 AUP](https://dev.meta.ai/llama/llama4/use-policy/) clauses
that bear on crisis screening:

- "Collect, process, disclose, generate, or **infer** private or sensitive
  information about individuals, including information about individuals'
  identity, **health**, or demographic information, unless you have obtained
  the right to do so in accordance with applicable law". A suicide-risk
  classifier infers health information, so the consumer needs a lawful
  basis or consent.
- "Engage in the unauthorized or unlicensed practice of any profession
  including ... medical/health".
- "Fail to appropriately disclose to end users any known dangers of your AI
  system".
- "With respect to any multimodal models included in Llama 4, the rights
  granted under Section 1(a) ... are not being granted to you if you are an
  individual domiciled in, or a company with a principal place of business
  in, the European Union." LG4 is multimodal (dense early-fusion,
  multi-image evals on its card).

LG3-1B is under the Llama 3.2 licence and is text-only
([ONNX repo metadata](https://huggingface.co/api/models/onnx-community/Llama-Guard-3-1B)).
That the 3.2 EU clause covers only multimodal models is UNVERIFIED (not
fetched).

Attribution only binds whoever distributes the weights or a product
containing them. A MedDevKit adapter that calls a consumer's endpoint
carries none of it, but the README must pass the obligations on to the
consumer.

**Deployment.** `vllm serve "meta-llama/Llama-Guard-4-12B"`
([LG4 card](https://huggingface.co/meta-llama/Llama-Guard-4-12B)). **Browser:**
`onnx-community/Llama-Guard-3-1B` ships ONNX weights for transformers.js.
The smallest is `model_q4f16.onnx` at about 1.2 GB
([repo](https://huggingface.co/onnx-community/Llama-Guard-3-1B),
[file list](https://huggingface.co/api/models/onnx-community/Llama-Guard-3-1B/tree/main/onnx)).
That makes it the only LLM-class option that runs in a browser today.
Latency there is UNVERIFIED. **Hosting is shrinking:** Groq announced on
2026-02-10 the deprecation of `meta-llama/llama-guard-4-12b` (listed
under 2026-03-05) "in favor of openai/gpt-oss-safeguard-20b"
([Groq deprecations](https://console.groq.com/docs/deprecations)).

**Mapping.** `unsafe` + `S11` → `concern` (or `crisis`, if configured).
Nothing else maps. **Recommendation:** no adapter now. If in-browser model
screening becomes a requirement, benchmark LG3-1B via transformers.js
against the vectors first.

## 5. Hugging Face suicidality classifiers

| Model | Licence | Data provenance | Notes |
|---|---|---|---|
| [sentinet/suicidality](https://huggingface.co/sentinet/suicidality) | CC0-1.0 ([card](https://huggingface.co/sentinet/suicidality/blob/main/README.md)) | Six Kaggle and GitHub sets: Reddit C-SSRS, Reddit multi-task, "suicidal phrases", Twitter suicidal intention, suicide notes, Twitter ideation. Fine-tuned from `gooohjy/suicidal-electra` (MIT; Kaggle "Suicide and Depression" Reddit scrape, [card](https://huggingface.co/gohjiayi/suicidal-electra)) | ELECTRA-base, 438 MB, binary `LABEL_0/1`; self-reported validation accuracy 0.939. A CC0 claim on weights trained on scraped social media with mixed terms is weak footing |
| [vibhorag101/roberta-base-suicide-prediction-phr](https://huggingface.co/vibhorag101/roberta-base-suicide-prediction-phr) | MIT | "The dataset is sourced from Reddit", ~186k training rows | RoBERTa-base, binary. Most downloaded (68k) ([HF search](https://huggingface.co/api/models?search=suicid&sort=downloads)) |
| [mila-ai4h/Mila-Suicide-Prevention-Output-Guardrail](https://huggingface.co/mila-ai4h/Mila-Suicide-Prevention-Output-Guardrail) | Apache-2.0 | Synthetic; policy aligned with MLCommons AILuminate | Classifies **LLM outputs**, "**not** an input guardrail". Beta. Wrong direction for us |
| [enguard/small-guard-32m-en-prompt-self-harm-binary-moderation](https://huggingface.co/enguard/small-guard-32m-en-prompt-self-harm-binary-moderation) | MIT | `enguard/multi-lingual-prompt-moderation` | model2vec static embeddings, very fast. Test set is 70 rows (recall 0.80) |

Common limits: one binary label; no subject, tense, negation or immediacy;
no spans. Labels are often subreddit membership rather than annotation. The
Kaggle "Suicide and Depression" set is rated **do not use** in
[datasets.md](./datasets.md). transformers.js supports the ELECTRA, BERT and
RoBERTa architectures ([README](https://github.com/huggingface/transformers.js)),
so these could run in a browser after ONNX conversion. That adds a
dependency and hundreds of MB, and buys a score with no explanation.
**Recommendation:** benchmark baseline only, as SPEC §12 already says.

## 6. Other options checked

- **gpt-oss-safeguard-20b / -120b (OpenAI, open weights).** Apache-2.0; "fits
  into GPUs with 16GB of VRAM"; "Bring your own policy: Interprets your
  written policy"; "Raw CoT ... not intended for exposure to general users";
  harmony format only
  ([card](https://huggingface.co/openai/gpt-oss-safeguard-20b)).
  `USAGE_POLICY`: "you agree to comply with all applicable law"
  ([file](https://huggingface.co/openai/gpt-oss-safeguard-20b/blob/main/USAGE_POLICY)).
  It can be given SPEC §4 itself (levels, subject, negation, past and
  resolved) as the policy, which makes it the most promising **v2**
  candidate for a second opinion that follows our definitions. Larger than
  nope-edge, and unevaluated on our task. The `crisis-adapter-nope`
  transport (an OpenAI-compatible endpoint) could host it with a different
  prompt and parser.
- **Mistral moderation.** `mistral-moderation-2603`; categories include
  "Self-Harm: Content that promotes, instructs, plans, or encourages
  deliberate self-injury, suicide, eating disorders" and a separate
  "Health" category for medical advice
  ([guardrailing docs](https://docs.mistral.ai/capabilities/guardrailing/)).
  Pricing, retention and BAA are UNVERIFIED. A plausible alternative to
  OpenAI, but nothing it offers is missing from OpenAI's adapter.
- **Google Perspective API.** "Perspective API is sunsetting and service is
  officially ending after 2026"; no new usage requests after February 2026
  ([perspectiveapi.com](https://perspectiveapi.com/)). It has no self-harm
  attribute (UNVERIFIED: the attributes page did not render). Exclude.
- **AWS Comprehend toxicity.** Categories are `GRAPHIC`,
  `HARASSMENT_OR_ABUSE`, `HATE_SPEECH`, `INSULT`, `PROFANITY`, `SEXUAL`,
  `VIOLENCE_OR_THREAT` and `TOXICITY`. There is **no self-harm**. The
  prompt-safety classifier is "no longer available to new customers"
  ([AWS docs](https://docs.aws.amazon.com/comprehend/latest/dg/trust-safety.html)).
  Exclude.
- **Anthropic.** No moderation endpoint. The official guide prompts Claude
  through the Messages API: "Start by writing a prompt that allows you to
  define your moderation needs"
  ([guide](https://platform.claude.com/docs/en/about-claude/use-case-guides/content-moderation)).
  That is an LLM-judge pattern, not an adapter target. It is the same kind
  of thing as gpt-oss-safeguard with our own policy, only hosted.

---

## Proposed adapter interface

The types and a pure combiner go in `@meddevkit/crisis-screen`. They add no
dependencies and make no network calls, so SPEC §1's non-goal still holds
for the core. Each provider lives in its own package, mirroring
`@meddevkit/adapter-azure`: `fetch` only, no SDK, works in Node ≥ 18 and
edge runtimes, injectable `fetch` for tests.

```ts
// @meddevkit/crisis-screen (types + combiner only)
export interface SecondOpinion {
  level: ScreenLevel;                       // provider verdict mapped per the adapter's documented table
  immediacy?: boolean;                      // only if the provider has a timing/imminence signal
  subject?: 'self' | 'other' | 'unknown';   // only if the provider attributes a subject
  providerScores: Record<string, number | string>; // e.g. {'self-harm/intent': 0.91} or {severity: 'high'}
  model?: string;                           // model/snapshot that answered
  explanation?: string;                     // provider free text; only with includeExplanation (may quote the user)
  raw?: unknown;                            // provider response; only with includeRaw
  processingTimeMs: number;
}

export interface CrisisSecondOpinion {
  readonly name: string;                    // 'nope-edge', 'openai-moderation', ...
  readonly version: string;
  readonly dataLeavesDevice: boolean;       // true for any non-loopback endpoint
  isAvailable(): Promise<boolean>;          // config check only, no network (as MedicalNlpAdapter)
  assess(text: string, options?: { signal?: AbortSignal }): Promise<SecondOpinion>;
  estimateCost?(text: string): CostEstimate;
}

export type OpinionStatus = 'ok' | 'failed' | 'timeout' | 'unavailable' | 'skipped' | 'aborted';
export interface SecondOpinionOutcome {
  name: string;
  status: OpinionStatus;
  opinion?: SecondOpinion;
  agreement?: 'agree' | 'model_higher' | 'model_lower';
  reason?: string;                          // never contains input text
}

export interface CombinedScreenResult extends ScreenResult {
  patternLevel: ScreenLevel;                // the offline screen's level, unchanged
  levelSource: 'pattern' | 'model' | 'both';
  secondOpinions: SecondOpinionOutcome[];
  degraded: boolean;                        // an adapter was configured but did not return 'ok'
}

export interface SecondOpinionOptions {
  adapters: Array<CrisisSecondOpinion | { adapter: CrisisSecondOpinion; maxRaise?: ScreenLevel }>;
  timeoutMs?: number;                       // per adapter, default 3000
  signal?: AbortSignal;
  skipWhenCrisisImmediate?: boolean;        // default true: nothing to add, and no egress of the most sensitive text
}

/** Pure and synchronous; the Python port mirrors it. */
export function combineOpinions(pattern: ScreenResult, outcomes: SecondOpinionOutcome[]): CombinedScreenResult;

/** Two-phase: `pattern` is available at once; `combined` never rejects because of an adapter. */
export function screenWithSecondOpinions(text: string, options: SecondOpinionOptions):
  { pattern: ScreenResult; combined: Promise<CombinedScreenResult> };
```

## Combination policy

1. **The pattern result comes first and is never changed.** `screenText`
   runs synchronously before any adapter is called. The caller can act on it
   at once (the two-phase return), and it is kept verbatim as the base of
   the combined result. Findings, offsets and modifiers come only from
   patterns.
2. **Recall-first maximum.** `level = max(patternLevel, ...ok opinions'
   levels, each capped by its maxRaise)`. A model can raise `none` to
   `concern`/`crisis` or `concern` to `crisis`. It can **never lower** a
   level. A model `none` against a pattern `crisis` is recorded as
   `model_lower` for audit and evaluation, with no effect.
3. **`maxRaise` per adapter** (default `'crisis'`). A model raise overrides
   the screen's context handling: a negated "I'm not going to hurt myself"
   that the screen softened to `concern` would go back to `crisis` if the
   model ignores negation. Combined results are therefore scored against
   the same §8 gates as the screen alone, on dev vectors. A provider that
   pushes `grief_negative` vectors to `crisis` fails the 0% grief
   false-alarm gate and should ship with `maxRaise: 'concern'`. It still
   flags, but it does not escalate on its own.
4. **Immediacy** = `pattern.immediacy || (combined level is 'crisis' && any
   ok opinion has immediacy)`. A model can set it and never clears it.
5. **Subject** stays on the opinion. It never rewrites a pattern finding.
   Following §4's `third_party`, a model `subject: 'other'` maps to `none`
   and is kept, so the caller can ask. NOPE warns that subject attribution
   "is not always reliable" (see Q-A2).
6. **`levelSource`.** `'model'` when the combined level is above the
   pattern level. This tells the caller the flag has **no rule, span or
   modifiers**, so the README must say a model-only flag is unexplained and
   should go to a person on the same footing as any other flag.
7. **Failure never suppresses the pattern result.** Adapters run in parallel
   (`Promise.allSettled`). Each gets its own `AbortController` timeout
   combined with the caller's signal, the same pattern as
   `MedicalAnalyzer.callWithTimeout`. Throws, timeouts, non-2xx responses,
   unparseable output and `isAvailable() === false` become outcomes with
   `degraded: true`, and the combined level falls back to the pattern
   level. A caller abort resolves with the pattern result and adapters
   marked `aborted`. It does not reject.
8. **Never treat an unparseable or empty model response as `none`.** It is
   `failed`. This matters most for generative models (nope-edge,
   gpt-oss-safeguard).
9. **Thresholds and mappings are tuned on `vectors.jsonl` only.**
   `vectors.heldout.jsonl` is scored at release, as in §7 and §8. Combined
   metrics are reported per adapter beside the pattern-only metrics.

### Privacy (text leaves the device)

- Adapters are never constructed implicitly. Using one is a code change by
  the consumer.
- Each adapter declares `dataLeavesDevice`. Each README opens with a "Your
  responsibility" box, the same as adapter-azure's: which party receives the
  text, under which agreement (BAA status as found above), and that
  crisis-related text is health information.
- No logging or telemetry, and no input text in errors, warnings or
  `reason` (SPEC §9 and the existing adapter rule). `explanation` and `raw`
  are opt-in (`includeExplanation`, `includeRaw`), because nope-edge's
  reflection quotes the user, and §3.5 limits results to short spans.
- Cloud adapters run server-side only. API keys never ship to a browser.
- An optional `protect?: (text) => string` hook lets a consumer mask
  identifiers before sending, for example with chunker's PHI masker. This
  is best-effort and not de-identification, as the adapter-azure README
  already warns.
- `skipWhenCrisisImmediate` (default on) avoids sending the most sensitive
  texts, where a second opinion cannot change the outcome.

### Testing (house style)

The packages follow the adapter-azure layout (`src/`, `tests/fake-*.ts`,
`tests/fixtures/`, tsup cjs+esm, vitest, a version-constant test). Tests use
an in-memory fake `fetch` and recorded responses for **synthetic** inputs
only. CI makes no live calls. A separate opt-in live benchmark scores each
adapter on the dev vectors and reports agreement with the pattern screen and
the §8 metrics for the combined result.

### Python consumer note

convint is Python, so these TypeScript packages do not reach it directly.
`combineOpinions` is small and pure. Its rules (points 1–9) and each
adapter's mapping table should be written into SPEC §5 so that a Python
port in convint behaves identically. The conformance suite can then check
the combiner on recorded outcomes.

---

## Corrections and additions to SPEC §12

- **OpenAI:** the category names are verified as `self-harm`,
  `self-harm/intent` and `self-harm/instructions`. `instructions` does
  **not** map to `immediacy` (it is about giving or encouraging
  instructions). `intent` maps to first-person active ideation.
- **nope-edge:** "needs a GPU or slow CPU" understates the options.
  Official GGUF builds (Q4_K_M 2.5 GB, Q8 4.3 GB) run under Ollama or
  llama.cpp at ~1–2 s on CPU, and a 1.7B mini exists. The hosted NOPE API
  is not for PHI.
- **Llama Guard:** S11 is a policy-violation label ("enable, encourage, or
  endorse"), not a risk label. The Llama 4 AUP restricts inferring health
  information and excludes EU-based licensees from its multimodal models,
  which includes LG4. Groq deprecated hosted LG4.
- **Add:** gpt-oss-safeguard (Apache-2.0, bring-your-own-policy) as the v2
  candidate. Note that Perspective API ends on 2026-12-31.

## Open questions for the owner

- **Q-A1.** Which adapters ship first: the nope-edge and OpenAI pair
  recommended here, or OpenAI alone because it needs no infrastructure?
- **Q-A2.** Should a model's `subject: 'other'` map to `none` (consistent
  with §4 `third_party`) or `concern` (NOPE's disclaimer: subject "is not
  always reliable")?
- **Q-A3.** Default `maxRaise` for providers without subject attribution
  (Azure, Llama Guard): `'crisis'` (recall-first) or `'concern'`
  (explanation-first)? Recommendation: decide per provider from the
  combined dev-vector metrics.
- **Q-A4.** One package per provider (house style; each needs a manual
  first publish via `scripts/first-publish.sh`) or one
  `@meddevkit/crisis-adapters` package with subpath exports (fewer
  releases, one shared privacy README)? This note assumes one package per
  provider.
