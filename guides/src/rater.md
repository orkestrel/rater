# Rater

> A typed rating engine: pure, authored **program definitions** — `lines` (quantitative
> rating), `passes` (ordered pre-rating logical/quantitative overlays), `rulings`
> (rule id → effect routing), `notices`, and an optional `authority` (a final logical
> gate deriving a `decision`) — are compiled and rated against **subjects** (plain data
> records) over ONE shared `@orkestrel/reason` engine (`quantitative` + `logical`
> reasoners, `bail: false`). Rating never mutates its inputs: every working subject is
> built through copy-on-write overlays, and every result — `LineResult`,
> `ProgramResult`, `SubjectResult`, `AggregateResult` — is a fresh object carrying a
> `trace`, accumulated `errors`, and (for lines and programs) a `success` flag.
>
> The design stance mirrors reason's: **data in, data out, no surprises**. `Rater` owns
> the engine and an ordered `ProgramManager` (AGENTS §9) and performs NO evaluation
> arithmetic of its own — it orchestrates compiled `Program`s and projects their
> results into the rating domain vocabulary (`Eligibility` → `Status` → `Decision`).
> `Program` is engine-INJECTED and never owns, destroys, or otherwise mutates the
> shared engine. Batch rating (`rate` over an array of subjects) additionally supports
> an `AggregateDefinition` per program — summed fields, an optional partition `by` key,
> and optional `gates` (a logical definition run over the batch/partition sums) — for
> cross-subject aggregate determinations and per-`Status` tallies. Every applied
> determination and derived decision fires through `Rater`'s typed `emitter` (AGENTS
> §13). Source: [`src/core`](../../src/core). Surfaced through the `@src/core` barrel.

## Surface

Create a rater, add a program, rate a subject or a batch:

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

rater.emitter.on('decide', (decision, program) => decision) // 'approved' | 'denied' | 'submitted'

