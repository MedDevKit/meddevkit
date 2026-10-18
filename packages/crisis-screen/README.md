# @meddevkit/crisis-screen

A keyword-and-context screen for first-person crisis language. It is not a diagnostic or risk-assessment tool, it will miss some expressions of risk, and it must never be the only safeguard. Route any flagged text to a person according to your own escalation policy.

> **Status: in development, unreviewed.** No clinician has reviewed the
> categories, the level mapping or the test vectors yet. Do not describe this
> screen as validated. Metrics (recall, false-alarm rates) are to be published
> after the held-out evaluation and clinical review.

## What it does

`screenText` looks for first-person language suggesting the writer may be in
acute distress or at risk of harming themselves, and returns a level
(`none`, `concern` or `crisis`), an `immediacy` flag, and every finding with
its rule id, matched span, offsets and context modifiers (negated, past,
resolved, hypothetical, quoted, idiom, third party). Context changes a
finding's level; it never hides it.

The library does not show crisis resources and does not decide what happens
next. Escalation is your job, because the right resources depend on locale and
setting.

## Properties

- **Offline.** No network calls and no model inference. Deterministic.
- **No logging.** It does not log, store or send text, and errors never
  contain text. Findings carry offsets and spans of at most 120 characters.
- **Zero runtime dependencies.** Works in Node >= 18 and the browser.
- **English only** (v1). Risk to others is out of scope (v1).
- **Not HIPAA-anything.** This package makes no HIPAA or other regulatory
  compliance claim.

## Usage

```ts
import { screenText } from '@meddevkit/crisis-screen';

const r = screenText('I keep thinking about ending it. Maybe tonight.');
// r.level      -> 'crisis'
// r.immediacy  -> true
// r.findings   -> [{ ruleId: 'si_active.ending_it', category: 'suicidal_ideation_active', ... }, ...]
```

> The current 0.1.0 scaffold returns `level: 'none'` for all input; the
> detection engine and patterns are in progress.

## Patterns are public

The full pattern list and modifier cues are open source, so you can see exactly
what the screen does and does not match:
[`data/crisis.patterns.json`](https://github.com/MedDevKit/meddevkit/blob/main/packages/crisis-screen/data/crisis.patterns.json).
The raw file is also shipped in the package as
`@meddevkit/crisis-screen/patterns.json` for vendoring into other runtimes.

Design and evaluation plan:
[SPEC.md](https://github.com/MedDevKit/meddevkit/blob/main/docs/specs/crisis-screen/SPEC.md).
Third-party attributions: [NOTICE](./NOTICE).

## License

MIT. Some patterns are informed by third-party sources; see [NOTICE](./NOTICE).
