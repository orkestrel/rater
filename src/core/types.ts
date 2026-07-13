import type { FieldPath, JSONValue } from '@orkestrel/contract'
import type { EmitterErrorHandler, EmitterHooks, EmitterInterface } from '@orkestrel/emitter'
import type {
	Aggregation,
	Comparison,
	LogicalDefinition,
	QuantitativeDefinition,
	Subject,
} from '@orkestrel/reason'

/** Advisory eligibility axis a program or line outcome carries. */
export type Eligibility = 'eligible' | 'ineligible' | 'referral'

/** Deterministic authority decision derived from eligibility. */
export type Decision = 'approved' | 'denied' | 'submitted'

/** Presentation and tally status derived from eligibility, conditions, and rating success. */
export type Status = 'ineligible' | 'referral' | 'conditional' | 'unrated' | 'eligible'

/** A resolved determination effect. */
export type Effect = 'restriction' | 'referral' | 'condition' | 'notice' | 'limit'

/** A worksheet derivation step stage. */
export type Stage = 'factor' | 'group' | 'total'

/** A coded {@link RaterError} programmer-error code. */
export type RaterErrorCode = 'DUPLICATE' | 'MISSING' | 'DEFINITION' | 'MISMATCH' | 'DESTROYED'

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
 * An ordered pre-rating pass over the working subject.
 *
 * @remarks
 * `line` scopes a logical pass's determinations to one line; a quantitative pass
 * has no line scope (its value is assigned onto the working subject under its own
 * definition id).
 */
export interface PassDefinition {
	readonly line?: string
	readonly definition: LogicalDefinition | QuantitativeDefinition
}

/** An authored consequence routed to a fired rule by its id. */
export interface Ruling {
	readonly effect: Effect
	readonly line?: string
	readonly message?: string
}

/** An authored informational determination emitted unconditionally. */
export interface Notice {
	readonly id: string
	readonly message: string
	readonly line?: string
}

/** Batch aggregate fields, an optional partition key, and optional gates. */
export interface AggregateDefinition {
	readonly fields: readonly FieldPath[]
	readonly by?: FieldPath
	readonly gates?: LogicalDefinition
}

/**
 * A pure authored program definition.
 *
 * @remarks
 * `passes` runs in order before `lines`; `authority` (a logical definition) runs
 * over the assembled result, extended with an outcome projection, to derive limit
 * determinations and the final decision.
 */
export interface ProgramDefinition {
	readonly id: string
	readonly name: string
	readonly description?: string
	readonly passes?: readonly PassDefinition[]
	readonly lines: readonly LineDefinition[]
	readonly rulings?: Readonly<Record<string, Ruling>>
	readonly notices?: readonly Notice[]
	readonly authority?: LogicalDefinition
	readonly aggregate?: AggregateDefinition
	readonly metadata?: JSONValue
}

/** Runtime options for one compiled program. */
export interface ProgramOptions {
	readonly total?: TotalHandler
	readonly labels?: Readonly<Record<string, string>>
}

/** A shared checked-evidence row rendered into a display-neutral sentence. */
export interface Premise {
	readonly field?: FieldPath
	readonly label?: string
	readonly description?: string
	readonly comparison?: Comparison
	readonly expected?: unknown
	readonly actual?: unknown
	readonly met?: boolean
}

/**
 * A resolved rule, authority, or notice outcome.
 *
 * @remarks
 * `premises` lists only content-bearing premises — content-free atoms (an
 * empty `any`/`none` membership check) are omitted, so its length may be
 * smaller than the engine's boolean premise count.
 */
export interface Determination {
	readonly id: string
	readonly effect: Effect
	readonly applied: boolean
	readonly line?: string
	readonly message?: string
	readonly premises: readonly Premise[]
}