rater.destroy()
```

`rate` dispatches by input shape — the ARRAY overload is declared FIRST (AGENTS §9.2)
so a subject list resolves to the batch `AggregateResult` form; a single subject
resolves to `SubjectResult`. Every applied determination and derived decision fires
through `rater.emitter` (`rate` / `aggregate` / `determine` / `decide`), whether rated
one at a time or in a batch.

### Types

| Type                      | Kind      | Shape                                                                                                                                                           |
| ------------------------- | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Eligibility`             | type      | `'eligible' \| 'ineligible' \| 'referral'` — the advisory eligibility axis a program or line outcome carries.                                                   |
| `Decision`                | type      | `'approved' \| 'denied' \| 'submitted'` — the deterministic authority decision derived from eligibility.                                                        |
| `Status`                  | type      | `'ineligible' \| 'referral' \| 'conditional' \| 'unrated' \| 'eligible'` — derived from eligibility, conditions, and rating success.                            |
| `Effect`                  | type      | `'restriction' \| 'referral' \| 'condition' \| 'notice' \| 'limit'` — a resolved determination effect.                                                          |
| `Stage`                   | type      | `'factor' \| 'group' \| 'total'` — a worksheet derivation step stage.                                                                                           |
| `RaterErrorCode`          | type      | `'DUPLICATE' \| 'MISSING' \| 'DEFINITION' \| 'MISMATCH' \| 'DESTROYED'` — a coded `RaterError` programmer-error code.                                           |
| `TotalHandler`            | type      | `(lines: readonly LineResult[]) => number \| undefined` — a pure total port over resolved lines.                                                                |
| `LineDefinition`          | interface | `{ id, name, description?, rate, metadata? }` — a rateable quantitative definition joined to display metadata.                                                  |
| `PassDefinition`          | interface | `{ line?, definition }` — an ordered pre-rating pass over the working subject; `line` scopes a logical pass's determinations.                                   |
| `Ruling`                  | interface | `{ effect, line?, message? }` — an authored consequence routed to a fired rule by its id.                                                                       |
| `Notice`                  | interface | `{ id, message, line? }` — an authored informational determination emitted unconditionally.                                                                     |
| `AggregateDefinition`     | interface | `{ fields, by?, gates? }` — batch aggregate fields, an optional partition key, and optional gates.                                                              |
| `ProgramDefinition`       | interface | `{ id, name, description?, passes?, lines, rulings?, notices?, authority?, aggregate?, metadata? }` — a pure authored program.                                  |
| `ProgramOptions`          | interface | `{ total?, labels? }` — runtime options for one compiled program.                                                                                               |
| `Premise`                 | interface | `{ field?, label?, description?, comparison?, expected?, actual?, met? }` — a shared checked-evidence row rendered display-neutral.                             |
| `Determination`           | interface | `{ id, effect, applied, line?, message?, premises }` — a resolved rule, authority, or notice outcome.                                                           |
| `WorksheetFactor`         | interface | `{ id, name?, description?, applied, value?, premises }` — a resolved quantitative factor joined to its authored metadata.                                      |
| `WorksheetGroup`          | interface | `{ id, name?, description?, applied, value, factors }` — a resolved quantitative group joined to its authored metadata.                                         |
| `Step`                    | interface | `{ stage, id?, name?, value, expression? }` — a display-neutral worksheet derivation step.                                                                      |
| `Worksheet`               | interface | `{ id, name, aggregation, precision?, value, groups, steps, trace, errors, success }` — a quantitative definition joined to its result, the rating audit trail. |
| `LineResult`              | interface | `{ id, name, eligibility, amount?, worksheet?, determinations }` — one line's rating outcome.                                                                   |
| `ProgramResult`           | interface | `{ id, name, eligibility, status, decision?, lines, determinations, derivations, total?, success, trace, errors }` — one program's rating outcome.              |
| `SubjectResult`           | interface | `{ subject, programs }` — one rated subject's outcome across every compiled program.                                                                            |
| `AggregateGroup`          | interface | `{ key, count, sums }` — one batch aggregate partition.                                                                                                         |
| `Tally`                   | interface | `{ count, sums }` — a status tally for one program: a count plus summed aggregate fields.                                                                       |
| `AggregateResult`         | interface | `{ subjects, determinations, groups, tallies, count, sums }` — a batch rating outcome across every subject.                                                     |
| `RaterEventMap`           | type      | `Rater`'s push observation surface (AGENTS §13) — `rate(result)` · `aggregate(result)` · `determine(determination)` · `decide(decision, result)`.               |
| `RaterOptions`            | interface | `{ on?, error?, total?, programs?, labels?, validate? }` — input to `createRater`.                                                                              |
| `RaterInterface`          | interface | The rating orchestrator — `emitter` + `programs` + `rate` (batch overload declared FIRST) + `destroy`.                                                          |
| `ProgramInterface`        | interface | A compiled program — `id` / `name` / `definition` + `rate`.                                                                                                     |
| `ProgramManagerEventMap`  | type      | `ProgramManager`'s push observation surface (AGENTS §13) — `add(id)` · `remove(id)` · `destroy()`.                                                              |
| `ProgramManagerOptions`   | interface | `{ on?, error?, total?, labels?, validate? }` — input to `createProgramManager` / the `ProgramManager` constructor.                                             |
| `ProgramManagerInterface` | interface | An ordered manager over compiled programs (AGENTS §9) — `emitter` / `size` + `has` / `program` / `programs` / `add` / `remove` / `destroy`.                     |

### Constants

| API                      | Kind  | Summary                                                                                            |
| ------------------------ | ----- | -------------------------------------------------------------------------------------------------- |
| `DEFAULT_RATER_VALIDATE` | const | `true` — default definition validation policy for `ProgramManager.add`.                            |
| `ELIGIBILITY_PRECEDENCE` | const | Eligibility severity order, most severe first — the `combineEligibilities` scan order.             |
| `STATUS_PRECEDENCE`      | const | Status tally precedence order, least to most resolved.                                             |
| `ELIGIBILITY_DECISIONS`  | const | The deterministic authority decision for each eligibility.                                         |
| `EFFECT_ELIGIBILITIES`   | const | The direct eligibility impact of an applied determination, by its effect.                          |
| `AGGREGATE_KEY`          | const | `'aggregate'` — the reserved working-subject key a batch's aggregate projection is written under.  |
| `OUTCOME_KEY`            | const | `'outcome'` — the reserved working-subject key an authority's outcome projection is written under. |

