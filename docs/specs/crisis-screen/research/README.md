# Crisis screen — integrations, implementation and licensing

> 2026-10-18 · Summary and recommendation drawn from three research notes in
> this folder. Not legal advice; confirm licence questions with the authors or
> counsel before a release.
>
> - [`lexicons.md`](./lexicons.md) — phrase and vocabulary sources (feeds the patterns, M1)
> - [`adapters.md`](./adapters.md) — model and API classifiers as opt-in second opinions (Q7)
> - [`datasets.md`](./datasets.md) — real-world annotated data for evaluation only (M3)

## 1. Bottom line

1. **Write the patterns ourselves.** Draw vocabulary from the **Suicide Risk
   Lexicon** (Apache-2.0) and wording from **NIMH ASQ / warning-signs**
   material (public domain). Record each pattern's provenance. Ship an Apache
   NOTICE. Our patterns stay MIT.
2. **Ship one model adapter first:** `@meddevkit/crisis-adapter-nope`, for
   **self-hosted** nope-edge (MIT). It talks to any OpenAI-compatible server
   (Ollama, llama.cpp, vLLM). Second: `@meddevkit/crisis-adapter-openai`
   (Moderation API, free), with no health data until OpenAI confirms its BAA
   covers moderation.
3. **Evaluate on Reddit C-SSRS** (CC BY 4.0) and the **Hasan & Saquer split**
   (CC BY 4.0) as an external indicator, with **VERA-MH personas** as a
   synthetic external set. Keep the data outside the repo and publish
   aggregates only. Grief and idiom false-alarm rates still come from our own
   synthetic held-out set; no external dataset labels those cases.
4. **Avoid:** LIWC (proprietary), C-SSRS question wording (licensed through
   Clario), Llama Guard (it judges policy violations rather than writer risk,
   and its AUP restricts inferring health information), the NOPE *hosted* API
   for health data (no BAA, "not intended for PHI"), and Kaggle/SDCNL data
   (labels are subreddit names).

## 2. Licensing at a glance

| Source | Type | Licence (verified unless noted) | Can we redistribute? | Obligation |
|---|---|---|---|---|
| Suicide Risk Lexicon (`danielmlow/construct-tracker`) | Vocabulary | Apache-2.0 (repo and PyPI); article CC BY-NC-ND, preprint CC0 | Yes | Licence copy + attribution + change notice in NOTICE; our own patterns can stay MIT (Apache §4) |
| NIMH ASQ, Warning Signs | Wording | Public domain (US Gov) | Yes | Cite NIMH |
| Sawhney et al. 2018 list | Phrases | CC BY 4.0 | Yes | Attribution; rights to the O'Dea phrases inside it UNVERIFIED |
| O'Dea et al. 2015 list (21 phrases) | Phrases | CC BY-NC-ND 4.0 | Not verbatim as a list | Cross-check only; ask the authors |
| Lexicography Saves Lives | Translations | Paper CC BY 4.0; **no data released** | — | Revisit for v2 (non-English) |
| C-SSRS | Clinical scale | © RFMH; electronic use licensed through Clario | **No** for the wording | Use the concepts, never the items |
| LIWC-22 | Lexicon | Proprietary EULA | **No** | Do not use |
| VERA-MH personas | Synthetic messages | MIT-style + disclaimer + no-endorsement clause | Yes, keeping both clauses | Eval only, never tuning |
| nope-edge | Model weights | MIT; base Qwen3-4B Apache-2.0 | Weights not redistributed by us | Its disclaimer excludes real-time emergency use: second opinion only |
| OpenAI Moderation | API | OpenAI terms | n/a | Free; ZDR-eligible; BAA coverage UNVERIFIED |
| Azure AI Content Safety | API | Microsoft Product Terms | n/a | $0.375/1K after 5K free/month; BAA scope UNVERIFIED |
| Llama Guard 4 | Model weights | Llama licence + AUP | — | Not recommended |
| Reddit C-SSRS; Hasan & Saquer | Datasets | CC BY 4.0 (verified on Zenodo) | Yes, but we don't need to | Attribute; never commit or quote posts |
| RSD-15K | Dataset | "CC0" yet "non-commercial research only" | No | Hold; ask the authors |
| UMD Reddit v2 / CLPsych 2019 | Dataset | Data-use agreement + IRB | No | Stretch goal |