/** A resolved quantitative factor, joined to its authored metadata. */
export interface WorksheetFactor {
	readonly id: string
	readonly name?: string
	readonly description?: string
	readonly applied: boolean
	readonly value?: number
	readonly premises: readonly Premise[]
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

/** One line's rating outcome. */
export interface LineResult {
	readonly id: string
	readonly name: string
	readonly eligibility: Eligibility
	readonly amount?: number
	readonly worksheet?: Worksheet
	readonly determinations: readonly Determination[]
}

/** One program's rating outcome. */
export interface ProgramResult {
	readonly id: string
	readonly name: string
	readonly eligibility: Eligibility
	readonly status: Status
	/**
	 * @remarks
	 * Present ONLY when the program HAS an `authority`, the authority result is
	 * `logical`, NO `limit` determinations fired, and the authority result
	 * carries no errors — absent otherwise.
	 */
	readonly decision?: Decision
	readonly lines: readonly LineResult[]
	readonly determinations: readonly Determination[]
	readonly derivations: readonly Worksheet[]
	readonly total?: number
	readonly success: boolean
	readonly trace: readonly string[]
	readonly errors: readonly string[]
}

/** One rated subject's outcome across every compiled program. */
export interface SubjectResult {
	readonly subject: Subject
	readonly programs: readonly ProgramResult[]
}

/** One batch aggregate partition. */
export interface AggregateGroup {
	readonly key: string
	readonly count: number
	readonly sums: Readonly<Record<string, number>>
}

/** A status tally for one program — a count plus summed aggregate fields. */
export interface Tally {
	readonly count: number
	readonly sums: Readonly<Record<string, number>>
}

/** A batch rating outcome across every subject. */
export interface AggregateResult {
	readonly subjects: readonly SubjectResult[]
	readonly determinations: readonly Determination[]
	readonly groups: readonly AggregateGroup[]
	readonly tallies: Readonly<Record<string, Readonly<Record<Status, Tally>>>>
	readonly count: number
	readonly sums: Readonly<Record<string, number>>
}

/**
 * The push observation surface of a {@link RaterInterface} (AGENTS §13).
 *
 * @remarks
 * `rate` fires once per rated subject (batch or single); `aggregate` fires once
 * per batch call; `determine` fires per APPLIED determination; `decide` fires
 * once a program derives a decision.
 */
export type RaterEventMap = {
	/** A subject was rated — carries its result. */
	readonly rate: readonly [result: SubjectResult]
	/** A batch was rated — carries the aggregate result. */
	readonly aggregate: readonly [result: AggregateResult]
	/** An applied determination was produced — carries it. */
	readonly determine: readonly [determination: Determination]
	/** A program derived a decision — carries the decision and its result. */
	readonly decide: readonly [decision: Decision, result: ProgramResult]
}

/** Options for `createRater` / the `Rater` constructor. */
export interface RaterOptions {
	readonly on?: EmitterHooks<RaterEventMap>
	readonly error?: EmitterErrorHandler
	readonly total?: TotalHandler
	readonly programs?: readonly ProgramDefinition[]
	readonly labels?: Readonly<Record<string, string>>
	readonly validate?: boolean
}

/**
 * The rating orchestrator over the program manager and the shared reasoning
 * engine.
 *
 * @remarks
 * The batch `rate` overload is declared FIRST (AGENTS §9.2) so an array subject
 * resolves to the batch form.
 */
export interface RaterInterface {
	readonly emitter: EmitterInterface<RaterEventMap>
	readonly programs: ProgramManagerInterface
	rate(subjects: readonly Subject[]): AggregateResult
	rate(subject: Subject): SubjectResult
	destroy(): void
}

/**
 * A compiled program — engine-injected, rates one subject at a time against its
 * frozen definition.
 */
export interface ProgramInterface {
	readonly id: string
	readonly name: string
	readonly definition: ProgramDefinition
	rate(subject: Subject, aggregate?: Readonly<Record<string, unknown>>): ProgramResult
}

/**
 * The push observation surface of a {@link ProgramManagerInterface} (AGENTS §13).
 */
export type ProgramManagerEventMap = {
	/** A program was added — carries its id. */
	readonly add: readonly [id: string]
	/** A program was removed — carries its id. */
	readonly remove: readonly [id: string]
	/** The manager was destroyed. */
	readonly destroy: readonly []
}

/** Options for `createProgramManager` / the `ProgramManager` constructor. */
export interface ProgramManagerOptions {
	readonly on?: EmitterHooks<ProgramManagerEventMap>
	readonly error?: EmitterErrorHandler
	readonly total?: TotalHandler
	readonly labels?: Readonly<Record<string, string>>
	readonly validate?: boolean
}

/** An ordered manager over compiled programs (AGENTS §9). */
export interface ProgramManagerInterface {
	readonly emitter: EmitterInterface<ProgramManagerEventMap>
	readonly size: number
	has(id: string): boolean
	program(id: string): ProgramInterface | undefined
	programs(): readonly ProgramInterface[]
	add(definition: ProgramDefinition, options?: ProgramOptions): ProgramInterface
	remove(ids: readonly string[]): boolean
	remove(id: string): boolean
	remove(): void
	destroy(): void
}
