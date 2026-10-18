# @meddevkit/crisis-signals

## Unreleased (0.1.0)

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