## 3. How each integration is best implemented

### 3.1 Patterns from lexicons (M1)

- Write regexes in our own frames, staying within the portable subset (§6 of
  the spec). Do not copy lists wholesale. Use the lexicon as **vocabulary**
  inside first-person, present-tense frames, as a **dev-only coverage
  check** (which lexicon terms in our categories no pattern matches), and as
  a source of **negative vectors** from its ambiguous terms.
- Six of the lexicon's 50 constructs map to our categories. The other ~40 are
  broader risk factors (for example loneliness) and are out of scope for a
  crisis screen. Leave them for a possible future "risk factors" mode.
- **Provenance per pattern** (spec §6, now adopted):
  `"sources": ["srl-v1.0", "nimh-asq"], "relation": "informed-by" |
  "adapted-from"`. This keeps the NOTICE honest and lets a reviewer trace
  every pattern.
- Ship `NOTICE` in the npm package and in convint's vendored copy of the
  pattern JSON.
- Open clinical question: whether hair-pulling, skin-picking and nail-biting
  belong in `self_harm`. Recommendation: no, but the clinical reviewer
  decides.

### 3.2 Second-opinion adapters (Q7)

- **Interface.** The core package exports a small `CrisisSecondOpinion`
  interface (input text → normalised `{level, immediacy?, subject?,
  providerScores, raw}`). Each provider is its own package, like
  `@meddevkit/adapter-azure`: fetch-only, no SDK, opt-in.
- **Combination policy:**
  - The regex result is computed first and never changed.
  - The final level is the **maximum** of the two, so a model can raise a
    level but never lower a regex `crisis`.
  - An adapter error or timeout marks the result `degraded` and returns the
    regex result.
  - Text leaves the device only when the consumer installs and configures an
    adapter. The README must say so.
- **Decisions the adapter note left open, with recommendations:**
  - Q-A1, which adapters first: nope, then OpenAI.
  - Q-A2, a model reporting subject "other": map it to **concern**, not none.
    This is recall-first, and the caller decides.
  - Q-A3, how high a provider can raise the level: one that cannot tell the
    subject (OpenAI's generic `self-harm`, Azure) raises only to **concern**.
    `self-harm/intent` and nope-edge's self-subject severity may raise to
    **crisis**.
  - Q-A4, packaging: one package per provider.
- **Spec correction:** OpenAI's `self-harm/instructions` does **not** signal
  immediacy. Only nope-edge's `imminence` maps to `immediacy`.

### 3.3 Evaluation datasets (M3)

- Store the data outside the repo, located by an env var (for example
  `CRISIS_EVAL_DATA`). If a repo path is ever used, gitignore it and add a CI
  guard that fails if such files are tracked.
- Publish counts, rates and 95% CIs only. Never quote or paraphrase a post.
- Turn misses into **new synthetic vectors**, written fresh. Never tune
  patterns against these sets: they are external indicators, kept separate
  from the §8 release gate.
- Label mapping is approximate (C-SSRS user-level → none/concern/crisis).
  Document it with the results.

## 4. Do now (M0), before any code

1. Send the author questions:
   - Suicide Risk Lexicon: NOTICE wording, and the mismatch between file
     counts and the paper's Table 1 (S2).
   - O'Dea and Sawhney: rights to the phrase lists.
   - RSD-15K: does the non-commercial clause cover an MIT library?
   - OpenAI: does the BAA cover `/v1/moderations`?
2. Adopt the §6 provenance fields (done in SPEC.md) and add a `NOTICE`
   template to the package plan.
3. Download Reddit C-SSRS (anonymised release, Zenodo 4543776) and the Hasan
   & Saquer split into the private eval location. They are CC BY 4.0, so no
   agreement is needed.
4. Name the clinical reviewer (Q6). The reviewer's sign-off is what lets the
   README say anything stronger than "unreviewed".