```ts
import {
	AGGREGATE_KEY,
	DEFAULT_RATER_VALIDATE,
	EFFECT_ELIGIBILITIES,
	ELIGIBILITY_DECISIONS,
	ELIGIBILITY_PRECEDENCE,
	OUTCOME_KEY,
	STATUS_PRECEDENCE,
} from '@orkestrel/rater'

DEFAULT_RATER_VALIDATE // true
ELIGIBILITY_PRECEDENCE // ['ineligible', 'referral', 'eligible']
STATUS_PRECEDENCE // ['ineligible', 'referral', 'conditional', 'unrated', 'eligible']
ELIGIBILITY_DECISIONS.eligible // 'approved'
EFFECT_ELIGIBILITIES.restriction // 'ineligible'
AGGREGATE_KEY // 'aggregate'
OUTCOME_KEY // 'outcome'
```

### Errors

| API            | Kind     | Summary                                                                                                              |
| -------------- | -------- | -------------------------------------------------------------------------------------------------------------------- |
| `RaterError`   | class    | Carries a `RaterErrorCode` (`DUPLICATE` / `MISSING` / `DEFINITION` / `MISMATCH` / `DESTROYED`) + optional `context`. |
| `isRaterError` | function | Narrow a caught value to a `RaterError`.                                                                             |

```ts
import { isRaterError, RaterError } from '@orkestrel/rater'

try {
	throw new RaterError('DESTROYED', 'Rater has been destroyed')
} catch (error) {
	if (isRaterError(error)) error.code // 'DESTROYED'
}
```

### Validators

Total guards (AGENTS §14) composed from `@orkestrel/contract` combinators — adversarial
input (junk, cycles, hostile prototypes) returns `false`, never throws. Record guards
are **exact**: an extra key fails.

| API                     | Kind     | Narrows to                                                          |
| ----------------------- | -------- | ------------------------------------------------------------------- |
| `isEligibility`         | const    | `Eligibility`.                                                      |
| `isDecision`            | const    | `Decision`.                                                         |
| `isStatus`              | const    | `Status`.                                                           |
| `isEffect`              | const    | `Effect`.                                                           |
| `isStage`               | const    | `Stage`.                                                            |
| `isRuling`              | function | `Ruling`.                                                           |
| `isNotice`              | function | `Notice`.                                                           |
| `isPassDefinition`      | function | `PassDefinition`.                                                   |
| `isLineDefinition`      | function | `LineDefinition`.                                                   |
| `isAggregateDefinition` | function | `AggregateDefinition`.                                              |
| `isRulings`             | const    | `Readonly<Record<string, Ruling>>` — a rule-id-keyed ruling record. |
| `isProgramDefinition`   | function | `ProgramDefinition`.                                                |

```ts
import {
	isAggregateDefinition,
	isDecision,
	isEffect,
	isEligibility,
	isLineDefinition,
	isNotice,
	isPassDefinition,
	isProgramDefinition,
	isRulings,
	isRuling,
	isStage,
	isStatus,
} from '@orkestrel/rater'
import { quantitativeDefinition } from '@orkestrel/reason'

isEligibility('eligible') // true
isDecision('approved') // true
isStatus('unrated') // true
isEffect('restriction') // true
isStage('group') // true
isRuling({ effect: 'restriction' }) // true
isNotice({ id: 'n1', message: 'Rated' }) // true
isPassDefinition({ definition: quantitativeDefinition('surcharge', 'Surcharge', []) }) // true
isLineDefinition({
	id: 'base',
	name: 'Base Amount',
	rate: quantitativeDefinition('base', 'Base', []),
}) // true
isAggregateDefinition({ fields: ['amount'] }) // true
isRulings({ r1: { effect: 'restriction' } }) // true
isProgramDefinition({ id: 'p1', name: 'Program', lines: [] }) // true
```

### Helpers

Pure, exported utility functions (AGENTS §4.3) — the display-neutral projection,
determination-assembly, eligibility/status derivation, and aggregate arithmetic behind
`Program` and `Rater`.

