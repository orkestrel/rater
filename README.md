# @orkestrel/rater

A typed **quantitative rating layer** over [`@orkestrel/reason`](https://github.com/orkestrel/reason):
authored **lines** — each a plain reason `QuantitativeDefinition` joined to display
metadata — are rated against a **subject** (a plain data record) to produce a
`LineResult` per line (an `amount` plus its `Worksheet` audit trail) and one
`RatingResult` (every line's outcome plus a derived `total`). The caller decides
which lines to rate; `Rater` only evaluates what it is given. Rating never mutates
its inputs — every result is a fresh object. Environment-agnostic — no I/O, no
browser or server assumptions. Part of the `@orkestrel` line.

## Install

```sh
npm install @orkestrel/rater
```

## Requirements

- Node.js >= 24
- ESM (`import`) and CommonJS (`require`) via the `exports` field

## Usage

```ts
import { createRater, lineDefinition } from '@orkestrel/rater'
import { factorGroup, quantitativeDefinition, staticFactor } from '@orkestrel/reason'

const rater = createRater()

const base = lineDefinition(
	'base',
	'Base Amount',
	quantitativeDefinition('base', 'Base', [
		factorGroup('amount', 'sum', [staticFactor('flat', 100)]),
	]),
)

const result = rater.rate([base], { id: 'subject-1' })
result.lines[0]?.amount // 100
result.total // 100

rater.emitter.on('rate', (subject, rated) => rated.success)

rater.destroy()
```

`rate` accepts a plain `LineDefinition[]` or a full `RatingDefinition` plus one
subject — both overloads rate a single subject. Every `rate` call fires once
through `rater.emitter` (`rate`).

## Guide

For the full surface — `Rater`, `RatingResult`, worksheet types, validators,
factories, errors, and options — see
[`guides/src/rater.md`](guides/src/rater.md).

## Package

Published as a single typed entry point per the `exports` field in
`package.json`.

## License

MIT © [Orkestrel](https://github.com/orkestrel) — see [LICENSE](./LICENSE).
