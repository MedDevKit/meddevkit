# @meddevkit/crisis-screen

A keyword-and-context screen for first-person crisis language. It is not a diagnostic or risk-assessment tool, it will miss some expressions of risk, and it must never be the only safeguard. Route any flagged text to a person according to your own escalation policy.

> **Status: in development, unreviewed.** No clinician has reviewed the
> categories, the level mapping, the patterns or the test vectors yet. Do not
> describe this screen as validated. Metrics (recall, false-alarm rates) are to
> be published after the held-out evaluation and clinical review.

## What it does

`screenText` looks for first-person language suggesting the writer may be in
acute distress or at risk of harming themselves, and returns a level
(`none`, `concern` or `crisis`), an `immediacy` flag, and every finding with
its rule id, matched span, offsets and context modifiers (negated, past,
resolved, hypothetical, quoted, idiom, third party). Context changes a
finding's level; it never hides it.

The library does not show crisis resources and does not decide what happens
next. Escalation is your job, because the right resources depend on locale and
setting. For example, a US consumer might surface 988 (Suicide & Crisis
Lifeline) on `crisis`.

## Properties

- **Offline.** No network calls and no model inference. Deterministic.
- **No logging.** It does not log, store or send text, and errors never
  contain text. Findings carry offsets and spans of at most 120 characters.
- **Zero runtime dependencies.** Works in Node >= 18 and the browser.
- **Linear time.** A 50,000-character input screens in tens of milliseconds;
  the test suite includes adversarial inputs to guard against regex
  backtracking.
- **English only** (v1). Risk to others is out of scope (v1).
- **Not HIPAA-anything.** This package makes no HIPAA or other regulatory
  compliance claim.

## Usage

```ts
import { screenText } from '@meddevkit/crisis-screen';

const r = screenText('I keep thinking about ending it. Maybe tonight.');
// r.level      -> 'crisis'
// r.immediacy  -> true
// r.findings   -> [
//   { ruleId: 'si_active.ending_it', category: 'suicidal_ideation_active',
//     baseLevel: 'crisis', level: 'crisis', startOffset: 7, endOffset: 31,
//     text: 'thinking about ending it',
//     modifiers: { negated: false, past: false, resolved: false,
//                  hypothetical: false, quoted: false, idiom: false },
//     subject: 'self' },
//   { ruleId: 'immediacy.timing', category: 'immediacy', baseLevel: 'none',
//     level: 'crisis', text: 'tonight', ... }
// ]
// r.patternsVersion -> '0.1.0'

screenText('This commute is killing me.').level;            // 'none' (idiom, finding kept)
screenText("I'm not going to hurt myself.").level;          // 'concern' (negated, never 'none')
screenText('My friend told me she wanted to die.').level;    // 'none' (subject 'other', finding kept)
screenText('Years ago I tried to kill myself. I am doing better now.').level; // 'concern' (history)

// Audits: report idioms without suppressing them.
screenText('This commute is killing me.', { suppressIdioms: false }).level; // 'concern'
```

Offsets are UTF-16 code units (JavaScript string indices). `findings` are in
text order and include findings that context softened to `none`.
`screenText` throws a `TypeError` (with no text in the message) if `text` is
not a string or the options are malformed.

## How levels are decided

| Level | Meaning |
|---|---|
| `crisis` | Present, first-person thoughts of suicide or self-harm, or feeling unsafe with oneself |
| `concern` | Acute distress without self-harm language, or crisis language that context softened |
| `none` | Nothing found, or only idioms, third parties, or clearly resolved past distress |

Categories: `suicidal_ideation_passive`, `suicidal_ideation_active`,
`self_harm`, `unsafe_with_self` (base `crisis`); `acute_distress`, `history`
(base `concern`); `immediacy` (flag only).

One modifier sets each finding's level, by precedence:

