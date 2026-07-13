# @orkestrel/rater

A typed **rating engine**: programs compile line, pass, and ruling definitions
into determinations, worksheets, and aggregates for rated subjects. Pure,
authored **program definitions** — `lines` (quantitative rating), `passes`
(ordered pre-rating overlays), `rulings` (rule id → effect routing), `notices`,
and an optional `authority` (a final logical gate deriving a `decision`) — are
compiled and rated over ONE shared [`@orkestrel/reason`](https://github.com/orkestrel/reason)
engine (`quantitative` + `logical` reasoners). Rating never mutates its
inputs: every result — `LineResult`, `ProgramResult`, `SubjectResult`,
`AggregateResult` — is a fresh object carrying a `trace` and accumulated
`errors`. Batch rating additionally supports per-program aggregate fields, an
optional partition key, and gated aggregate determinations, plus per-`Status`
tallies. Environment-agnostic — no I/O, no browser or server assumptions.
Part of the `@orkestrel` line.

## Install

```sh
npm install @orkestrel/rater
```

## Requirements

- Node.js >= 24
- ESM-only (no CommonJS build)

## Usage

```ts
import { createRater, lineDefinition, programDefinition } from '@orkestrel/rater'
import { factorGroup, quantitativeDefinition, staticFactor } from '@orkestrel/reason'

const rater = createRater()

const base = lineDefinition(
	'base',
	'Base Amount',
	quantitativeDefinition('base', 'Base', [
		factorGroup('amount', 'sum', [staticFactor('flat', 100)]),
	]),
)

rater.programs.add(programDefinition('p1', 'Program', [base]))

const result = rater.rate({ id: 'subject-1' }) // one subject → one SubjectResult
result.programs[0]?.eligibility // 'eligible'

rater.rate([{ id: 'a' }, { id: 'b' }]) // an ARRAY resolves to the batch AggregateResult overload

rater.destroy()
```

`rate` dispatches by input shape — an ARRAY resolves to the batch
`AggregateResult` overload, a single subject resolves to `SubjectResult`.
Every applied determination and derived decision fires through
`rater.emitter` (`rate` / `aggregate` / `determine` / `decide`).

## Guide

For the full surface — the `Rater` orchestrator, compiled `Program`s, the
ordered `ProgramManager`, worksheet and determination helpers, validators,
factories, errors, and the observation surface — see
[`guides/src/rater.md`](guides/src/rater.md).

## Package

Published as a single typed entry point per the `exports` field in
`package.json`.

## License

MIT © [Orkestrel](https://github.com/orkestrel) — see [LICENSE](./LICENSE).
