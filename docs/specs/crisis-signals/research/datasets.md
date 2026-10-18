# Real-world datasets for evaluating `@meddevkit/crisis-signals` (evaluation only)

Research date: 2026-10-18. Scope: annotated real-world datasets that could be
used to **evaluate** the screen locally and privately, reporting only aggregate
metrics. None of this text may become a test vector: SPEC §7 says vectors are
synthetic only. This note supplements SPEC §8 (evaluation) and §12 (prior art).

> **Not legal advice.** This is a reading of published terms by a non-lawyer.
> Confirm licence and data-use questions with the dataset owners (and counsel,
> if the project has one) before relying on it.

Claims are cited inline. **UNVERIFIED** marks anything I could not confirm
from a primary source during this search (for example, pages that were
blocked or PDFs whose text could not be extracted).

## Summary

| Dataset | Access | Licence | Research-only? | Can publish metrics? | Label fit (none/concern/crisis) | Effort | Recommendation |
|---|---|---|---|---|---|---|---|
| Reddit C-SSRS (Gaur et al. 2019; Zenodo 2667859 / 4543776) | Open download | CC BY 4.0 | No restriction in the licence | Yes, with attribution (CC BY 4.0) | Fair: clinician C-SSRS labels map to crisis/concern, but labels are per **user**, not per text | Minutes | **Pursue (primary)** |
| Reddit benchmark suite, suicidality split (Hasan & Saquer 2026; Zenodo 17114739) | Open download | CC BY 4.0 | No restriction in the licence | Yes, with attribution | Weak to fair: binary suicidal / non-suicidal, post-level; control posts give an everyday false-alarm check | Minutes | **Pursue (secondary)** |
| UMD Reddit Suicidality Dataset v2 (CLPsych 2019) | Application + **IRB approval** + governance review | Data-use terms set by UMD/AAS (no open licence) | Effectively yes (IRB research protocol) | Likely, with required citation; confirm in application | Fair: 4-level clinician risk (no/low/moderate/severe), user-level | Weeks to months; needs an IRB | Stretch goal only if an IRB partner exists |
| RSD-15K (Zheng et al. 2025) | Google Form, academic email, 3–5 days | Repo says CC0-1.0, but terms say non-commercial research only, no redistribution | **Yes** | Probably (citation required); confirm with authors | Fair: C-SSRS-derived Attempt/Behavior/Ideation/Indicator, user-level | Days; needs academic email | Hold; ask authors about an open-source project first |
| PsySUICIDE / PsyGUARD (Qiu et al. 2024) | Open (Hugging Face) | MIT | No | Yes | Good taxonomy, but **Chinese** text | Minutes | Out of v1 scope (English); revisit for v2 |
| Kaggle "Suicide and Depression Detection" | Open (Kaggle account) | CC BY-SA 4.0 (as declared by uploader) | No (per declared licence) | Technically yes | Poor: labels are subreddit names, not annotations | Minutes | **Do not use** (noisy labels, Pushshift-scraped, licence of uncertain validity) |
| SDCNL (Haque et al.) | Open (GitHub) | None stated | Unknown | Unclear | Poor: subreddit-derived suicide vs depression | Minutes | Do not use |
| Crisis Text Line conversations | Closed; past programme required IRB + enclave; now closed model | Proprietary | Yes | Only by agreement | Would be excellent (real crisis-line text) | Not available to us | Do not pursue |
| Suicide Risk Lexicon validation data (Crisis Text Line, ~16k conversations) | Restricted; not shared | Proprietary | n/a | n/a | n/a | Not available | Not a dataset route (use the lexicon itself, §12) |

## How these labels relate to our levels

Our screen labels **one text** as `none` / `concern` / `crisis` (SPEC §4).
Every Reddit dataset below labels a **user** (a posting history) or a post on
a risk scale. Two consequences for any evaluation:

1. **Unit mismatch.** For user-level labels, run the screen on each post and
   take the user's level as the maximum over their posts. Report this as a
   user-level proxy, not as text-level recall.
2. **Missing negatives.** None of these datasets labels grief, idioms,
   negation, third-party mentions or hypotheticals. They can estimate **crisis
   recall** and an **everyday false-alarm rate** on control posts. They cannot
   measure the grief or idiom false-alarm rates in §8; those stay on the
   synthetic held-out set.