| API                              | Kind     | Summary                                                                                                                   |
| -------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------- |
| `interpolateMessage`             | function | Interpolate `{{dotted.path}}` tokens in a message template against a record.                                              |
| `describeComparison`             | function | Describe a `Premise` comparison as a display-neutral verb phrase.                                                         |
| `describePremise`                | function | Render one `Premise` into a display-neutral sentence.                                                                     |
| `premiseCheck`                   | function | Build a `Premise` from an evaluated `Check`.                                                                              |
| `checkPremises`                  | function | Build premises from a quantitative factor's authored checks and evaluated check results.                                  |
| `describeExpression`             | function | Describe a logical `Expression` tree without atom-specific evidence.                                                      |
| `logicalPremises`                | function | Build rich premises for one fired `Rule` by walking its premise atoms and re-evaluating each against the working subject. |
| `findRule`                       | function | Locate an authored `Rule` by id.                                                                                          |
| `worksheetFactor`                | function | Join one authored quantitative factor to its evaluated `FactorResult`.                                                    |
| `worksheetGroup`                 | function | Join one authored quantitative group to its evaluated `GroupResult`.                                                      |
| `worksheetStep`                  | function | Build one display-neutral `Step` row.                                                                                     |
| `worksheetSteps`                 | function | Build the ordered `Step` rows for a resolved `Worksheet`.                                                                 |
| `resultsWorksheet`               | function | Join a `QuantitativeDefinition` and its `QuantitativeResult` into a `Worksheet` — the rating audit trail.                 |
| `rulesToDeterminations`          | function | Convert fired logical `RuleResult`s into line- or program-scoped `Determination`s.                                        |
| `authorityToDeterminations`      | function | Convert an authority's fired `RuleResult`s into `limit` `Determination`s.                                                 |
| `noticesToDeterminations`        | function | Convert authored `Notice`s into unconditionally-applied `notice` `Determination`s.                                        |
| `filterLineDeterminations`       | function | Keep only the determinations scoped to one line.                                                                          |
| `filterProgramDeterminations`    | function | Keep only program-scoped (line-unscoped) determinations.                                                                  |
| `deriveDeterminationEligibility` | function | Derive the eligibility impact of a set of determinations.                                                                 |
| `combineEligibilities`           | function | Return the most severe `Eligibility` in a list.                                                                           |
| `decideEligibility`              | function | Convert an `Eligibility` to its deterministic authority `Decision`.                                                       |
| `deriveStatus`                   | function | Derive the final `Status` from eligibility, determinations, and rated line evidence.                                      |
| `ratedLine`                      | function | Build a rated `LineResult` from a line's evaluated `QuantitativeResult`.                                                  |
| `sumAmounts`                     | function | Sum defined line amounts.                                                                                                 |
| `outcomeProjection`              | function | Build an authority outcome projection from an assembled `ProgramResult`.                                                  |
| `programResult`                  | function | Assemble a final `ProgramResult` from its rated parts.                                                                    |
| `findMissingLineReferences`      | function | Return authored line references (in passes, rulings, or notices) that name no line on the program.                        |
| `hasReservedKey`                 | function | Determine whether a working record already carries a reserved rater key.                                                  |
| `assertSubject`                  | function | Assert a value is a valid rater `Subject`, narrowing it in place.                                                         |
| `aggregateSums`                  | function | Sum aggregate fields across a batch of subjects.                                                                          |
| `aggregateGroups`                | function | Partition a batch of subjects by a field, summing aggregate fields per partition.                                         |
| `aggregateProjection`            | function | Build the batch aggregate working projection written under `AGGREGATE_KEY`'s value.                                       |
| `aggregateRecord`                | function | Build the reserved-key record an aggregate gate definition runs against.                                                  |
| `emptySums`                      | function | Build zero sums for a set of fields.                                                                                      |
| `completeTallies`                | function | Complete a partial status tally record with zero entries for every missing `Status`.                                      |
| `emptyTallies`                   | function | Build empty status tallies in precedence order.                                                                           |
| `tallySubject`                   | function | Add one subject's aggregate contribution to a status tally record.                                                        |

