import type { FieldPath, JSONValue } from '@orkestrel/contract'
import type { EmitterErrorHandler, EmitterHooks, EmitterInterface } from '@orkestrel/emitter'
import type {
	Aggregation,
	Comparison,
	QuantitativeDefinition,
	ReasonInterface,
	Subject,
} from '@orkestrel/reason'

/** A worksheet derivation step stage. */
export type Stage = 'factor' | 'group' | 'total'

/** A coded {@link RaterError} programmer-error code. */
export type RaterErrorCode = 'DEFINITION' | 'MISMATCH' | 'DESTROYED'

/** A pure total port over resolved lines. */
export type TotalHandler = (lines: readonly LineResult[]) => number | undefined

/**
 * One rateable line — a quantitative definition joined to display metadata.
 *
 * @remarks
 * `rate` is a plain reason {@link QuantitativeDefinition}; Rater delegates every
 * actual evaluation of it to the shared engine.
 */
export interface LineDefinition {
	readonly id: string
	readonly name: string
	readonly description?: string
	readonly rate: QuantitativeDefinition
	readonly metadata?: JSONValue
}

/**
 * A pure authored rating — a named, ordered set of lines.
 *
 * @remarks
 * `rate` accepts either a plain `readonly LineDefinition[]` or a full
 * `RatingDefinition`; the array overload is the terse path, this shape adds
 * an id, a name, and optional metadata for authoring and storage.
 */
export interface RatingDefinition {
	readonly id: string
	readonly name: string
	readonly description?: string
	readonly lines: readonly LineDefinition[]
	readonly metadata?: JSONValue
}

/** A checked-evidence row rendered into a display-neutral sentence. */
export interface Evidence {
	readonly field?: FieldPath
	readonly label?: string
	readonly comparison?: Comparison
	readonly expected?: unknown
	readonly actual?: unknown
	readonly met?: boolean
}

/** A resolved quantitative factor, joined to its authored metadata. */
export interface WorksheetFactor {
	readonly id: string
	readonly name?: string
	readonly description?: string
	readonly applied: boolean
	readonly value?: number
	readonly evidence: readonly Evidence[]
}

/** A resolved quantitative group, joined to its authored metadata. */
export interface WorksheetGroup {
	readonly id: string
	readonly name?: string
	readonly description?: string
	readonly applied: boolean
	readonly value: number
	readonly factors: readonly WorksheetFactor[]
}

/** A display-neutral worksheet derivation step. */
export interface Step {
	readonly stage: Stage
	readonly id?: string
	readonly name?: string
	readonly value: number
	readonly expression?: string
}

/** A quantitative definition joined to its result — the rating audit trail. */
export interface Worksheet {
	readonly id: string
	readonly name: string
	readonly aggregation: Aggregation
	readonly precision?: number
	readonly value: number
	readonly groups: readonly WorksheetGroup[]
	readonly steps: readonly Step[]
	readonly trace: readonly string[]
	readonly errors: readonly string[]
	readonly success: boolean
}

/**
 * One line's rating outcome.
 *
 * @remarks
 * `worksheet` is always present — even a failed evaluation resolves to a
 * type-shaped failure worksheet, so a `LineResult` is always constructible.
 * `amount` is present ONLY when `success` is `true`.
 */
export interface LineResult {
	readonly id: string
	readonly name: string
	readonly amount?: number
	readonly worksheet: Worksheet
	readonly success: boolean
}

/**
 * A rated outcome across every line of one `rate` call.
 *
 * @remarks
 * `total` is derived by the {@link TotalHandler} (default {@link sumAmounts})
 * over `lines` — only successfully rated lines carry an `amount`. `success`
 * is `true` only when every line succeeded.
 */
export interface RatingResult {
	readonly lines: readonly LineResult[]
	readonly total?: number
	readonly success: boolean
}

/**
 * The push observation surface of a {@link RaterInterface}.
 *
 * @remarks
 * `rate` fires once per `rate` call, carrying the rated subject and the result.
 */
export type RaterEventMap = {
	/** A subject was rated — carries the subject and its result. */
	readonly rate: readonly [subject: Subject, result: RatingResult]
}

/**
 * Options for `createRater` / the `Rater` constructor.
 *
 * @remarks
 * `engine` — an injected {@link ReasonInterface}; when omitted, `Rater` builds
 * and OWNS its own quantitative-only engine (`bail: false`), destroying it on
 * `destroy()`. `total` — a {@link TotalHandler} overriding the default
 * {@link sumAmounts} projection. `labels` — field-to-label display overrides
 * threaded into every resolved {@link Evidence}.
 */
export interface RaterOptions {
	readonly on?: EmitterHooks<RaterEventMap>
	readonly error?: EmitterErrorHandler
	readonly engine?: ReasonInterface
	readonly total?: TotalHandler
	readonly labels?: Readonly<Record<string, string>>
}

/**
 * The rating orchestrator over the shared quantitative reasoning engine.
 *
 * @remarks
 * The array-of-lines `rate` overload is declared FIRST so a plain line list
 * resolves to that form. Both overloads rate a SINGLE subject — there is no
 * batch-of-subjects overload.
 */
export interface RaterInterface {
	readonly emitter: EmitterInterface<RaterEventMap>
	rate(lines: readonly LineDefinition[], subject: Subject): RatingResult
	rate(definition: RatingDefinition, subject: Subject): RatingResult
	destroy(): void
}