1. `idiom` → `none` ("dying to know", "this job is killing me").
2. third party → `none`, `subject: 'other'` ("my friend said she wanted to die").
3. `past` + `resolved` → acute distress `none`; crisis language `concern` with
   category `history`. `resolved` may come from the next sentence ("I was
   falling apart. I'm not there anymore.").
4. `negated`, `hypothetical`, `quoted`, or `past` alone → `concern` (negated
   acute distress → `none`). If several apply, the higher level wins.

Context rules worth knowing:

- **Recent past is present.** "Last night", "yesterday", "this week" and a
  present-tense verb in the same clause keep a finding current. `past` needs a
  distant anchor ("years ago", "back in college", "when I was nineteen",
  "used to", "last year").
- **A first-person conditional is not hypothetical.** "If things don't get
  better I might end my life" stays `crisis`. Questions about others or about
  procedure ("how do people know if…", "would you have to report it?") are
  `hypothetical`.
- **Negation is scoped** to the clause after the cue, and pseudo-negations
  ("not sure", "don't know", "can't stop") do not count. A denial of
  self-harm is still `concern`, because it is worth a human look.
- **`immediacy`** (plan, means, timing, preparation) is set only when a
  non-negated `crisis` finding is present in the same text. It never lowers a
  level.
- The text's level is the maximum over its findings, so the writer's own
  statement wins over an idiom or a third-party finding elsewhere.

## Patterns are public

The full pattern list, modifier cues and clause boundaries are open source, so
you can see exactly what the screen does and does not match:
[`data/crisis.patterns.json`](https://github.com/MedDevKit/meddevkit/blob/main/packages/crisis-screen/data/crisis.patterns.json).
The raw file is also shipped in the package as
`@meddevkit/crisis-screen/patterns.json` for vendoring into other runtimes.

### Pattern file format

```jsonc
{
  "version": "0.1.0",
  "patterns": [   // detection patterns
    { "id": "si_active.ending_it", "category": "suicidal_ideation_active", "level": "crisis",
      "pattern": "…", "flags": "i", "note": "…", "sources": ["srl-v1.0", "nimh-asq"], "relation": "informed-by" }
  ],
  "modifiers": [  // context cues
    { "id": "negated.not", "modifier": "negated", "scope": "forward", "maxGap": 50, "pattern": "…", … },
    { "id": "past.block_recent", "modifier": "past", "scope": "clause", "effect": "block", "pattern": "…", … }
  ],
  "boundaries": [ // clause boundaries for modifier scope
    { "id": "boundary.contrast", "strength": "strong", "pattern": "…", … }
  ]
}
```

Cue `scope` values: `forward` (the finding starts within `maxGap` characters
after the cue, in the same clause), `sentence` (same sentence, unless a
`strong` boundary lies between), `sentence-or-next` (same or next sentence),
`within` (the finding lies inside the cue's match, e.g. a quotation),
`overlap` (the cue overlaps the finding, e.g. an idiom). Cues with
`"effect": "block"` cancel a modifier: `clause` and `sentence` blocks cancel it
for findings in that clause or segment; a `between` block cancels a `forward`
cue when it lies after that cue and before the end of the finding.

Every regex stays within a portable subset (no named groups, `\p{…}`, inline
flags, atomic or possessive groups, variable-width lookbehind, `\Z`/`\z` or
`$`), so ECMAScript (`u` flag) and Python `re` give the same matches. Patterns
run over the whole text; sentence splitting is structural and lives in code.

### Metrics

```bash
pnpm --filter @meddevkit/crisis-screen build
pnpm --filter @meddevkit/crisis-screen metrics        # SPEC §8 metrics on data/vectors.jsonl
node packages/crisis-screen/scripts/metrics.mjs <file.jsonl>
```

Published metrics: to be published after the held-out evaluation and clinical
review.

Design and evaluation plan:
[SPEC.md](https://github.com/MedDevKit/meddevkit/blob/main/docs/specs/crisis-screen/SPEC.md).
Third-party attributions: [NOTICE](./NOTICE).

## License

MIT. Some patterns are informed by third-party sources; see [NOTICE](./NOTICE).