```ts
import {
	combineEligibilities,
	deriveDeterminationEligibility,
	describeComparison,
	describePremise,
	interpolateMessage,
} from '@orkestrel/rater'

interpolateMessage('Limit is {{limit}}', { limit: 5010 }) // 'Limit is 5,010'
describeComparison('above') // 'is more than'
describePremise({ field: 'age', comparison: 'above', expected: 18, actual: 25, met: true })
deriveDeterminationEligibility([{ id: 'r1', effect: 'restriction', applied: true, premises: [] }]) // 'ineligible'
combineEligibilities(['eligible', 'referral']) // 'referral'
```

Worksheet joining — one authored quantitative definition and its evaluated result,
walked into the display-neutral `Worksheet` audit trail:

```ts
import {
	resultsWorksheet,
	worksheetFactor,
	worksheetGroup,
	worksheetStep,
	worksheetSteps,
} from '@orkestrel/rater'
import {
	createQuantitativeReasoner,
	createReason,
	factorGroup,
	fieldFactor,
	quantitativeDefinition,
} from '@orkestrel/reason'

const definition = quantitativeDefinition('risk', 'Risk', [
	factorGroup('drivers', 'sum', [fieldFactor('age', 'age')]),
])
const engine = createReason({ reasoners: [createQuantitativeReasoner()] })
const result = engine.reason({ age: 25 }, definition)

if (result.reasoning === 'quantitative') {
	const group = definition.groups[0]
	const groupResult = result.groups[0]
	if (group !== undefined && groupResult !== undefined) {
		const factor = group.factors[0]
		if (factor !== undefined) worksheetFactor(factor, groupResult.factors) // one factor joined to its result
		worksheetGroup(group, result.groups) // one group joined to its result
	}
	worksheetStep('total', definition.id, definition.name, result.value, `sum = ${result.value}`)
	worksheetSteps(definition, result, []) // the full ordered step list: factors, groups, then the total
	resultsWorksheet(definition, result) // the whole worksheet — groups, steps, trace, errors, success
}
```

Determination assembly — converting fired logical rules and authored notices into
`Determination`s, with rich re-evaluated premises:

```ts
import {
	authorityToDeterminations,
	checkPremises,
	describeExpression,
	filterLineDeterminations,
	filterProgramDeterminations,
	findRule,
	logicalPremises,
	noticesToDeterminations,
	premiseCheck,
	rulesToDeterminations,
} from '@orkestrel/rater'
import {
	atom,
	check,
	createEvaluator,
	createLogicalReasoner,
	createReason,
	logicalDefinition,
	rule,
} from '@orkestrel/reason'

const gate = logicalDefinition('gate', [rule('over', [atom(check('age', 'above', 18))])])
const evaluator = createEvaluator()
const engine = createReason({ reasoners: [createLogicalReasoner()] })
const working = { age: 25 }
const result = engine.reason(working, gate)

if (result.reasoning === 'logical') {
	rulesToDeterminations(gate, result, undefined, working, 'base', evaluator) // line-scoped determinations
	authorityToDeterminations(gate, result, undefined, working, evaluator) // authority `limit` determinations
}
noticesToDeterminations([{ id: 'n1', message: 'Rated on {{date}}' }], working)
filterLineDeterminations([], 'base')
filterProgramDeterminations([])

const authored = findRule(gate, 'over')
if (authored !== undefined) {
	logicalPremises(authored, working, evaluator)
	describeExpression(authored.premises[0] ?? atom(check('age', 'above', 18)))
}
const evaluated = check('age', 'above', 18)
premiseCheck(evaluated, 25, true)
checkPremises([evaluated], [{ field: 'age', met: true, actual: 25 }])
```

Eligibility, status, and final program assembly — `decideEligibility` and
`deriveStatus` derive the domain vocabulary; `ratedLine`, `outcomeProjection`, and
`programResult` assemble the final results (see `Program`'s `rate` orchestration for
the full worked sequence); `sumAmounts` and `findMissingLineReferences` are the
supporting checks:

```ts
import {
	decideEligibility,
	deriveStatus,
	findMissingLineReferences,
	outcomeProjection,
	programResult,
	ratedLine,
	sumAmounts,
} from '@orkestrel/rater'

decideEligibility('referral') // 'submitted'
deriveStatus('eligible', [], []) // 'eligible' — nothing applied, every line already checked
sumAmounts([]) // undefined — no line carries an amount
findMissingLineReferences({ id: 'p1', name: 'Program', lines: [] }) // [] — every reference resolves
// ratedLine, outcomeProjection, and programResult assemble a ProgramResult's parts —
// see Program.ts's `rate` method for the full end-to-end orchestration.
```

