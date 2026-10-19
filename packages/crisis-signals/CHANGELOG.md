# @meddevkit/crisis-signals

## 0.2.0

### Minor Changes

- Round 3 (generalisation), `data/crisis.patterns.json` 0.2.0: 115 patterns
  (109 detection, 4 of them context-gated, and 6 immediacy), 88 modifier
  cues, 5 clause boundaries and 26 fragments, all `informed-by` and within
  the portable regex subset. New areas:
  - Method imagery without death words: an imagery or urge frame
    (`IMAGINE`: thinking about, picturing, the urge to, part of me wants to,
    my brain keeps showing me) plus a concrete act (not braking at the curve,
    swerving into a truck, letting go of the wheel, stepping off the roof,
    lying on the tracks, sliding under the bath water and staying there, a
    cord around my neck).
  - Soft passive wishes: fading out or going quiet with a permanence word
    nearby, staying asleep for good, wishing I had never existed, the world
    without me, others better off with me gone, pressing a button to be
    erased, hoping an illness or a plane crash takes me, not being a burden
    much longer, done being alive.
  - Preparation and goodbyes: written goodbyes, scheduled messages, settled
    bills and passwords, giving pets and belongings away, reading up on
    methods, stockpiled bottles (immediacy cues), plus "by then I won't be
    alive", "take the whole bottle", "taking myself out of the picture".
  - Denials that follow the crisis wording in a copular or nominal frame
    ("wanting to die isn't what this is", "hurting myself has never been
    part of it", "suicide has never been an option for me"), and denied
    distress states kept as negated findings ("I'm not crying").
  - Clinical history: "years back", "back when", "before treatment", "my past
    overdose", thoughts that stopped since starting treatment, "not a current
    issue", "haven't relapsed", "clean and sober 5 years".
  - Idiom and everyday suppression strengthened to match: "the hill I'll die
    on", "I was deceased", "had the whole room dying", "die of
    embarrassment" kept as an idiom finding, and "I can't take it anymore" or
    "kill me" about an everyday nuisance (traffic, the heating, a webinar),
    unless voices or noise "in my head" are mentioned in the same sentence.
- Pattern file format, extended compatibly: a detection pattern may carry a
  `context` (`scope`: `sentence` or `adjacent`; `categories`, `rules`,
  `pattern`) and is then context-gated: a match yields a finding only when a
  non-negated, non-idiom finding of those categories or rules, or a match of
  the context regex, lies in the same (or the previous or next) sentence
  without overlapping it. Used for vague and anaphoric wording ("I'm going
  to finish it", "how I'd do it", "for when they find me", "this is it",
  "after I'm gone"). `PatternContext` and `ContextScope` are exported.
  Final-sounding statements that are alarming on their own ("this is the
  last time you'll hear from me", "nobody can talk me out of it") are
  `concern` (`distress.vague_finality`).
- Opt-in second opinion: `screenTextWithSecondOpinion(text, opinion,
  options)` and the `CrisisSecondOpinion` / `SecondOpinionResult`
  interfaces for adapter packages. The offline result is returned unchanged
  as `local`; the final level is the maximum of the two (a model can raise,
  never lower); an adapter error, timeout (default 10 s) or invalid result
  returns the local result with `degraded: true` and no input text. No
  network calls or dependencies in this package; `screenText` is unchanged.

### Patch Changes

- Measured limits (patterns 0.2.0, Wilson 95% CIs, synthetic and unreviewed
  vectors): on held-out v2, written blind (167 vectors), crisis recall 15/31
  = 48.4% (32.0–65.2%), any-flag recall 36/56 = 64.3% (51.2–75.5%), grief
  false alarms 0/14 (0–21.5%), idiom and everyday false alarms 2/34 = 5.9%
  (1.6–19.1%). Misses are mostly oblique (preparation without crisis words,
  imagery, wishes phrased by meaning). The README now positions the package
  as an explainable, fast, offline first-pass signal that must never be the
  only safeguard, and recommends combining it with a second opinion and a
  human process.
- Dev vectors: 533/534 pass (crisis recall 100%, any-flag recall 100%, grief
  false-alarm 0%, idiom and everyday false-alarm 0%, on 534 vectors). One
  vector is a known label conflict (it expects an idiom-marked finding for
  harm to another person, which v1 does not detect).
- Performance: about 25 ms for a realistic 50,000-character input on a
  laptop (was about 20 ms), under 45 ms for the worst adversarial input.

## 0.1.1

### Patch Changes

- First release published from GitHub Actions via npm trusted publishing,
  with provenance. No code or pattern changes.

## 0.1.0

### Minor Changes

- Renamed from `@meddevkit/crisis-screen` (never published) to
  `@meddevkit/crisis-signals`, so "screen" isn't read as a UI. The API
  (`screenText`) is unchanged; "screen" there means screening.

- Round 2 (generalisation): patterns rebuilt around shared frames and
  vocabulary slots instead of fixed phrases. A first-person subject
  (apostrophes optional), up to five bounded fillers (hedges, intensifiers,
  auxiliaries, intention verbs, negations) and a category slot, with
  synonyms, slang and texting spellings ("thinkin abt", "killin myself",
  "sh'd", "unalive", "kms"), method fantasies, burden frames, unsafe-with-self
  variants, distress states and episodes, and immediacy decisions and
  locations. Idiom and everyday suppression strengthened to match (violent
  hyperbole about things, exhaustion after an activity, "I literally died",
  frustration and embarrassment idioms, topic mentions such as "reading about
  self-harm").
- New category `threatened_by_other` (base `concern`, subject `other`): a
  person threatening or hurting the writer (SPEC §4 clarification). The
  third-party rule does not lower it; idiom cues suppress figurative uses
  ("my mom is going to kill me") unless means, violence or fear appear in the
  same or the next sentence.
- Pattern file format, extended compatibly: `fragments` (named regex pieces
  referenced as `{{ID}}` and expanded before compiling); the first
  participating capturing group of a detection pattern is the finding span,
  and an empty group is a veto; cues may be restricted to `categories`; block
  cues may use `sentence-or-next` scope. `FragmentEntry` is exported.
- `data/crisis.patterns.json`: 107 patterns (101 detection, 6 immediacy)
  over eight categories, 78 modifier cues, 5 clause boundaries and
  20 fragments, all `informed-by` and within the
  portable regex subset (also checked after fragment expansion). Dev vectors:
  381/381 pass (crisis recall 100%, any-flag recall 100%, grief false-alarm
  0%, idiom and everyday false-alarm 0%).

- Detection engine: `screenText(text, options?)` returns the text's level,
  `immediacy`, and every finding (rule id, category, base and final level,
  offsets, span of at most 120 characters, modifiers, subject) in text order,
  including findings softened to `none`. Implements SPEC §4 precedence and the
  2026-10-18 clarifications: recent past stays present, first-person
  conditionals are not hypothetical, negated crisis language is `concern`,
  negated acute distress is `none`, third parties are `none` with
  `subject: 'other'`, and `immediacy` needs a non-negated `crisis` finding.
- Local sentence splitting and data-driven clause boundaries; modifier scope
  (`forward`, `sentence`, `sentence-or-next`, `within`, `overlap`) and
  pseudo-cues (`effect: "block"`) are declared per cue in the pattern file.
- `options.suppressIdioms: false` reports idioms without suppressing them.
- `data/crisis.patterns.json` 0.1.0 (M1): 73 detection patterns over all seven
  categories, 65 modifier cues and 5 clause boundaries, all `informed-by`
  (Suicide Risk Lexicon v1.0, NIMH ASQ, NIMH Warning Signs of Suicide) and
  within the portable ECMAScript/Python regex subset.
- Pattern-file types extended compatibly: optional `scope`, `effect`,
  `maxGap` and `subject` on `ModifierCue`; optional `boundaries`
  (`BoundaryCue`) on `PatternFile`; `CueScope` exported.
- `scripts/metrics.mjs` and `pnpm metrics`: SPEC §8 metrics with Wilson 95%
  confidence intervals for any vectors file.
- Tests: all 160 dev vectors, a portable-regex lint, a positive and a negative
  example for every pattern, cue and boundary, precedence and scope unit
  tests, privacy and performance (50K-character and adversarial inputs).
- NOTICE records the sources actually used and that no entry is
  `adapted-from` a source.
- Unreviewed: no clinical review yet.

- Package scaffold: public types (`ScreenLevel`, `CrisisCategory`,
  `ScreenOptions`, `ScreenFinding`, `ScreenResult`, pattern-file types) and
  `PATTERNS_VERSION`; the pattern JSON is bundled into the build and shipped
  raw as `@meddevkit/crisis-signals/patterns.json`.
