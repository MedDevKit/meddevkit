# @meddevkit/crisis-screen

## Unreleased (0.1.0)

### Minor Changes

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
- `data/crisis.patterns.json` 0.1.0: 73 detection patterns over all seven
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
  raw as `@meddevkit/crisis-screen/patterns.json`.