Subject validation and aggregate arithmetic — the batch rating support behind
`Rater`'s array `rate` overload:

```ts
import {
	aggregateGroups,
	aggregateProjection,
	aggregateRecord,
	aggregateSums,
	assertSubject,
	completeTallies,
	emptySums,
	emptyTallies,
	hasReservedKey,
	tallySubject,
} from '@orkestrel/rater'

const subjects = [
	{ id: 'a', amount: 10 },
	{ id: 'b', amount: 20 },
]
aggregateSums(subjects, ['amount']) // { amount: 30 }
aggregateGroups(subjects, ['amount'], 'id') // one partition per distinct subject id
aggregateProjection(2, { amount: 30 }) // { count: 2, sums: { amount: 30 } }
aggregateRecord(2, { amount: 30 }) // { aggregate: { count: 2, sums: { amount: 30 } } }
emptySums(['amount']) // { amount: 0 }
const tallies = emptyTallies(['amount']) // every Status zeroed
completeTallies({ eligible: { count: 1, sums: {} } }) // the other four statuses filled with zeros
const subject = subjects[0]
if (subject !== undefined) tallySubject(tallies, 'eligible', subject, ['amount'])
hasReservedKey({ aggregate: {} }) // true — the reserved `aggregate` key is already present
assertSubject({ id: 'a' }) // throws RaterError('MISMATCH') when not a record or reserved-key
```

### Factories

| API                   | Kind     | Builds…                                                                               |
| --------------------- | -------- | ------------------------------------------------------------------------------------- |
| `createRater`         | function | A `RaterInterface` — the rating orchestrator, seeded from `RaterOptions`.             |
| `createProgram`       | function | A compiled `ProgramInterface`, validated, over an injected reasoning engine.          |
| `programDefinition`   | function | A `ProgramDefinition` from id / name / lines (`overrides` merged over the defaults).  |
| `lineDefinition`      | function | A `LineDefinition` from id / name / rate (`overrides` merged over the defaults).      |
| `passDefinition`      | function | A `PassDefinition` from a logical or quantitative definition, optionally line-scoped. |
| `rulingDefinition`    | function | A `Ruling` from effect, optional line scope, and optional message template.           |
| `noticeDefinition`    | function | A `Notice` from id / message, optionally line-scoped.                                 |
| `aggregateDefinition` | function | An `AggregateDefinition` from fields, optional partition key, and optional gates.     |

Every factory returns a fresh object and omits absent optional keys entirely.

```ts
import {
	createLogicalReasoner,
	createQuantitativeReasoner,
	createReason,
	quantitativeDefinition,
} from '@orkestrel/reason'
import {
	aggregateDefinition,
	createProgram,
	createRater,
	lineDefinition,
	noticeDefinition,
	passDefinition,
	programDefinition,
	rulingDefinition,
} from '@orkestrel/rater'

const rater = createRater()
rater.destroy()

const engine = createReason({
	reasoners: [createQuantitativeReasoner(), createLogicalReasoner()],
	bail: false,
})
const program = createProgram(programDefinition('p1', 'Program', []), engine)

lineDefinition('base', 'Base Amount', quantitativeDefinition('base', 'Base', []))
passDefinition(quantitativeDefinition('surcharge', 'Surcharge', []))
rulingDefinition('restriction', 'base', 'Amount exceeds {{limit}}')
noticeDefinition('n1', 'Rated on {{date}}')
aggregateDefinition(['amount'])
```

### Entities

| API              | Kind  | Summary                                                                                                                                         |
| ---------------- | ----- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `Rater`          | class | The rating orchestrator — owns the shared reasoning engine and an ordered `ProgramManager`; projects results into the rating domain vocabulary. |
| `Program`        | class | A compiled program — rates one subject at a time over an injected, shared reasoning engine.                                                     |
| `ProgramManager` | class | An ordered manager over compiled `ProgramInterface`s (AGENTS §9), built over an injected, shared reasoning engine.                              |

