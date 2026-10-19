# Crisis-language screen — specification

> **Status:** Draft v0.1 · 2026-10-18 · not reviewed by a clinician
> **Package:** `@meddevkit/crisis-signals`, a separate package (decided, Q1)
> **First consumer:** `convint` (Python, `~/Source/AIML/conversational_intelligence`), which replaces its own DISTRESS regexes with this screen
> **Seed test set:** [`vectors.seed.jsonl`](./vectors.seed.jsonl)

## 1. Purpose

Flag first-person language in free text that suggests the writer may be in
acute distress or at risk of harming themselves, so the calling application
can stop what it is doing and hand off to a person.

It is a **screen**: it tries hard not to miss anything, and it explains every
flag. It is **not** a diagnosis, a risk assessment, or a classifier of how
likely someone is to act. It never decides what happens next; the caller owns
escalation.

### Non-goals

- Clinical risk scoring (for example C-SSRS levels). The screen may point a
  clinician to the right sentence; it does not score it.
- Detecting risk to others, abuse or exploitation (v1; see Q4).
- Non-English text (v1).
- Model inference or network calls. Like the rest of MedDevKit it is offline,
  deterministic, has zero dependencies, and runs in the browser.

## 2. Why: evidence from convint

convint is a conversational-interview component. When a user signals
distress, its gate holds instead of probing (`rule_fired:
distress_defer_to_caller`). Its detector is four regexes. Pinned tests
(`tests/test_signal_coverage.py` in convint) show:

| Case | Text | convint today |
|---|---|---|
| Missed crisis | "Honestly everyone would be better off without me." | not flagged |
| Missed crisis | "I keep thinking about ending it." | not flagged |
| Missed crisis | "I don't feel safe with myself right now." | not flagged |
| False positive | "The first months after she died I was falling apart. I'm not there anymore, but it taught me what I actually need from work." | flagged as distress |

The misses are about coverage. The false positive is about context: tense,
recovery, and negation. MedDevKit already solves context for clinical text
(`patterns/negation.ts` with scope rules, `patterns/temporal.ts` with onset
and course). This screen reuses those ideas for first-person conversational
text.

## 3. Design principles

1. **Recall first.** A missed crisis costs far more than a false alarm. When
   context is ambiguous, keep the flag and lower its level; never drop it.
2. **Context decides the level, not whether to look.** Negation, past tense,
   recovery, hypotheticals, third parties and idioms change a finding's level
   or mark it; they do not stop detection.
3. **Explainable.** Every finding carries a rule id, the matched span and its
   modifiers, so a reviewer can see why a turn was flagged.
4. **One source of truth, two runtimes.** Patterns and test vectors are plain
   data shared by the TypeScript package and the Python consumer (§7).
5. **No text leaves the function.** The screen does not log, store or send
   text. Results carry offsets and short spans only.

## 4. Output model

### Levels (per finding and per text)

| Level | Meaning | Example |
|---|---|---|
| `crisis` | Present, first-person thoughts of suicide or self-harm, or feeling unsafe with oneself | "I keep thinking about ending it." |
| `concern` | Acute distress without self-harm language; **or** crisis language that context has softened (negated, past, hypothetical) | "I can't cope with any of this." · "I'm not going to hurt myself, I just feel empty." |
| `none` | Nothing found, or only idioms, third parties, or clearly resolved past distress | "This commute is killing me." |

The text's level is the highest level among its findings.