## Datasets

### 1. Reddit C-SSRS Suicide Dataset (Gaur et al. 2019)

- **Content.** Reddit posts from r/SuicideWatch and related mental-health
  subreddits (r/depression, r/BPD, r/bipolar, r/anxiety and others), 2005–2016
  ([PLOS One 2021, PMC8128252](https://pmc.ncbi.nlm.nih.gov/articles/PMC8128252/)).
  A gold standard of 500 users, drawn from 2,181 candidate users, was
  annotated "by four practicing psychiatrists following the guidelines
  outlined in Columbia-Suicide Severity Rating Scale (C-SSRS), with the
  pairwise annotator agreement of 0.79 and group-wise agreement of 0.73"
  ([Zenodo 2667859](https://zenodo.org/records/2667859)). English.
- **Labels.** Five classes: Supportive, Suicide Indicator, Suicide Ideation,
  Suicide Behavior, Suicide Attempt
  ([Zenodo 2667859](https://zenodo.org/records/2667859);
  [PMC8128252](https://pmc.ncbi.nlm.nih.gov/articles/PMC8128252/)). The PLOS
  One follow-up drops the 52 Indicator users and reports 448 users; my
  reading of its class table gives roughly 122 Supportive, 178 Ideation, 99
  Behavior and 50 Attempt (summed over throwaway and non-throwaway accounts;
  this sums to 449, so the exact counts are **UNVERIFIED**), and says the release includes user-level and
  post-level annotation (7,327 posts)
  ([PMC8128252](https://pmc.ncbi.nlm.nih.gov/articles/PMC8128252/)). Whether
  post-level labels are present in the Zenodo CSV is **UNVERIFIED**; the
  file names suggest one row per user with their posts.
- **First-person present vs other.** Partly. "Supportive" separates people
  helping others from those at risk, which is close to our `third_party`/`none`.
  "Attempt" is a past attempt, which is closer to our `history` (concern) than
  to `crisis`. Ideation and Behavior are present-tense risk.
- **Access and licence.** Open download, "Creative Commons Attribution 4.0
  International" ([Zenodo 2667859](https://zenodo.org/records/2667859)). The
  later release is also open and CC BY 4.0, with a file named
  `500_anonymized_Reddit_users_posts_labels.csv`
  ([Zenodo 4543776](https://zenodo.org/records/4543776)). CC BY 4.0 permits
  commercial use and publishing results with attribution
  ([CC BY 4.0 deed](https://creativecommons.org/licenses/by/4.0/)). The
  licence covers the authors' compilation and labels; whether it can grant
  rights in the Reddit users' own post text is doubtful (**UNVERIFIED**, see
  "Reddit's own terms" below). That is another reason never to commit text.
- **Ethics and privacy.** The 2021 release says posts were modified to protect
  anonymity ([PMC8128252](https://pmc.ncbi.nlm.nih.gov/articles/PMC8128252/)).
  Reddit text is searchable, so verbatim quotes can re-identify a poster even
  without usernames. Do not quote or paraphrase posts anywhere.
- **Fit.** Ideation → `crisis`; Behavior → `crisis` and expect `immediacy`;
  Attempt → `concern` or `crisis` (past attempt; count any non-`none` as a
  hit); Indicator → `concern` or `none`; Supportive → `none` expected, but
  these users discuss suicide, so a `crisis` result there is a useful
  third-party false-alarm signal. Small (500 users) but clinician-labelled.
- **Effort.** Minutes. Prefer the anonymised 4543776 release.

### 2. Reddit-derived benchmark suite, suicidality split (Hasan & Saquer 2026)

- **Content.** Four Reddit datasets; the suicidal-ideation one has 37,821
  posts from r/SuicideWatch and control subreddits, October–December 2022
  ([arXiv 2604.23458](https://arxiv.org/html/2604.23458)). English.
- **Labels.** Binary suicidal / non-suicidal, post-level. Human validation
  used a rubric of "overt intention, discussion of past attempts, or concrete
  planning" versus non-suicidal content
  ([arXiv 2604.23458](https://arxiv.org/html/2604.23458)). Annotator
  background (clinical or not) and how many posts were human-checked versus
  labelled by subreddit: **UNVERIFIED**. The abstract reports agreement above
  0.8 ([arXiv abstract](https://arxiv.org/abs/2604.23458)).
- **First-person present vs other.** No. The positive class mixes present
  intent and past attempts.
- **Access and licence.** Open download, CC BY 4.0, files include
  `suicidality_labeled_train.csv` and `suicidality_labeled_test.csv`
  ([Zenodo 17114739](https://zenodo.org/records/17114739)).
- **Ethics and privacy.** No ethics statement found in the paper
  ([arXiv 2604.23458](https://arxiv.org/html/2604.23458)). De-identification
  status: **UNVERIFIED**; treat as identifiable.
- **Fit.** Suicidal → expect non-`none` (any-flag recall; crisis recall as a
  rough proxy). Non-suicidal control posts → everyday false-alarm rate, the
  most useful part for us. Use only the test split, so results are comparable
  with the paper.
- **Effort.** Minutes.

### 3. UMD Reddit Suicidality Dataset v2 (CLPsych 2019 shared task)

- **Content.** 11,129 users who posted on r/SuicideWatch plus 11,129 controls,
  from the 2015 Full Reddit Submission Corpus; 1,242 users crowd-annotated and
  490 users expert-annotated ([dataset page](https://psresnik.github.io/umd_reddit_suicidality_dataset.html)).
  Version 2 adds the CLPsych 2019 train/test split and "automatic
  de-identification of post titles/bodies" (same page). English.
- **Labels.** User-level four-point risk: no, low, moderate, severe
  ([CLPsych 2019 overview, W19-3003](https://aclanthology.org/W19-3003/)). The
  shared task had three variants, "two focusing on r/SuicideWatch posts and
  one analyzing everyday Reddit activity" (same source). Exact rubric wording
  (for example "severe = plan or recent attempt"): **UNVERIFIED**. The brief's
  link (W19-3020) is a participant paper, Ruiz et al., not the overview
  ([W19-3020](https://aclanthology.org/W19-3020/)).
- **Access and terms.** Application to Philip Resnik (resnik@umd.edu),
  reviewed by a governance committee with the American Association of
  Suicidology. Quoted requirements: the application "*must* provide
  documentation that your project plan has been reviewed and approved by an
  Institutional Review Board or equivalent", and "If you are a graduate
  student, please note that documentation of review by an advisor or
  supervisor does *not* satisfy this requirement." The applicant must commit
  to the ethics in Benton et al. (2017), store data on password-protected
  restricted servers, include a README prohibiting redistribution, provide
  access logs on request, and cite "University of Maryland Reddit Suicidality
  Dataset, Version 2" and acknowledge AAS
  ([dataset page](https://psresnik.github.io/umd_reddit_suicidality_dataset.html)).
  Commercial use is not addressed: **UNVERIFIED**. Publishing aggregate
  metrics is the normal use (it was a shared task), but an open-source README
  should be cleared in the application.
- **Fit.** no → `none`; low → `concern` or `crisis`; moderate and severe →
  `crisis`. Expert subset (490 users) is the one to use.
- **Effort.** High. An individual open-source maintainer without an IRB
  cannot apply. Possible only through a university or clinical partner.

### 4. RSD-15K (Zheng, Tao, Zhou 2025)

- **Content.** 15,000 user-level samples from Reddit via the Reddit API,
  with posting time sequences ([arXiv 2507.11559](https://arxiv.org/abs/2507.11559)).
  English.
- **Labels.** C-SSRS-derived four classes: Attempt (809), Behavior (2,056),
  Ideation (7,133), Indicator (4,615); Indicator covers posts "that do not
  indicate any suicidal risk" or concern about others. Three annotators and
  three supervisors "knowledgeable in psychology domain", not stated to be
  clinicians; Fleiss' kappa 0.7206 on 30% of data
  ([arXiv HTML](https://arxiv.org/html/2507.11559)).
- **Access and terms.** Google Form, academic or organisational email only,
  3–5 business days; repository licence shown as CC0-1.0, but its terms say
  "Use is limited to non-commercial research purposes only", "Do not
  redistribute the dataset", "Do not attempt to identify or contact
  individuals in the dataset", and citation is mandatory
  ([GitHub RSD_15K](https://github.com/Suicide-DataSet/RSD_15K)). The CC0
  label and the non-commercial terms conflict; follow the stricter terms.
- **Ethics.** "All personal identifiers ... were removed" and the authors
  claim no re-identification is possible
  ([arXiv HTML](https://arxiv.org/html/2507.11559)). Verbatim Reddit text can
  still be searched, so treat that claim cautiously.
- **Fit.** Ideation and Behavior → `crisis`; Attempt → `history`/`concern`
  or `crisis`; Indicator → `none` or `concern`. Larger than C-SSRS but not
  clinician-labelled. Whether an MIT library that may be used commercially
  counts as "non-commercial research": **UNVERIFIED**, ask the authors.
- **Effort.** Days. Requires an academic email.

### 5. PsySUICIDE (PsyGUARD, Qiu, Ma, Lan, EMNLP 2024)

- **Content.** 14.8k rows, Chinese, multi-label with 11 suicide-related
  categories (including attempt, preparation and planning), from social
  media, counselling conversations and synthetic data
  ([Hugging Face card](https://huggingface.co/datasets/qiuhuachuan/PsySUICIDE);
  [paper](https://aclanthology.org/2024.emnlp-main.264/)).
- **Access and licence.** Open; MIT
  ([Hugging Face card](https://huggingface.co/datasets/qiuhuachuan/PsySUICIDE);
  [GitHub PsyGUARD](https://github.com/qiuhuachuan/PsyGUARD)).
- **Fit.** The taxonomy is the closest to ours, but the language is Chinese,
  which is out of scope for v1 (English patterns). Keep for v2.

### 6. Kaggle "Suicide and Depression Detection" and SDCNL

- **Kaggle.** Posts collected with the Pushshift API; "All posts collected
  from SuicideWatch are labeled as suicide", depression posts as depression,
  and non-suicide posts come from r/teenagers; declared licence CC BY-SA 4.0
  ([Kaggle API metadata](https://www.kaggle.com/api/v1/datasets/view/nikhileswarkomati/suicide-watch);
  [Kaggle page](https://www.kaggle.com/datasets/nikhileswarkomati/suicide-watch)).
  Labels are where the post was made, not what it says. The uploader cannot
  license Reddit users' text, and Pushshift's bulk access was cut off in 2023
  after Reddit's API changes
  ([r/modnews, May 2023](https://www.reddit.com/r/modnews/comments/13wshdp/api_update_continued_access_to_our_api_for/),
  read via a mirror; **UNVERIFIED** on reddit.com).
  Not usable as a quality benchmark.
- **SDCNL.** 1,895 posts from r/SuicideWatch and r/Depression, labelled by
  subreddit; the authors themselves note the labels are noisy; no licence
  stated ([GitHub SDCNL](https://github.com/ayaanzhaque/SDCNL)). Do not use.

### 7. Crisis Text Line and the Suicide Risk Lexicon validation data

- **Crisis Text Line.** Its research programme ran as an IRB-gated data
  enclave from February 2016 to July 2017, then moved to a "closed research
  model" in September 2017; it later licensed de-identified data to the
  for-profit Loris.ai
  ([Reierson commentary, PMC11730236](https://pmc.ncbi.nlm.nih.gov/articles/PMC11730236/)).
  A 2018 "Open Data Collaborations" relaunch required university affiliation
  and IRB approval ([Wikipedia](https://en.wikipedia.org/wiki/Crisis_Text_Line));
  its current status is **UNVERIFIED**. Not realistic for an open-source
  project.
- **Suicide Risk Lexicon.** Validated on about 16,000 de-identified Crisis
  Text Line conversations to which CTL "provided specialized training and
  controlled access" ([MIT News](https://news.mit.edu/2026/estimating-suicide-risk-from-text-0924)).
  The conversations are not shared. The lexicon itself is the reusable part
  (§12); its licence is still to be confirmed.

### Reddit's own terms

All the Reddit-derived sets above contain Reddit users' text. Reddit's Public
Content Policy (May 2024) keeps access for "researchers, and other
good-faith, non-commercial actors", requires a contract for use that will
"power, augment or enhance your product for any commercial purposes", and
asks partners to honour users' deletions
([TechCrunch](https://techcrunch.com/2024/05/09/reddit-locks-down-its-public-data-in-new-content-policy-says-use-now-requires-a-contract)).
In 2023 Reddit said research use should be non-commercial, that researchers
should not distribute Reddit data or derivatives, and should anonymise
published results ([r/modnews](https://www.reddit.com/r/modnews/comments/13wshdp/api_update_continued_access_to_our_api_for/);
read via a search-result mirror, **UNVERIFIED** on reddit.com).
I could not fetch the primary policy pages
([Data API Terms](https://redditinc.com/policies/data-api-terms),
[Public Content Policy](https://support.reddithelp.com/hc/en-us/articles/26410290525844-Public-Content-Policy)),
so the exact clauses are **UNVERIFIED**. Practical reading: evaluating an
open-source safety library and publishing aggregate numbers fits the
non-commercial research use Reddit describes; shipping Reddit text, or
training a product model on it, does not.

## Recommendation for M3

Pursue two open, CC BY 4.0 datasets. They need no agreement and can be cited
in the README:

1. **Primary: Reddit C-SSRS, anonymised release** ([Zenodo 4543776](https://zenodo.org/records/4543776)).
   The only open set labelled by psychiatrists on a C-SSRS scale. Report
   user-level crisis recall (Ideation and Behavior), any-flag recall (plus
   Attempt), and the `crisis` rate on Supportive users.
2. **Secondary: Hasan & Saquer suicidality test split** ([Zenodo 17114739](https://zenodo.org/records/17114739)).
   Post-level and large. Report any-flag recall on suicidal posts and the
   false-alarm rate on non-suicidal control posts.

Present both as an **external, real-world indication**, separate from the §8
release gate. The gate stays on the synthetic dev and held-out vectors. Keep
the RSD-15K and UMD routes as options: RSD-15K if the authors confirm in
writing that an open-source library evaluation with published aggregate
metrics is allowed; UMD only with an IRB partner.

### Steps to obtain

- **C-SSRS:** download `500_anonymized_Reddit_users_posts_labels.csv` from
  [Zenodo 4543776](https://zenodo.org/records/4543776). Record the DOI and
  file checksum (Zenodo shows MD5) in the evaluation script, not the file.
- **Hasan & Saquer:** download `suicidality_labeled_test.csv` from
  [Zenodo 17114739](https://zenodo.org/records/17114739); record DOI and
  checksum.
- **RSD-15K (optional):** email the corresponding author
  (21097982d@connect.polyu.hk, per the
  [repository](https://github.com/Suicide-DataSet/RSD_15K)) describing the
  project (MIT library, local evaluation only, aggregate metrics in README),
  ask whether that is within "non-commercial research", then submit the
  Google Form from an academic email.
- **UMD v2 (optional):** only with an institution: obtain IRB approval or
  exemption, then send the cover letter and IRB documents to resnik@umd.edu
  as described on the
  [dataset page](https://psresnik.github.io/umd_reddit_suicidality_dataset.html).

### Handling rules

- **Local only.** Store data outside the repository (for example
  `~/.meddevkit-eval/crisis-signals/`), pointed to by an environment variable
  such as `CRISIS_SCREEN_EVAL_DIR`. If a repo-relative path is ever used, add
  it to `.gitignore` first (for example `eval/private/`) and add a CI check
  that fails if any file under it is tracked.
- **No text leaves the machine.** No logging of post text, no text in error
  messages (matches SPEC §9), no committing of predictions joined to text.
  Store per-item results keyed by row index only, and only locally.
- **Aggregate metrics only.** Publish counts, rates and 95% confidence
  intervals per class. Never publish examples, quotes, paraphrases or
  "notable misses" from real posts. Study misses privately and write
  **new synthetic** vectors that capture the pattern, never edited copies.
- **No tuning on it.** Treat these sets like `vectors.heldout.jsonl`: do not
  write or tune patterns while looking at them. Run them at release time and
  record the before and after numbers.
- **Attribution.** Cite each dataset and paper next to the numbers, as CC BY
  4.0 requires and as RSD-15K and UMD require.
- **Re-check terms** before each release that publishes numbers, since
  Reddit's and the datasets' terms can change.