## Methods

The public methods of each behavioral interface — one table per type, keyed by its
backticked name, every call-signature member listed (the `readonly` data members —
`emitter` on `Rater` and `ProgramManager`; `programs` on `Rater`; `id` / `name` /
`definition` on `Program`; `size` on `ProgramManager` — stay off the method tables).
Each implementing class (`Rater`, `Program`, `ProgramManager`) exposes exactly its
interface's methods, so this doubles as the per-instance method surface (AGENTS §22).

#### `RaterInterface`

The array overload of `rate` is declared FIRST (AGENTS §9.2) so a subject list resolves
to the batch form. `destroy()` tears down the program manager, then the shared engine,
then the emitter LAST (AGENTS §13); afterwards every other method throws `RaterError`
`'DESTROYED'`.

| Method    | Returns                                | Behavior                                                                                    |
| --------- | -------------------------------------- | ------------------------------------------------------------------------------------------- |
| `rate`    | `AggregateResult` (or `SubjectResult`) | Rate an ARRAY of subjects as one batch — or rate ONE subject — over every compiled program. |
| `destroy` | `void`                                 | Idempotent teardown — the manager, then the engine, then the emitter LAST.                  |

```ts
import { createRater } from '@orkestrel/rater'

const rater = createRater()
rater.rate([{ id: 'a' }, { id: 'b' }]) // ARRAY first — the batch AggregateResult overload
rater.rate({ id: 'a' }) // ONE subject — the SubjectResult overload
rater.destroy()
```

#### `ProgramInterface`

`rate` builds its working subject through copy-on-write overlays only — the caller's
`subject` is never mutated. `aggregate` is the caller-supplied batch aggregate
projection for this program, when rated as part of a batch.

| Method | Returns         | Behavior                                                                                                   |
| ------ | --------------- | ---------------------------------------------------------------------------------------------------------- |
| `rate` | `ProgramResult` | Rate one subject: run passes, rate lines, assemble determinations and worksheets, then the authority gate. |

```ts
import { createLogicalReasoner, createQuantitativeReasoner, createReason } from '@orkestrel/reason'
import { createProgram, programDefinition } from '@orkestrel/rater'

const engine = createReason({
	reasoners: [createQuantitativeReasoner(), createLogicalReasoner()],
	bail: false,
})
const program = createProgram(programDefinition('p1', 'Program', []), engine)
program.rate({ id: 'subject-1' }) // one ProgramResult
```

#### `ProgramManagerInterface`

The self-owning, ordered manager over compiled programs (AGENTS §9). `add` validates
(when the manager's `validate` policy is on) and throws `RaterError` `'DUPLICATE'` on
an id collision, or `'DEFINITION'` on a failed `isProgramDefinition` check. A call
after `destroy()` throws `RaterError` `'DESTROYED'`.

| Method     | Returns                         | Behavior                                                                                                                                |
| ---------- | ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `has`      | `boolean`                       | Whether a program with the given id is compiled.                                                                                        |
| `program`  | `ProgramInterface \| undefined` | Look up ONE compiled program by id (the AGENTS §9.1 singular accessor).                                                                 |
| `programs` | `readonly ProgramInterface[]`   | List ALL compiled programs in order (the AGENTS §9.1 plural accessor).                                                                  |
| `add`      | `ProgramInterface`              | Compile and add one program from its definition; emits `add`.                                                                           |
| `remove`   | `boolean` (or `void`)           | Remove LISTED programs by id, ONE program by id, or ALL programs — the AGENTS §9.2 batch overload shape; emits `remove` per removed id. |
| `destroy`  | `void`                          | Idempotent teardown — clears the collection, emits `destroy`, then destroys the emitter LAST.                                           |

```ts
import { createRater, programDefinition } from '@orkestrel/rater'

const rater = createRater()
rater.programs.add(programDefinition('p1', 'Program', []))
rater.programs.has('p1') // true
rater.programs.program('p1') // the compiled ProgramInterface, or undefined
rater.programs.programs() // every compiled program, in order
rater.programs.remove('p1') // true — removed one program
rater.programs.remove() // remove ALL remaining programs
rater.programs.destroy()
```
