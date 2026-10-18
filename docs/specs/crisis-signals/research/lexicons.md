# Lexicon sources for `@meddevkit/crisis-screen` patterns

> **Status:** research note, 2026-10-18. Companion to [`../SPEC.md`](../SPEC.md)
> (§4 categories, §6 pattern JSON, §11 D2 public patterns, §12 prior art) and
> to [`datasets.md`](./datasets.md) (evaluation data).
>
> **Not legal advice.** This is a non-lawyer's reading of published licences
> and terms, written to decide what to ask and what to avoid. Get counsel
> before relying on any "probably fine" below.

**How claims are marked.** **Verified** means I read the licence text, the
file, or the paper passage myself. **Inferred** means a conclusion I drew from
verified facts. **UNVERIFIED** means an open point; each one has a matching
question in [Questions for authors](#questions-for-authors).

## Summary

| Source | Licence | Redistributable in an MIT package? | Fit for our categories | Recommended use |
|---|---|---|---|---|
| **Suicide Risk Lexicon (SRL) v1.0**, Low et al. (MIT / Harvard / Child Mind Institute), in `construct-tracker` | **Apache-2.0** for the repo and PyPI package (verified). The journal article is CC BY-NC-ND 4.0; the preprint is CC0 | **Yes**, if Apache-2.0 §4 is met (licence copy, attribution, change notice). Apache lets our own changes, and the combined work, carry MIT terms | Good for 6 of its 50 constructs (passive SI, active SI and planning, direct self-injury, lethal means, "other suicidal language", part of burdensomeness). The other ~40 are broader risk factors (finances, sleep, discrimination...) and are out of scope | **Primary vocabulary source in M1.** Author our own framed regexes from the mapped constructs. Run a dev-only coverage audit. Mine its ambiguous words for idiom/everyday negative vectors |
| **O'Dea et al. 2015** search phrases | Article CC BY-NC-ND 4.0, "© 2015 The Authors" (verified) | **Not verbatim.** NC and ND rule out sharing an adapted list in an MIT package. Each phrase on its own is probably too short to be protected (inferred) | Narrow but on target: 21 tweet phrases ("want to die", "better off without me", "suicide plan") | **Cross-check only** (`relation: "informed"`). Never vendor the list. Ask the authors for permission |
| **Sawhney et al. 2018**, the ~42-entry list that the spec's "~50 phrases" actually comes from | CC BY 4.0 (ACL Anthology notice, verified) | Yes, with attribution. Whether Sawhney could relicense O'Dea's 21 phrases is **UNVERIFIED** | Same as O'Dea, plus self-harm methods ("slit my wrist") and "kill me now" | Cross-check list. Use verbatim only in test or coverage files, with attribution |
| **Lexicography Saves Lives (LSL)**, Schoene et al., COLING 2025 | Paper CC BY 4.0 (verified). **No data released**: the published paper still says "www.dummy.com" (verified) | Paper list: yes, with attribution. Translations: nothing to redistribute yet | The English list is Sawhney's list plus 10 noisy items. Main value is non-English (v2) | **Not used in v1.** Watch for the data release for v2 |
| **C-SSRS** (Columbia Protocol) | © 2008 Research Foundation for Mental Hygiene (RFMH). Free for community, healthcare and non-profit research use. Electronic implementations are exclusively licensed through ERT/Clario, for a fee (verified) | **No** for the item wording | Its constructs (wish to be dead, method, intent, plan, preparatory behaviour) line up with ours | **Concepts only.** Never copy item wording into patterns or vectors, and never claim C-SSRS levels |
| **ASQ** (NIMH Ask Suicide-Screening Questions) | "Public domain tool, free of charge" (verified) | Yes. NIMH asks to be cited as the source | Passive SI ("wished you were dead", "family would be better off"), active SI, history ("ever tried"), immediacy ("right now") | **Wording source** for frames and vectors (`nimh-asq`) |
| **NIMH "Warning Signs of Suicide"** | Public domain; images excluded (verified) | Yes, cite NIMH | Immediacy cues (saying goodbye, giving away items, making a will, researching ways to die), burden, trapped, unbearable pain | **Immediacy cue list** (`nimh-warning-signs`) |
| **VERA-MH** personas (Spring Health) | MIT-style, plus a required disclaimer and a no-endorsement condition (verified) | Yes, if the notice and disclaimer are kept | 100 synthetic personas with risk level None/Low/High/Immediate and a first-person seed message | **External evaluation set for M3**, never used for tuning (see [datasets.md](./datasets.md) for real-text sets) |
| **LIWC-22** | Proprietary EULA (verified) | **No** | Weak for suicide risk (the SRL paper shows this) | **Do not use.** Contrast only |
| Reddit C-SSRS lexicon files (Gaur et al. 2019) | CC BY 4.0 (Zenodo, verified) | The term files: yes. The posts are real user text: never as fixtures | Poor: clinical-terminology strings (ICD/SNOMED style), not first-person language | Not used for patterns. The posts are covered in [datasets.md](./datasets.md) |
| Empath | MIT (verified) | Yes | Generic categories (pain, death, sadness). No suicide-specific category | Not used |
| SRF lexicon (Grimland et al.) | No public release found | n/a | Hebrew, crisis-chat | Not pursued |

**Top recommendation.** In M1, build the pattern file **from scratch, in our own
regex frames**, using three sources: SRL v1.0 (Apache-2.0) as the main
vocabulary, NIMH ASQ, and NIMH warning signs (both public domain). Record
provenance on every pattern. Ship an Apache-2.0 attribution notice with the
package and with convint's vendored copy. Use O'Dea, Sawhney and LSL only as
cross-checks, use VERA-MH only as a held-out external evaluation, and do not
use C-SSRS wording or LIWC at all. Send the author questions now (M0), so that
the answers arrive before M3's "reviewed" claims.

**Corrections to SPEC §12** (for the orchestrator):
- The SRL licence is now confirmed: Apache-2.0.
- O'Dea et al. (2015) lists **21** phrases, not ~50. The ~50-item list is
  Sawhney et al. (2018) plus LSL's additions.
- LSL has **not** released any data.

---

## Copying versus "informed by" (applies to every source)

- **Short phrases.** The US Copyright Office says: "Words and short phrases,
  such as names, titles, and slogans, are uncopyrightable because they contain
  an insufficient amount of authorship"
  ([Circular 33](https://www.copyright.gov/circs/circ33.pdf), verified). So
  "want to die" or "kill myself" is not anyone's property.
- **Lists.** A *list* can still have thin protection for its original
  selection and arrangement
  ([Feist v. Rural, 499 U.S. 340](https://www.law.cornell.edu/supremecourt/text/499/340)).
  Inferred consequence: mechanically turning a whole published list into one
  regex per item is closer to adapting the list than writing our own patterns
  that happen to match some of the same phrases.
- **Licence exceptions.** CC licences do not apply where copyright does not:
  "Where Exceptions and Limitations apply to Your use, this Public License does
  not apply"
  ([CC BY-NC-ND 4.0 §2(a)(2)](https://creativecommons.org/licenses/by-nc-nd/4.0/legalcode.en),
  verified). This is jurisdiction-dependent, so we do not *rely* on it. We use
  it only to explain why "informed by" use of an NC-ND list is low-risk.
- **Practical rule.**
  - Apache-2.0, CC BY and public-domain sources may be adapted or quoted
    verbatim, with attribution.
  - CC BY-NC-ND sources (O'Dea 2015, the SRL *journal article*) and
    proprietary sources (C-SSRS, LIWC) are never copied as a list. At most
    they inform patterns we write ourselves.
  - Provenance records which case applies (see [Provenance fields](#provenance-fields-proposal-for-6)).

---

## 1. Suicide Risk Lexicon (SRL) v1.0

### What it is

- **Canonical release:** [`danielmlow/construct-tracker`](https://github.com/danielmlow/construct-tracker),
  directory [`src/construct_tracker/data/lexicons/suicide_risk_lexicon_v1-0`](https://github.com/danielmlow/construct-tracker/tree/main/src/construct_tracker/data/lexicons/suicide_risk_lexicon_v1-0).
  The lexicon also ships inside the PyPI package
  [`construct-tracker`](https://pypi.org/project/construct-tracker/) (v1.0.16)
  and loads with `lexicon.load_lexicon(name='srl_v1-0')`
  ([README](https://github.com/danielmlow/construct-tracker/blob/main/README.md)). Verified.
- **Paper:** Low DM, Rankin O, Coppersmith DDL, Bentley KH, Nock MK, Ghosh SS.
  "Using large language models to create lexicons for interpretable text
  models with high content validity: The suicide risk lexicon." *Journal of
  Psychopathology and Clinical Science*, published 2026-09-24,
  [doi:10.1037/abn0001152](https://doi.org/10.1037/abn0001152). Preprint:
  [PsyArXiv vf2bc](https://doi.org/10.31234/osf.io/vf2bc) (v4, 2026-05-18).
  Press coverage: [MIT News](https://news.mit.edu/2026/estimating-suicide-risk-from-text-0924),
  [Child Mind Institute](https://childmind.org/blog/identifying-suicide-risk-based-on-the-words-people-use/).
  The paper names the GitHub repo as the place where the lexicon is available
  (preprint §3.5, verified). Code to reproduce the paper:
  [`danielmlow/lexicon`](https://github.com/danielmlow/lexicon) (Apache-2.0, verified).
- **Files** (verified by download, repo HEAD
  `29ef0cfdd166ff5fb1cfe9057718f727d66b7d01`, 2026-09-28):
  - `suicide_risk_lexicon_validated_24-08-02T21-27-35.{json,csv}`: the
    validated lexicon. Last changed 2024-09-03.
  - `suicide_risk_lexicon_validated_prototypical_tokens_24-08-07T16-25-19.{json,csv}`:
    a much smaller subset that clinicians rated as definitely prototypical.
    For example, Passive SI has 8 tokens, Active SI 24 and Direct self-injury 15.
  - `suicide_risk_constructs_and_definitions_clean.csv`: definitions and
    their literature sources.
  - `suicide_risk_lexicon_codebook_prototypical_examples.txt`: a codebook.
  - `human_ratings/*.xlsx`: per-rater ratings from three raters.
- **Shape.** The JSON has 50 constructs: 49 risk factors plus Relationships
  & kinship
  ([lexicon_description.md](https://github.com/danielmlow/construct-tracker/blob/main/src/construct_tracker/data/lexicons/lexicon_description.md)).
  Each construct has a `definition`, `definition_references`, `examples`,
  `tokens`, `tokens_lemmatized`, `remove` and `tokens_metadata`. Counting the
  `tokens` arrays gives about 4,350 unique strings. That count includes
  spaCy-lemmatised variants such as "wish I be dead" next to "wish I was dead"
  (verified).
- **Counts disagree.** Paper Table 1 reports these final token counts: Passive
  SI 42, Active SI & planning 80, Lethal means 72, Direct self-injury 58,
  Suicide exposure 22, Other suicidal language 72. The JSON's unique `tokens`
  are 69, 108, 101, 78, 29 and 129, including lemma variants. **UNVERIFIED:**
  which file is the article's final lexicon (question S2).
- **How it was built** (preprint, verified):
  1. GPT-4 Turbo generated tokens from definitions and seed examples.
  2. One author curated them.
  3. Calibration compared Reddit mental-health and non-mental-health posts,
     checked Crisis Text Line training matches in context (for example, it
     removed "give up" from Passive SI), and dropped tokens that never
     matched.
  4. One licensed clinical psychologist and two trainees rated how
     prototypical each token is. All three rated every suicidal-construct
     token. ICC = 0.48 for the suicidal constructs; agreement = 0.54 for the
     others, which the authors call "fair".
- **Validation.**
  - Data: Crisis Text Line conversations, 2017–2022 without 2020–21, with
    three labels: non-suicidal, suicidal, imminent risk. The modelling sample
    was 16,360 after downsampling; the test set was 5,353.
  - Result: lexicon counts with LightGBM modestly beat LIWC-22, matched an
    embedding baseline, and fell below fine-tuned MPNet.
  - Feature importance: active SI, lethal means and direct self-injury
    mattered most for imminent risk.
  - The authors limit the claim to "content validity and concurrent criterion
    validity", with no outcome validity. They also warn about polysemous
    tokens ("'cut' in Direct Self-Injury").
  - Source: preprint §§3.1, 4.2–4.3 and 5.2, verified.
- **Maintenance.** The repo is active (last push 2026-09-28) and published to
  PyPI. The lexicon itself has been unchanged since 2024-09. No "v1.1" exists
  yet; the paper's future work mentions protective factors and splitting
  constructs.

### Licence

- **Repo licence: Apache-2.0** (verified). The
  [LICENSE](https://github.com/danielmlow/construct-tracker/blob/main/LICENSE)
  is the full Apache-2.0 text. The [pyproject](https://github.com/danielmlow/construct-tracker/blob/main/pyproject.toml)
  declares `license = "Apache-2.0"`, and PyPI shows the OSI Apache classifier.
- **Gaps:**
  - The LICENSE has **no filled-in copyright line**: only the template
    "Copyright [yyyy] [name of copyright owner]".
  - The repo has **no NOTICE file**.
  - The author of record is "Daniel M. Low" (pyproject).
  - **UNVERIFIED:** whether the authors intend Apache-2.0 to cover the
    lexicon *data* as well as the code. Inferred: yes. The data sits inside
    the Apache-licensed package, and the paper points to this repo as its
    data release. Confirm with question S1.
- **Other licences around the same lexicon:**
  - The **journal article** is **CC BY-NC-ND 4.0** (Crossref `vor` licence,
    [metadata](https://api.crossref.org/works/10.1037/abn0001152), verified).
    So tables copied *from the article* would carry NC-ND. Take tokens from
    the GitHub files, not from the PDF.
  - The **PsyArXiv preprint** is **CC0 1.0** (OSF licence record,
    [API](https://api.osf.io/v2/preprints/vf2bc_v4/), verified).
  - The 2024 Harvard dissertation chapter is CC BY 4.0
    ([DASH](https://dash.harvard.edu/entities/publication/4a5cee0a-cb62-4ad6-820b-0af9275e5595)).
- **The key clauses** (Apache-2.0, verified in the repo copy):
  - §4: "You may reproduce and distribute copies of the Work or Derivative
    Works thereof ... provided that You meet the following conditions: (a) You
    must give any other recipients ... a copy of this License; and (b) You
    must cause any modified files to carry prominent notices stating that You
    changed the files; and (c) You must retain ... all copyright, patent,
    trademark, and attribution notices ..."
  - §4, closing paragraph: "You may add Your own copyright statement to Your
    modifications and may provide additional or different license terms and
    conditions for use, reproduction, or distribution of Your modifications,
    or for any such Derivative Works as a whole, provided Your use ... of the
    Work otherwise complies with the conditions stated in this License."
- **MIT compatibility** (inferred):
  - `crisis.patterns.json` can stay **MIT**, provided that we:
    1. include the Apache-2.0 text, for example in
       `packages/crisis-screen/THIRD_PARTY_NOTICES.md` or `LICENSES/Apache-2.0.txt`;
    2. credit SRL and the paper;
    3. state that we adapted the tokens.
  - Add `THIRD_PARTY_NOTICES.md` to the package's `files` in
    `package.json` (today `adapter-azure` ships only `dist`, README,
    CHANGELOG and LICENSE).
  - convint vendors the same JSON, so it vendors the notice next to it.
  - The Apache patent clause is irrelevant for word lists.
  - §6 means we must not use the authors' or institutions' names to imply
    endorsement.
- **Derived versus copied.** Hand-written regex frames that cover SRL
  phrases are probably a "Derivative Work" (Apache §1) only in the
  mixed-provenance sense. Attribution costs almost nothing and removes the
  question, so treat every SRL-informed pattern as derived. The tokens are
  LLM-generated and then human-curated, which may weaken a copyright claim
  (inferred), but **do not rely on that**: comply with Apache anyway.
- **Attribution** (suggested until question S1 is answered): "Contains
  material adapted from the Suicide Risk Lexicon v1.0 (construct-tracker,
  © Daniel M. Low and contributors, Apache-2.0). Low DM, Rankin O,
  Coppersmith DDL, Bentley KH, Nock MK, Ghosh SS (2026), J Psychopathol Clin
  Sci, doi:10.1037/abn0001152."

### Fit (verified token samples from the v1.0 JSON)

| SRL construct | Our category | Notes |
|---|---|---|
| Passive suicidal ideation | `suicidal_ideation_passive` | Direct match. Examples: "wish I was dead", "better off dead", "don't want to wake up", "no will to live", "why am I still alive". Some tokens are too loose for us ("giving up", "lifeless", "oblivion", "rest in peace", "fade away"). Use them only inside a self-referent frame, or as negative vectors |
| Active suicidal ideation & suicidal planning | `suicidal_ideation_active` + `immediacy` | Method and act tokens: "kill myself", "kms", "take my own life", "jump off a bridge". **Preparation tokens feed `immediacy`:** "I wrote a suicide note", "giving away my possessions", "write a will", "buying a gun", "buying a rope", "exit plan". Hazards: it contains "killing me" (an idiom), "cut", "attempt" and "on the edge" |
| Lethal means for suicide | `immediacy` (means) | "pills", "rope", "gun", "noose", "taking all the pills". Raises immediacy **only** next to a crisis finding (spec §4). Never a finding on its own |
| Direct self-injury | `self_harm` | "cut myself", "burn myself", "hurt myself", "harm myself", "urge to cut", "self-harm", "NSSI". **Clinical decision needed:** the construct also contains body-focused repetitive behaviours ("nail-biting", "skin picking", "hair-pulling"). Recommend leaving these out of `crisis` until the M3 reviewer decides |
| Other suicidal language | splits across categories | "I'm not safe", "I don't trust myself" → `unsafe_with_self`. "nothing to live for", "no one will miss me", "life isn't worth living" → `suicidal_ideation_passive`. "can't do this anymore", "breaking point", "end of my rope" → `acute_distress` (the reviewer confirms the level). "safety plan", "crisis hotline" are meta talk, not a category |
| Burdensomeness | partly `suicidal_ideation_passive` | "better off without me", "sorry for existing", "waste of space" → passive SI (matching spec §4, where "better off without me" is passive). "burden", "nuisance" and the like are risk factors: no flag |
| Entrapment & desire to escape; Hopelessness; Panic; Emotional pain | `acute_distress` candidates | "can't take it anymore", "can't go on", "panic attack", "mental breakdown", "no way out". Only the phrase-level, first-person items. Single words like "trapped", "stuck" or "doom" stay out (false alarms) |
| Suicide exposure; Hospitalization | `third_party` modifier vectors; `history` cues | "killed herself" is a *third-party* test vector. "psych ward" can support a `history` cue next to a past attempt |
| The other ~38 (relationships, finances, alcohol, sleep, discrimination, psychosis, eating disorders, ...) | none | Broader **risk factors**, not crisis statements. Using them would turn the screen into a risk scorer, which is a spec §1 non-goal. They can still help write `grief_negative` / `everyday_negative` vectors |

SRL is **mostly first-person** by design. The paper says example tokens were
chosen because "our main goal is detecting first-person expressions of
suicidality" (preprint appendix, verified). But it matches tokens with no
context: no negation, no tense, no subject. That gap is exactly what our §4
modifiers fill.

### Best implementation

1. **Author, don't convert.** For each mapped construct, group SRL tokens into
   phrase families and write one framed, portable regex per family. Use
   alternation for inflections, because we have no lemmatiser (SRL relies on
   spaCy). Example:

   ```json
   {
     "id": "si_passive.wish_dead",
     "category": "suicidal_ideation_passive",
     "level": "crisis",
     "pattern": "\\bwish(?:ed|ing)?\\s+(?:that\\s+)?i\\s+(?:was|were|could\\s+be)\\s+dead\\b",
     "flags": "i",
     "note": "First-person wish-to-be-dead frame.",
     "sources": [
       { "id": "srl-v1.0", "relation": "adapted", "terms": ["wish I was dead"] },
       { "id": "nimh-asq", "relation": "informed" }
     ]
   }
   ```

   Contractions need explicit alternation: `(?:do\s+not|don['’]?t)`. SRL
   stores straight apostrophes and lemma forms such as "do not". `[’']` is
   a plain character class, so it is portable. Alternatively, normalise
   apostrophes in both runtimes before matching. That is a design choice for
   the spec, not made here.
2. **Coverage audit** (a dev tool, not a release gate):
   - Vendor only the mapped constructs from a pinned commit into a dev-only
     folder (for example `packages/crisis-screen/tools/third_party/srl-v1.0/`
     with the Apache LICENSE and a README). Keep this folder out of the npm
     `files`.
   - For each token, test the bare token and the frame "I {token}" against
     the patterns of the expected category.
   - Record every miss in `srl-v1.0.triage.json` as one of: `covered-by` (a
     rule id), `excluded` (with a reason, for example "polysemous: 'cut'
     needs a self-referent"), or `todo`.
   - Report "SRL suicidal-construct coverage %" in the PR metrics (§8).
   - Do **not** gate on it. Many tokens are deliberately excluded for
     precision.
3. **Negative vectors from polysemy.** SRL's own hazards are a ready list
   for `idiom_negative` / `everyday_negative`: "cut", "killing me",
   "attempt", "bridge", "pills", "rope", "die", "dying", "end it", "on the
   edge", "rest in peace", "escape", "trapped". Write synthetic sentences
   that use these non-literally. Mark them `source: "synthetic"`,
   `origin: "srl-v1.0 polysemy: cut"`.
4. **Positive vectors.** Synthetic first-person sentences built around SRL
   prototypical tokens, with the token named in `origin`. The text is ours,
   so §7's synthetic-only rule holds.
5. **Clinician ratings** (`human_ratings/*.xlsx`) could rank which families
   to write first. Use only aggregates, and do not vendor the rater files
   (question S4).

---

## 2. O'Dea et al. 2015 (and its descendants: Sawhney 2018, LSL 2025)

### What it is

- **Paper:** O'Dea B, Wan S, Batterham PJ, Calear AL, Paris C, Christensen
  H. "Detecting suicidality on Twitter." *Internet Interventions* 2(2):183–188,
  2015, [doi:10.1016/j.invent.2015.03.005](https://doi.org/10.1016/j.invent.2015.03.005);
  open copy at [ANU](https://openresearch-repository.anu.edu.au/items/d5cda45b-38eb-44a3-b283-d7587bfb5a3a).
- **The list is 21 phrases**, printed inline in §3.1 and used to collect
  tweets (verified from the ANU PDF): "suicidal; suicide; kill myself; my
  suicide note; my suicide letter; end my life; never wake up; can't go on;
  not worth living; ready to jump; sleep forever; want to die; be dead;
  better off without me; better off dead; suicide plan; suicide pact; tired
  of living; don't want to be here; die alone; go to sleep forever".
- **It is not original to O'Dea.** The paper says the phrases are
  "consistent with the vernacular of suicidal ideation (Jashinsky et al.,
  2013)". That source is Jashinsky et al., *Crisis* 35:51–59, Hogrefe,
  [doi:10.1027/0227-5910/a000234](https://doi.org/10.1027/0227-5910/a000234),
  with no open licence in Crossref. **UNVERIFIED:** whether the list is
  copied from Jashinsky or adapted (question O2).
- **Also useful:** the paper's coding scheme separates "strongly concerning"
  from flippant uses ("I might just kill myself", song lyrics). That supports
  our `idiom`, `quoted` and `hypothetical` modifiers. Use it as conceptual
  guidance only.
- **Sawhney et al. 2018**, ACL Student Research Workshop,
  [P18-3013](https://aclanthology.org/P18-3013/), verified from the
  [PDF](https://aclanthology.org/P18-3013.pdf).
  - It reprints O'Dea's 21 phrases and adds 21 more, citing O'Dea. That is
    42 entries, 41 unique ("not worth living" appears twice). The additions
    include "wanna die", "commit suicide", "slit my wrist", "cut my wrist",
    "slash my wrist", "want it to be over", "nothing to live for", "ready to
    die", "I wish I were dead" and "kill me now".
  - This is the **"~50 phrases" list the spec refers to**.
- **LSL**: Schoene AM, Ortega JE, Zevallos RJ, Ihle LH, "Lexicography Saves
  Lives (LSL): Automatically Translating Suicide-Related Language", COLING
  2025, pp. 3179–3192,
  [2025.coling-main.213](https://aclanthology.org/2025.coling-main.213/);
  [arXiv 2412.15497](https://arxiv.org/html/2412.15497v1). Verified.
  - It prints a 50-item English list (51 entries) "based on work by Sawhney
    et al. (2018) and originally developed by O'dea et al. (2015)".
  - Compared with Sawhney's list, it drops "my suicide note" and adds 10
    items of unclear provenance: "hit life", "think suicide", "wanting to
    die", "suicide times", "last day", "feel pain point", "alternate life",
    "time to go", "beautiful suicide", "hate life" (my diff, verified).
    Several look like preprocessing artefacts. **Do not use them as
    patterns.**
  - Translation: the list was machine-translated into 200 languages (Fairseq
    / Flores-200), and native speakers evaluated 5 languages.
  - **Release status: none.** The COLING camera-ready still says "Made
    available upon publication: www.dummy.com" and "Link to code book: made
    available upon publication" (verified). No GitHub, Hugging Face or
    project site found.

### Licence

| Item | Licence | Key clause | Status |
|---|---|---|---|
| O'Dea 2015 article | "© 2015 The Authors. Published by Elsevier B.V. This is an open access article under the CC BY-NC-ND license" | [CC BY-NC-ND 4.0 §2(a)(1)](https://creativecommons.org/licenses/by-nc-nd/4.0/legalcode.en): "(A) reproduce and Share the Licensed Material, in whole or in part, for NonCommercial purposes only; and (B) produce and reproduce, but not Share, Adapted Material for NonCommercial purposes only" | Verified ([ANU record](https://openresearch-repository.anu.edu.au/items/d5cda45b-38eb-44a3-b283-d7587bfb5a3a/full), PDF footer, [Crossref](https://api.crossref.org/works/10.1016/j.invent.2015.03.005)) |
| Sawhney 2018 | ACL Anthology: "Materials published in or after 2016 are licensed on a Creative Commons Attribution 4.0 International License" | [CC BY 4.0 §2(a)(1)(B)](https://creativecommons.org/licenses/by/4.0/legalcode.en): "produce, reproduce, and Share Adapted Material". §3(a): credit the creator, keep the notice, indicate changes, link the licence | Verified (Anthology page notice) |
| LSL paper | CC BY 4.0 (arXiv and ACL Anthology) | as above | Verified |
| LSL data | none released | none | Verified absent |

- **MIT compatibility:**
  - **O'Dea, verbatim: no.** MedDevKit is MIT and may be used commercially,
    which conflicts with NC. Sharing a *modified* list conflicts with ND.
  - **O'Dea, the individual phrases:** almost certainly free to use
    (Circular 33; inferred). The authors hold copyright ("© The Authors"), so
    they can grant permission directly (question O1).
  - **Sawhney / LSL lists:** CC BY 4.0 allows adapting them inside an MIT
    package, with attribution. **But**: Sawhney reprinted O'Dea's 21 phrases.
    If those had any protection as a compilation, Sawhney's CC BY could not
    widen O'Dea's NC-ND (chain of title, **UNVERIFIED**). Inferred practical
    answer: the 21 short, common phrases are not protectable, so the risk is
    negligible. Still, prefer `relation: "informed"` for these, and quote
    them verbatim only in test or coverage files, with attribution.

### Fit

- **Strong:** `suicidal_ideation_active` ("kill myself", "end my life",
  "take my own life"), `suicidal_ideation_passive` ("never wake up", "better
  off without me", "don't want to be here", "tired of living") and
  `immediacy` ("my suicide note", "my suicide letter", "suicide plan",
  "suicide pact", "ready to jump").
- **Self-harm:** "slit/cut/slash my wrist" (Sawhney).
- **Weak or harmful as bare patterns:** "suicide", "suicidal", "depressed",
  "die alone", "be dead", "last day", "time to go". These are ambiguous out
  of context: news, third parties, idioms. They are first-person tweet
  vernacular, not a curated clinical list.

### Best implementation

- No vendoring. Do a one-time manual cross-check in M1: every O'Dea and
  Sawhney phrase should be matched by some pattern or marked excluded with a
  reason, in a triage note. Patterns that this check prompts get
  `{ "id": "odea2015", "relation": "informed" }`, or `sawhney2018` for the
  additions.
- The ambiguous items ("suicide", "die alone", "be dead") are good
  **negative and third-party vector seeds**. Examples: "The documentary was
  about suicide prevention"; "My grandmother was afraid to die alone".
- **LSL is v2 material.** Once data is released under a known licence, it
  is the route to non-English screens. Its 10 extra English items add
  nothing usable to v1.

---

## 3. C-SSRS (Columbia-Suicide Severity Rating Scale / Columbia Protocol)

- **What it is:** a clinician- or lay-administered interview scale. Its
  screener items cover wish to be dead, non-specific active thoughts,
  method, intent, plan, and suicidal behaviour (preparatory acts, attempts).
- **Terms** (verified):
  - Columbia: "The protocol and the training on how to use it are available
    free of charge for use in community and healthcare settings, as well as
    in federally funded or nonprofit research"
    ([about the scale](https://cssrs.columbia.edu/the-columbia-scale-c-ssrs/about-the-scale/)).
  - Copyright: "© 2008 The Research Foundation for Mental Hygiene, Inc." is
    printed on the screener (example:
    [USUHS copy](https://cdp.usuhs.edu/sites/default/files/2026-04/documents/CSSRS_fillable_0.pdf)).
  - Clario: "eResearch Technology, Inc., a Clario company has entered into an
    exclusive license agreement for the electronic implementations of this
    scale"
    ([Clario](https://clario.com/about/legal-and-privacy/c-ssrs-licensing-application/)).
  - The [template licence](https://clario.com/wp-content/uploads/2025/12/ERT-Template-C-SSRS-License-Agreement_JAN2026.docx)
    says:
    - "Licensor has the exclusive right to incorporate the
      Columbia-Suicide Severity Rating Scale ... into any electronic format";
    - "All copies of the Scale and any derivative works shall be considered
      part of the Scale";
    - fees: $40,000 start-up, $7,500 per year, $5,000 per certification,
      $4 per administration;
    - "Licensee may not alter a certified Implementation without ERT's prior
      written approval".
  - The template is written for clinical-research studies. Its fee
    schedule shows how tightly electronic use is controlled.
- **MIT compatibility for item wording: no.**
  - Embedding the screener questions, even paraphrased closely, in an npm
    package is plausibly an "electronic format" or "derivative work" in
    RFMH's view (inferred).
  - Short phrases inside an item ("go to sleep and not wake up") are not
    protectable on their own. But copying the *set* of items or their
    structure is exactly what RFMH licenses.
  - Naming "C-SSRS" or "Columbia Protocol" in a way that suggests
    endorsement is also off-limits (the template's publicity clause).
- **Fit:** the conceptual ladder is useful background for our
  `suicidal_ideation_passive` / `_active` / `immediacy` / `history` split.
  The spec already excludes C-SSRS scoring as a non-goal.
- **Recommendation:**
  - Use the C-SSRS **concepts only**. Concepts are not copyrightable.
  - Get our wording from public-domain ASQ and NIMH material instead (§4
    below).
  - Never put C-SSRS item text in patterns, vectors or docs.
  - Docs may cite the C-SSRS in a references list as background.
  - Ask Columbia (question C1) before mentioning the C-SSRS anywhere
    beyond a citation.

---

## 4. Public-domain US government material: NIMH ASQ and warning signs

- **ASQ (Ask Suicide-Screening Questions):**
  - The [NIMH toolkit](https://www.nimh.nih.gov/research/research-conducted-at-nimh/asq-toolkit-materials)
    says: "Public domain tool, free of charge"
    ([information sheet](https://www.nimh.nih.gov/sites/default/files/documents/research/research-conducted-at-nimh/asq-toolkit-materials/asq-tool/information_sheet_asq_nimh_toolkit.pdf)).
    Verified.
  - Items ([screening tool PDF](https://www.nimh.nih.gov/sites/default/files/documents/research/research-conducted-at-nimh/asq-toolkit-materials/asq-tool/screening-tool-asq-nimh-toolkit.pdf),
    verified):
    1. "...have you wished you were dead?"
    2. "...felt that you or your family would be better off if you were dead?"
    3. "...thoughts about killing yourself?"
    4. "Have you ever tried to kill yourself?"
    5. Acuity: "Are you having thoughts of killing yourself right now?"
  - **Fit:** item 1 → passive SI. Item 2 → passive SI ("better off" frames).
    Item 3 → active SI. Item 4 → `history`. Item 5 → `immediacy` ("right
    now"). The items are second-person questions. Turn them into
    *first-person* frames and vectors ("I keep wishing I was dead").
- **NIMH "Warning Signs of Suicide"**
  ([page](https://www.nimh.nih.gov/health/publications/warning-signs-of-suicide),
  verified):
  - Reuse terms: "The information in this publication is in the public
    domain and may be reused or copied without permission. However, you may
    not reuse or copy images." NIMH asks to be cited and asks reusers not to
    alter content in misleading ways
    ([reuse policy](https://www.nimh.nih.gov/health/publications/reprinting-and-reusing-nimh-publications)).
  - Signs listed: "Making a plan or researching ways to die"; "Withdrawing
    from friends, saying goodbye, giving away important items, or making a
    will"; "Being a burden to others"; "Empty, hopeless, trapped, or having
    no reason to live"; "Unbearable emotional or physical pain".
  - **Fit:** the strongest open source for `immediacy` preparation cues
    ("said my goodbyes", "giving my things away", "made a will", "looked up
    how to"). It also supports `acute_distress` ("unbearable pain").
- **MIT compatibility:** yes. Credit NIMH in `sources`. Do not reuse images.
- **Recommendation:** use both in M1, with ids `nimh-asq` and
  `nimh-warning-signs`. They are the cleanest wording source we have.

---

## 5. VERA-MH personas (synthetic test material)

- **What it is:** [`SpringCare/VERA-MH`](https://github.com/SpringCare/VERA-MH),
  an open evaluation of how AI chatbots detect and respond to suicide risk
  ([paper, arXiv 2602.05088](https://arxiv.org/abs/2602.05088)). Its
  [`data/SI/personas.tsv`](https://github.com/SpringCare/VERA-MH/blob/main/data/SI/personas.tsv)
  has 100 synthetic personas (verified):
  - risk levels: None 10, Low 30, High 30, Immediate 30;
  - a disclosure style (low, moderate or high explicitness);
  - a first-person "Final Seed Phrase", for example "thinking a lot about
    just ending things, like thinking about pills, but not really planning
    it...".
  - The repo is actively maintained (personas last changed 2026-09-21).
- **Licence** ([LICENSE](https://github.com/SpringCare/VERA-MH/blob/main/LICENSE),
  verified): "© 2026 Spring Care, Inc." with MIT-style wording, plus two
  extra conditions:
  - "The disclaimer shall also be included in all copies or substantial
    portions of the Material";
  - no implied "certification, endorsement, validation ... by Spring Care".
- **MIT compatibility:** yes, if we keep the notice and the disclaimer, and
  never say "VERA-MH validated". The extra conditions apply to the copied
  file only.
- **Fit:** clinician-designed, first-person, conversational, and
  **synthetic**, so it fits §7. It includes indirect disclosures, which
  measure the screen's known blind spot. **UNVERIFIED:** whether the seed
  phrases were written by people or generated by an LLM (question V1).
- **Recommendation:** an **M3 external evaluation set**
  (`vectors.external-veramh.jsonl`), never read while writing patterns, the
  same rule as `vectors.heldout.jsonl`. Report recall per risk level and per
  disclosure style. Do not gate on it: low-disclosure personas are
  *expected* to return `none` or `concern`.

---

## 6. Sources not to use

- **LIWC-22 (proprietary).** The [EULA](https://liwc.app/help/eula)
  (verified):
  - "You may not share or redistribute the LIWC application or any of its
    components with anyone"
  - "You are not allowed to modify, reverse engineer ... or use for any
    derivative works the LIWC program or any of the LIWC components"
  - Academic use only; commercial licences go through Receptiviti
    ([FAQ](https://www.liwc.app/help/faq)).

  Do not use the LIWC dictionary, even to "check coverage". The SRL paper
  also found LIWC weak for suicide risk ("low content validity for mental
  illness", preprint abstract). Mention it only as a contrast.
- **Reddit C-SSRS lexicon files** (Gaur et al. 2019,
  [Zenodo 2667859](https://zenodo.org/records/2667859), CC BY 4.0, verified).
  - `suicidal_ideation.csv`, `suicidal_behavior.csv`,
    `suicidal_attempt.csv` and `suicidal_indicator.csv` are lists of
    clinical-terminology strings ("Suicide and self-inflicted injury by
    Barbitone", "Personal history of self-harm"). They are not conversational
    first-person language, so the fit is poor.
  - Many look drawn from SNOMED CT or ICD descriptions, which carry their own
    licence terms. **UNVERIFIED**; not pursued.
  - The *posts* in the same record are real user text. See
    [datasets.md](./datasets.md): evaluation only, never fixtures.
- **Empath** ([repo](https://github.com/Ejhfast/empath-client), MIT,
  verified; last push 2017). Generic categories (pain, death, sadness) with
  no suicide or self-harm category. Not useful beyond what SRL gives.
- **SRF lexicon** (Grimland et al.,
  [Haifa record](https://cris.haifa.ac.il/en/publications/predicting-suicide-risk-in-real-time-crisis-hotline-chats-integra/)).
  Hebrew crisis-chat lexicon; no public release found. Not pursued for v1.
- **Crisis Text Line data.** Only available under a data-sharing agreement:
  the SRL paper says "The Crisis Text Line dataset is sensitive and cannot be
  shared" (preprint §3.5). No lexicon release.

---

## Provenance fields (proposal for §6)

The brief suggests a per-pattern `"source": "odea2015"`. I recommend a slightly
richer, still portable shape, so that `THIRD_PARTY_NOTICES.md` can be
generated and checked in CI. This is a schema decision for the spec owner.

```json
{
  "patternsVersion": "0.1.0",
  "sources": {
    "srl-v1.0": {
      "title": "Suicide Risk Lexicon v1.0 (construct-tracker)",
      "url": "https://github.com/danielmlow/construct-tracker/tree/29ef0cfdd166ff5fb1cfe9057718f727d66b7d01/src/construct_tracker/data/lexicons/suicide_risk_lexicon_v1-0",
      "licence": "Apache-2.0",
      "citation": "Low DM, Rankin O, Coppersmith DDL, Bentley KH, Nock MK, Ghosh SS (2026). J Psychopathol Clin Sci. doi:10.1037/abn0001152"
    },
    "nimh-asq": { "title": "ASQ Suicide Risk Screening Tool", "url": "https://www.nimh.nih.gov/research/research-conducted-at-nimh/asq-toolkit-materials", "licence": "public-domain" },
    "nimh-warning-signs": { "title": "Warning Signs of Suicide", "url": "https://www.nimh.nih.gov/health/publications/warning-signs-of-suicide", "licence": "public-domain" },
    "odea2015": { "title": "Detecting suicidality on Twitter", "url": "https://doi.org/10.1016/j.invent.2015.03.005", "licence": "CC-BY-NC-ND-4.0" },
    "sawhney2018": { "title": "A Computational Approach to Feature Extraction for Identification of Suicidal Ideation in Tweets", "url": "https://aclanthology.org/P18-3013/", "licence": "CC-BY-4.0" }
  },
  "patterns": [
    { "id": "...", "sources": [ { "id": "srl-v1.0", "relation": "adapted", "terms": ["..."] } ] }
  ]
}
```

- `relation` takes one of four values:
  - `original`: written here, no source;
  - `informed`: the source was consulted, nothing was copied;
  - `adapted`: specific source terms became regex alternations;
  - `verbatim`: exact strings, allowed only in test or coverage files.
- **CI rule:** any source whose licence is `CC-BY-NC-ND-4.0` or
  proprietary may appear only with `relation: "informed"`.
- `terms` is optional. Keep it short, for auditability.
- The Python consumer ignores unknown fields, so this does not affect the §6
  portable-regex subset.

---

## Recommendation and milestones

| Milestone | Action |
|---|---|
| **M0 (now)** | 1. Adopt the `sources` / `relation` fields above. 2. Correct SPEC §12: SRL is Apache-2.0; O'Dea is 21 phrases, the ~50-item list is Sawhney + LSL; LSL data is unreleased. 3. Send the author questions below. 4. Under Q3 (vendoring), note that convint's vendored JSON must travel with `THIRD_PARTY_NOTICES.md` and the Apache-2.0 text |
| **M1** | 1. Write patterns from scratch, using SRL (the 6 mapped constructs plus the distress subsets), `nimh-asq` and `nimh-warning-signs`. 2. Add the dev-only SRL coverage audit and triage file, reported in PRs but not a gate. 3. Write polysemy negatives from SRL hazards. 4. Do the one-time O'Dea / Sawhney cross-check (`informed`). 5. Add `THIRD_PARTY_NOTICES.md` and the Apache-2.0 text to the package `files`. 6. Add a CI check that every `sources[].id` is in the registry and that the NC-ND/proprietary rule holds |
| **M2** | convint vendors `crisis.patterns.json` plus `THIRD_PARTY_NOTICES.md`. No SRL data in convint |
| **M3** | 1. The clinical reviewer also reviews SRL-adapted families, especially body-focused repetitive behaviours in `self_harm` and which "other suicidal language" items count as `acute_distress` versus `crisis`. 2. Score the VERA-MH external set. 3. Make sure the README attribution and the "unreviewed" wording match the author answers |
| **v2** | LSL translations (if released and licensed), SRL updates, protective-factor constructs |

**Never:** LIWC dictionaries, C-SSRS item wording, the O'Dea list vendored
verbatim, real user text from any dataset as fixtures, or tokens copied from
the journal-article PDF (CC BY-NC-ND) instead of the GitHub release.

---

## Questions for authors

**Suicide Risk Lexicon**: Daniel M. Low (author of record in pyproject),
Satrajit Ghosh (MIT McGovern).
- **S1.** Does Apache-2.0 in `construct-tracker` cover the lexicon data
  files (JSON/CSV) as well as the code? The LICENSE has no copyright line.
  What copyright holder and attribution string do you want? Would you
  consider dual-licensing the lexicon data as CC0 or CC BY?
- **S2.** Which file is the final lexicon reported in the 2026 article
  (Table 1 counts: 42 / 80 / 72 / 58 / 22 / 72): `validated_24-08-02` or
  `validated_prototypical_tokens_24-08-07`? Will future versions be tagged?
- **S3.** Are you comfortable with MIT-licensed regex patterns *adapted* from
  SRL tokens (with Apache notice and citation) in a public npm package and a
  Python repo? Any wording you want us to avoid, such as implied endorsement?
- **S4.** May we use the per-token clinician ratings, aggregated only, to
  prioritise patterns? Did you see conversational false positives beyond the
  ones the paper lists ("cut", "give up")?

**O'Dea et al. 2015**: Bridianne O'Dea (corresponding author).
- **O1.** May we reproduce the 21 search phrases verbatim, with citation, in
  an MIT-licensed open-source test/coverage file? Or do you agree they are a
  non-protectable list of common phrases?
- **O2.** Was the list taken verbatim from Jashinsky et al. (2013/2014), or
  adapted? If verbatim, who holds rights to it?

**Sawhney et al. 2018**: Ramit Sawhney.
- **W1.** Were the 21 phrases added beyond O'Dea's authored by your team? Is
  the list as printed covered by the paper's CC BY 4.0?

**LSL**: Annika Marie Schoene (corresponding author).
- **L1.** When, where and under what licence will the translated lexicons,
  the human evaluations and the code book be released? The camera-ready
  still says "www.dummy.com".
- **L2.** Where do the 10 items in your 50-item list that are not in Sawhney
  2018 come from ("hit life", "feel pain point", "suicide times",
  "alternate life", ...)?

**Columbia Lighthouse Project / RFMH**: Kelly Posner.
- **C1.** Does a free, open-source, offline text screen need a licence or
  permission if its patterns are organised around C-SSRS *constructs* (wish
  to be dead, method, intent, plan, preparatory behaviour)? It would not
  reproduce item wording, administer the scale, or produce C-SSRS scores.
  May we cite the C-SSRS in the README as conceptual background?

**VERA-MH**: Spring Health (Luca Belli, Kate H. Bentley).
- **V1.** Were the persona "Final Seed Phrase" texts written by clinicians or
  generated by an LLM? Is using them as an external evaluation set in an
  MIT-licensed repo, with your notice and disclaimer, consistent with your
  intent?