**`immediacy` flag:** set on a `crisis` finding when the same text mentions a
plan, means, timing, or preparation ("tonight", "I have the pills", "I wrote
letters"). It never lowers a level. Callers should treat it as the most
urgent case.

### Categories (pattern families)

| Category | Base level | Examples (synthetic) |
|---|---|---|
| `suicidal_ideation_passive` | crisis | "better off without me", "wish I could just not wake up", "don't want to be here anymore" |
| `suicidal_ideation_active` | crisis | "thinking about ending it", "want to kill myself", "end my life" |
| `self_harm` | crisis | "I've been hurting myself again", "want to cut" |
| `unsafe_with_self` | crisis | "don't feel safe with myself", "scared of what I might do" |
| `acute_distress` | concern | "I can't cope", "I can't go on like this", "falling apart", "can't stop crying", "having a panic attack" |
| `immediacy` | flag only | "tonight", "I have a plan", "I've got the pills", "said my goodbyes" |
| `history` | concern | "I tried to kill myself when I was nineteen", "after my attempt" |

### Context modifiers (reuse MedDevKit scope logic)

| Modifier | Detection basis | Effect |
|---|---|---|
| `negated` | Negation cue scoped over the finding ("I'm **not** going to hurt myself", "**never** thought about ending it") | crisis → concern. Never → none: a denial that mentions self-harm is still worth a human look |
| `past` | Past tense or past-time anchor ("back then", "the first months after", "years ago", "used to") | acute_distress → none **if** `resolved` is also present, else concern; crisis → concern + `history` |
| `resolved` | Recovery statements ("I'm not there anymore", "I'm doing better now", "got through it") | Only acts together with `past` |
| `hypothetical` | Conditionals and questions about others ("what if someone said…", "how do people know if…") | crisis → concern |
| `third_party` | The subject is not the writer ("my friend said she wanted to die", "my brother was suicidal") | → none, finding kept with `subject: "other"` so the caller can choose to ask |
| `idiom` | Fixed figurative uses ("dying to know", "killing me" about a thing, "I could kill for a coffee", "dead tired", "kill it at the interview") | → none |
| `quoted` | Inside quotation marks or reported media ("the song goes 'I want to die'") | crisis → concern |

Modifier precedence: `idiom` > `third_party` > (`past` + `resolved`) >
`negated` / `hypothetical` / `quoted`. When modifiers conflict, choose the
**higher** resulting level.

### Clarifications (owner, 2026-10-18, from M0 vector writing)

- **Recent past is present.** Anchors within about the last few days
  ("last night", "yesterday", "this morning", "earlier today", "this week")
  do not set `past`. Recent self-harm or ideation stays `crisis`. `past`
  needs a distant anchor ("years ago", "back then", "when I was nineteen",
  "used to", "last year").
- **A first-person conditional is not hypothetical.** "If things don't get
  better I might end my life" stays `crisis`. `hypothetical` covers
  questions, "what if", and asking about others or about procedure ("how do
  people know if…", "would you have to report it if…").
- **Order of application.** Modifier precedence picks the **one** modifier
  that sets a finding's level. "Choose the higher level" applies only when
  modifiers of equal rank conflict. The text's level is the maximum over
  findings, so the writer's own unmodified statement still wins over a
  third-party or idiom finding elsewhere in the text.
- **Negated acute distress** ("I'm not panicking") → `none`, with the finding
  kept and `negated` set.
- **The bare word "suicidal"** in a first-person frame ("I feel suicidal",
  "I've been suicidal") counts as `suicidal_ideation_passive`.
- **Immediacy** is set only when a non-negated `crisis` finding is present.

- **A threat against the writer is not an idiom** (added after M1 probing).
  "My husband is going to kill me, he has a gun" must not return `none`. A
  new category, `threatened_by_other` (base level `concern`, subject
  `other`), flags a person threatening the writer, and `idiom` must not
  suppress it when the threat is literal (a person as the subject, plus
  means, violence or fear). Figurative uses about people stay idioms ("my
  mom is going to kill me when she sees my grades"). When a literal reading
  is plausible, keep `concern`, per recall first. Full risk-to-others
  handling is still v2 (D5).

- **General questions vs named third parties** (round 3). "How do people
  know if…" or "what are the warning signs" with no specific person is
  `hypothetical` → `concern`. A named or specific other person ("my student
  told me she…") is `third_party` → `none`.

## 5. API

### TypeScript

```ts
import { screenText } from '@meddevkit/crisis-signals';

const r = screenText("I keep thinking about ending it. Maybe tonight.");
// {
//   level: 'crisis',
//   immediacy: true,
//   findings: [
//     { ruleId: 'si_active.ending_it', category: 'suicidal_ideation_active',
//       level: 'crisis', baseLevel: 'crisis',
//       startOffset: 7, endOffset: 31, text: 'thinking about ending it',
//       modifiers: { negated: false, past: false, resolved: false,
//                    hypothetical: false, quoted: false, idiom: false },
//       subject: 'self' },
//     { ruleId: 'immediacy.tonight', category: 'immediacy', level: 'crisis', ... }
//   ],
//   patternsVersion: '0.1.0'
// }
```

```ts
type ScreenLevel = 'none' | 'concern' | 'crisis';

interface ScreenOptions {
  /** Default true. False skips idiom suppression (for audits). */
  suppressIdioms?: boolean;
}

interface ScreenFinding {
  ruleId: string;
  category: CrisisCategory;
  baseLevel: ScreenLevel;   // before modifiers
  level: ScreenLevel;       // after modifiers
  startOffset: number;
  endOffset: number;
  text: string;             // the matched span only, max 120 chars
  modifiers: Record<'negated'|'past'|'resolved'|'hypothetical'|'quoted'|'idiom', boolean>;
  subject: 'self' | 'other' | 'unknown';
}

interface ScreenResult {
  level: ScreenLevel;
  immediacy: boolean;
  findings: ScreenFinding[];  // in text order, including findings modified to 'none'
  patternsVersion: string;
}
```

Sentence handling: split into sentences first (reuse MedDevKit's boundary
utilities). Modifiers are scoped to the sentence, and to clause boundaries
inside it, the same way `negation.ts` uses `resolveForwardScope`. The one
exception is `resolved`, which may come from the next sentence ("I was falling
apart. I'm not there anymore.").

### Python (consumer port, convint)

The same semantics, loaded from the same data files: `screen_text(text) ->
ScreenResult` (dataclasses mirroring the TypeScript types, snake_case). convint
maps the result to its own signal:

| Screen result | convint |
|---|---|
| `crisis` (any) | `UserSignal.DISTRESS`, plus the screen result surfaced to the caller (see Q5) |
| `concern` | `UserSignal.DISTRESS` |
| `none` | fall through to the other signal detectors |

## 6. Pattern data

The patterns live in `patterns/crisis.patterns.json`, versioned with semver.
Each entry:

```json
{
  "id": "si_active.ending_it",
  "category": "suicidal_ideation_active",
  "level": "crisis",
  "pattern": "\\b(?:thinking|thought|think) (?:about|of) (?:ending it|ending (?:it all|my life))\\b",
  "flags": "i",
  "note": "Bare 'ending it' is ambiguous (relationships, jobs); requires a thinking frame or a self-referent.",
  "sources": ["srl-v1.0", "nimh-asq"],
  "relation": "informed-by"
}
```

`sources` lists the lexicons or materials that informed the pattern (keys
defined in `NOTICE`); `relation` is `informed-by` (our own wording) or
`adapted-from` (close to the source's wording, so the source's licence terms
apply). See [`research/lexicons.md`](./research/lexicons.md).

Modifier cues (negation, past, resolved, hypothetical, third_party, idiom,
quoted) live in the same file, under `modifiers`, in the same format.

**Format extensions (M1 round 2).** Both runtimes must implement these. The
package README section on the pattern file is the normative description:
- `fragments`: named regex pieces, referenced as `{{ID}}` and expanded to
  `(?:…)` at load time. A fragment may reference only fragments listed
  before it.
- The finding span is the first capturing group that takes part in the
  match, or the whole match if no group does.
- An empty capturing group is a veto: the match yields no finding.
- A cue may carry `categories`, so it applies only to findings of those
  categories.
- Cue `scope` values: clause, sentence and `sentence-or-next`. A block cue
  with `sentence-or-next` scope blocks findings in the same or the next
  sentence.
- `boundaries`: clause-boundary cues that limit scope.
- Context-gated patterns (round 3): a pattern with `context: {scope:
  sentence|adjacent, categories?, rules?, pattern?}` yields a finding only
  when an ungated, non-negated, non-idiom finding of those categories or rules,
  or a hit of the context regex, appears in the same sentence (or, for
  `adjacent`, the previous or next one). Used for vague references ("finish
  it") that are crisis only in context.

Offsets are UTF-16 code units in TypeScript. The Python port must convert
them, or document the difference.

**Portable regex subset.** Every pattern must compile and behave the same in
ECMAScript (`u` flag) and Python `re`:

- Allowed: character classes, `\b`, `(?:...)`, alternation, `?`, `*`, `+`,
  `{m,n}`, `(?=...)`, `(?!...)`, and fixed-width `(?<=...)` / `(?<!...)`.
- Forbidden: named groups (the syntax differs), `\p{...}`, variable-width
  lookbehind, inline flags other than a whole-pattern `i`, possessive or
  atomic groups, and `\Z` / `\z`.
- Both test suites run a compile-and-agree check over every pattern
  (§8, conformance).

## 7. Shared test vectors

`vectors.jsonl` holds one labelled case per line. Both implementations must
pass all of them. Seed: [`vectors.seed.jsonl`](./vectors.seed.jsonl).

```json
{"id": "neg-grief-past-resolved", "text": "...", "expected_level": "none",
 "expected_categories": [], "expected_modifiers": ["past", "resolved"],
 "group": "grief_negative", "source": "synthetic", "origin": "convint test_signal_coverage", "reviewed": false}
```

| Field | Meaning |
|---|---|
| `expected_level` | Required; the text's overall level |
| `expected_categories` | Categories that must appear among non-`none` findings (subset match) |
| `expected_modifiers` | Optional; modifiers that must be set on at least one finding |
| `expected_immediacy` | Optional boolean |
| `group` | `crisis_positive`, `concern_positive`, `grief_negative`, `idiom_negative`, `negated`, `third_party`, `hypothetical`, `history`, `everyday_negative` |
| `reviewed` | Set true only after clinical review (§9) |

Rules:

- **Synthetic only.** No real patient or user text. This follows MedDevKit's
  existing no-real-PHI rule.
- **Every pattern needs a positive and a negative vector.** This is
  MedDevKit's existing testing rule.
- **Held-out split.** Keep `vectors.heldout.jsonl` and never use it to write
  or tune patterns. It is scored only at release (§8). This mirrors convint's
  `data/heldout` discipline.

## 8. Evaluation and release gate

Each release reports on `vectors.jsonl` (dev) and separately on every
held-out set. `vectors.heldout.v2.jsonl` is the primary held-out set;
`vectors.heldout.jsonl` (v1) is kept for history, though it has been scored
repeatedly.

| Metric | Definition | Release gate (revised 2026-10-18) |
|---|---|---|
| Crisis recall | Share of `crisis_positive` vectors returning `crisis` | 100% on dev. Held-out **reported with a 95% CI in the README**, and must not regress |
| Any-flag recall | Share of crisis and concern positives returning anything other than `none` | 100% on dev. Held-out reported with a CI; must not regress |
| Grief false-alarm rate | Share of `grief_negative` vectors returning `crisis` | 0% on dev; held-out reported |
| Idiom and everyday false-alarm rate | Share of `idiom_negative` / `everyday_negative` vectors returning anything other than `none` | ≤ 5% held-out |
| Conformance | TypeScript and Python results identical on every vector | 100% |

**Why the gate changed (D8, owner, 2026-10-18).**
- **Findings:** after three rounds the patterns pass all dev vectors but catch
  only about half of crisis statements in a held-out set written blind
  (v2: 15/31).
  - The misses are mostly oblique: preparation with no crisis words, imagery,
    and wishes phrased by meaning rather than wording.
  - Keyword-and-context rules plateau there, and further rounds mostly fit dev.
- **Decision:** the original v1 gate of 100% held-out any-flag recall is not
  achievable by patterns alone. The screen is therefore positioned as an
  **explainable first-pass signal**:
  - it is fast, offline and transparent;
  - it publishes its measured recall honestly;
  - it must never be the only safeguard.
- **For higher recall**, consumers add the opt-in second-opinion adapter
  (D6), which is now the next milestone.
- **Measured limits:** the README states the held-out recall and its CI
  prominently, next to the required wording in §9.

Any change to a pattern must report the before and after numbers in the PR. A
recall regression on dev or held-out blocks the merge.

## 9. Safety, claims and review

- **Clinical review before any "validated" claim.** A qualified reviewer (for
  example a licensed clinician with suicide-prevention training) reviews the
  categories, the level mapping, and every vector, and sets `reviewed: true`.
  Until then, the README states that the screen is unreviewed.
- **README wording (required):** "A keyword-and-context screen for
  first-person crisis language. It is not a diagnostic or risk-assessment
  tool, it will miss some expressions of risk, and it must never be the only
  safeguard. Route any flagged text to a person according to your own
  escalation policy."
- **Escalation is the caller's job.** The library does not show crisis
  resources, because the right resources depend on locale and setting.
  Example consumer guidance (US): surface 988 (Suicide & Crisis Lifeline) on
  `crisis`.
- **Privacy:** no logging, no telemetry, and no text in errors. Findings carry
  spans of at most 120 characters.

## 10. Milestones

| # | Deliverable | Done when |
|---|---|---|
| M0 | This spec, the seed vectors, and a draft held-out set; decisions on §11 | Owner sign-off; vectors expanded to about 150 (at least 10 per group) |
| M1 | TypeScript implementation, `patterns/crisis.patterns.json`, Vitest conformance suite | All dev vectors pass; MedDevKit's 80% coverage rule met |
| M2 | Python port in convint, loading the same JSON; replaces the DISTRESS regexes in `src/convint/domain/signals.py`; convint's strict-xfail distress cases flip to passing | convint `make ci` green; conformance identical |
| M2b | `CrisisSecondOpinion` interface in the core, and `@meddevkit/crisis-adapter-nope` (self-hosted nope-edge over an OpenAI-compatible endpoint), combined per research §3.2 | Adapter tests against a mock server; combined held-out recall reported with the adapter on, when a model is available |
| M3 | Clinical review, the held-out report, and the README claims | `reviewed: true` on all vectors; metrics published in the README |

## 11. Decisions and open questions

### Decided (owner, 2026-10-18)

- **D1 (was Q1). Separate package: `@meddevkit/crisis-signals`.** It versions
  and releases on its own tag (`crisis-signals-v<version>`), following the
  existing release flow. The first publish uses `scripts/first-publish.sh`.
- **D2 (was Q2). Fully public patterns.** The complete crisis pattern list,
  modifier cues and test vectors are open source. This is an explicit
  exception to MedDevKit's "keep tuned patterns private" policy (CLAUDE.md,
  *Open Source vs Private*). The reason: a safety screen must be transparent
  about exactly what it does and does not match. The README links to the
  pattern file and the published metrics. Update CLAUDE.md to record the
  exception when the package lands.
- **D3 (was Q5). Rich output for consumers.** Consumers decide how to
  respond, so the screen returns everything it knows: the overall level,
  `immediacy`, and every finding (including those softened to `none`) with
  rule id, category, base and final level, offsets, span, modifiers and
  subject (§5). convint passes this through on its response, for example as
  `diagnostics.safety`, or as a dedicated field if it outgrows diagnostics.
  It never collapses the result into a single boolean.

- **D4 (was Q3). The Python consumer vendors the JSON.** convint keeps a
  copy of `crisis.patterns.json` and the vectors, pinned by
  `patternsVersion`, and its CI checks that the copy matches the published
  version. This is simpler and works offline.
- **D5 (was Q4). Risk to others waits for v2.** It needs a different
  escalation path. If it is added, align the category names with prior tools
  (§12).
- **D6 (was Q7). Second-opinion adapters come after v1.** Each provider is
  its own opt-in package behind a `CrisisSecondOpinion` interface, combined as
  described in [`research/README.md`](./research/README.md) §3.2:
  `@meddevkit/crisis-adapter-nope` (self-hosted nope-edge) first, then
  `@meddevkit/crisis-adapter-openai`. v1 ships only the offline screen.
- **D7 (2026-10-18). Package layout.**
  - Data lives in `packages/crisis-signals/data/`: `crisis.patterns.json`,
    `vectors.jsonl` and `vectors.heldout.jsonl`.
  - The pattern JSON is bundled into the build and also shipped raw in the
    npm package, so consumers can vendor it.
  - No runtime dependencies, including `@meddevkit/chunker`. Sentence and
    clause splitting are implemented locally, following the ideas in
    `patterns/negation.ts`.
  - M1 starts in parallel with M0 vector expansion. The M0 owner sign-off
    still gates the first publish.

### Still open

- **Q6. Reviewer.** Who performs the clinical review in M3, and under what
  terms?

## 12. Prior art (search 2026-10-18)

Full investigation, implementation and licensing: [`research/README.md`](./research/README.md).

A quick survey of what already exists, and what this package does
differently. Verify licences before reusing any data.

| Resource | What it is | Relevance |
|---|---|---|
| [Suicide Risk Lexicon](https://news.mit.edu/2026/estimating-suicide-risk-from-text-0924) (MIT, Child Mind Institute, Harvard; [summary](https://childmind.org/blog/identifying-suicide-risk-based-on-the-words-people-use/)) | Thousands of terms over 49 suicide risk factors. LLM-generated, then reviewed by clinicians; validated on about 16k crisis-line conversations. Released as `danielmlow/construct-tracker`, **Apache-2.0** (verified) | The strongest open lexicon found. It covers *risk factors* (broader than first-person crisis statements), so it is a vocabulary source and a check on coverage for our categories (6 of its 50 constructs map). Ship an Apache NOTICE |
| [Lexicography Saves Lives](https://arxiv.org/html/2412.15497v1) | The O'Dea et al. (2015) list (21 phrases, CC BY-NC-ND; the ~50-entry list is Sawhney et al. 2018, CC BY 4.0) ("kill myself", "end my life"), machine-translated into 200 languages | A compact, well-cited seed for `suicidal_ideation_*`; the path to non-English (v2). Paper is CC BY 4.0; **no data released yet** |
| [nope-edge](https://friendli.ai/models/nopenet/nope-edge) | MIT-licensed 4B model (Qwen3-4B fine-tune). Nine risk types incl. suicide and self-harm; severity none→critical, imminence, and subject self/other/unknown | Closest in shape to our output: it independently uses subject + severity + imminence, which supports §4. A candidate second-opinion adapter (Q7); needs a GPU or slow CPU |
| [Azure AI Content Safety](https://learn.microsoft.com/en-my/azure/ai-services/content-safety/concepts/harm-categories) | Cloud API; self-harm category with severity 0–7 | Natural second-opinion adapter, consistent with the existing Azure adapter |
| OpenAI moderation | Free API; self-harm categories split into general, intent and instructions | Second-opinion adapter; `self-harm/intent` maps to `suicidal_ideation_active`; `instructions` does **not** signal immediacy |
| Llama Guard (via [promptfoo](https://promptfoo.dev/docs/configuration/expected-outputs/moderation)) | Open-weights safety classifier with a self-harm category | Second-opinion adapter for self-hosted setups |
| [Sentinet suicidality](https://huggingface.co/sentinet/suicidality) and other Hugging Face classifiers | ELECTRA-style binary suicidality classifiers | Binary only, no context or explanation; useful as a benchmark baseline at most |
| Old npm risk libraries ([example author page](https://www.npmjs.com/~kvss)) | Config-file keyword matchers, last published around 8 years ago | Confirms there is no maintained, explainable, context-aware JS/TS screen today |
| Datasets: [Reddit C-SSRS](https://zenodo.org/record/2667859), [CLPsych 2019](https://preview.aclanthology.org/moar-dois/W19-3020.pdf), [RSD-15K](https://arxiv.org/pdf/2507.11559), [PsySUICIDE](https://www.huggingface.co/datasets/qiuhuachuan/PsySUICIDE/blob/main/README.md) | Annotated real social-media or counselling text, several on C-SSRS-based scales | **Evaluation only, never fixtures** (§7 is synthetic-only). Most need a data-use agreement; real user text must not enter the repo |

**What is missing and this package provides:** an offline, dependency-free,
browser-capable screen that **explains** each flag (rule, span, modifiers) and
treats context — negation, past and recovered, third party, idiom — as a
first-class part of the result, with patterns and vectors shared across
TypeScript and Python. Model-based tools give a score without that
explanation; keyword libraries have no context handling and are no longer
maintained.
