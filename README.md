# @orkestrel/rater

> A typed quantitative rating layer over `@orkestrel/reason`'s shared engine: authored
> lines, each a plain reason `QuantitativeDefinition` joined to display metadata, rated
> against one subject to produce a `LineResult` per line — an `amount` and its
> `Worksheet` audit trail — and one `RatingResult` carrying every line's outcome and a
> derived `total`.

Create a rater with the `createRater` function, hand it the lines a subject is rated
against, and read the `LineResult` rows and the `total` it derives. Inject a
`ReasonInterface` where the rating shares an engine with the rest of your reasoning, and
call `destroy()` when the rater's work is done. Environment-agnostic — no I/O, no browser
or server assumptions. Part of the `@orkestrel` line.

## Install

```sh
npm install @orkestrel/rater
```

## Requirements

- Node.js >= 22.12.0
- ESM (`import`) and CommonJS (`require`) through the `exports` field

## Usage

```ts
import { buildLineDefinition, createRater } from '@orkestrel/rater'
import {
	createFactorGroup,
	createQuantitativeDefinition,
	createStaticFactor,
} from '@orkestrel/reason'

const rater = createRater()

const base = buildLineDefinition(
	'base',
	'Base Amount',
	createQuantitativeDefinition('base', 'Base', [
		createFactorGroup('amount', 'sum', [createStaticFactor('flat', 100)]),
	]),
)

const result = rater.rate([base], { id: 'subject-1' })
result.lines[0]?.amount // 100
result.total // 100

rater.emitter.on('rate', (subject, rated) => rated.success)

rater.destroy()
```

`rate` accepts a plain `LineDefinition[]` or a full `RatingDefinition` plus one
subject, and each overload rates that single subject. Every `rate` call fires once
through `rater.emitter` (`rate`).

## Guide

For the full surface — `Rater`, `RatingResult`, worksheet types, validators,
factories, errors, and options — see
[`guides/rater.md`](guides/rater.md).

## Package

Published as a single typed entry point per the `exports` field in
`package.json`.

## License

MIT © [Orkestrel](https://github.com/orkestrel) — see [LICENSE](./LICENSE).
