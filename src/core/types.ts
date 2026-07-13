import type { JSONValue } from '../contracts/index.js'
import type { FieldPath } from '../types.js'
import type { EmitterErrorHandler, EmitterHooks, EmitterInterface } from '../emitters/index.js'
import type {
	Aggregation,
	Comparison,
	LogicalDefinition,
	QuantitativeDefinition,
	Subject,
} from '../reasons/index.js'

/** Advisory eligibility axis used by line and program outcomes. */
export type Eligibility = 'eligible' | 'ineligible' | 'referral'

/** Deterministic authority decision derived from eligibility. */
export type Decision = 'approved' | 'denied' | 'submitted'

/** Presentation and tally status derived from eligibility, conditions, and rating success. */
export type Status = 'ineligible' | 'referral' | 'conditional' | 'unrated' | 'eligible'

/** A resolved determination effect. */
export type Effect = 'restriction' | 'referral' | 'condition' | 'notice' | 'limit'

/** A worksheet derivation step stage. */
export type Stage = 'factor' | 'group' | 'total'

/** A pure total port over resolved lines. */
export type TotalHandler = (lines: readonly LineResult[]) => number | undefined

/** Runtime options for one compiled program. */
export interface ProgramOptions {
	readonly total?: TotalHandler
	readonly labels?: Readonly<Record<string, string>>
}

/** Pure authored program definition. */
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

/** One rateable line. */
export interface LineDefinition {
	readonly id: string
	readonly name: string
	readonly description?: string
	readonly rate: QuantitativeDefinition
	readonly metadata?: JSONValue
}

/** Ordered pre-rating pass over the working record. */
export interface PassDefinition {
	readonly line?: string
	readonly definition: LogicalDefinition | QuantitativeDefinition
}

/** Authored consequence routed by rule id. */
export interface Ruling {
	readonly effect: Effect
	readonly line?: string
	readonly message?: string
}

/** Authored informational determination. */
export interface Notice {
	readonly id: string
	readonly message: string
	readonly line?: string
}

/** Batch aggregate fields, optional partition, and optional gates. */
export interface AggregateDefinition {
	readonly fields: readonly FieldPath[]
	readonly by?: FieldPath
	readonly gates?: LogicalDefinition
}

/** Shared checked evidence row. */
export interface Premise {
	readonly field?: FieldPath
	readonly label?: string
	readonly description?: string
	readonly comparison?: Comparison
	readonly expected?: unknown
	readonly actual?: unknown
	readonly met?: boolean
}

/** Resolved rule or notice result. */
export interface Determination {
	readonly id: string
	readonly effect: Effect
	readonly applied: boolean
	readonly line?: string
	readonly message?: string
	readonly premises: readonly Premise[]
}

/** Quantitative definition joined to its result. */
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

/** Resolved quantitative group. */
export interface WorksheetGroup {
	readonly id: string
	readonly name?: string
	readonly description?: string
	readonly applied: boolean
	readonly value: number
	readonly factors: readonly WorksheetFactor[]
}

/** Resolved quantitative factor. */
export interface WorksheetFactor {
	readonly id: string
	readonly name?: string
	readonly description?: string
	readonly applied: boolean
	readonly value?: number
	readonly premises: readonly Premise[]
}

/** Display-neutral worksheet step. */
export interface Step {
	readonly stage: Stage
	readonly id?: string
	readonly name?: string
	readonly value: number
	readonly expression?: string
}

/** One line outcome. */
export interface LineResult {
	readonly id: string
	readonly name: string
	readonly eligibility: Eligibility
	readonly amount?: number
	readonly worksheet?: Worksheet
	readonly determinations: readonly Determination[]
}

/** One program outcome. */
export interface ProgramResult {
	readonly id: string
	readonly name: string
	readonly eligibility: Eligibility
	readonly status: Status
	readonly decision?: Decision
	readonly lines: readonly LineResult[]
	readonly determinations: readonly Determination[]
	readonly derivations: readonly Worksheet[]
	readonly total?: number
	readonly success: boolean
	readonly trace: readonly string[]
	readonly errors: readonly string[]
}

/** One rated subject result. */
export interface SubjectResult {
	readonly subject: Subject
	readonly programs: readonly ProgramResult[]
}

/** Batch rating result. */
export interface AggregateResult {
	readonly subjects: readonly SubjectResult[]
	readonly determinations: readonly Determination[]
	readonly groups: readonly AggregateGroup[]
	readonly tallies: Readonly<Record<string, Readonly<Record<Status, Tally>>>>
	readonly count: number
	readonly sums: Readonly<Record<string, number>>
}

/** One aggregate partition. */
export interface AggregateGroup {
	readonly key: string
	readonly count: number
	readonly sums: Readonly<Record<string, number>>
}

/** Status tally for one program. */
export interface Tally {
	readonly count: number
	readonly sums: Readonly<Record<string, number>>
}

/** Event map emitted by a rater. */
export type RaterEventMap = {
	readonly rate: readonly [result: SubjectResult]
	readonly aggregate: readonly [result: AggregateResult]
	readonly determine: readonly [determination: Determination]
	readonly decide: readonly [decision: Decision, result: ProgramResult]
}

/** Rater creation options. */
export interface RaterOptions {
	readonly on?: EmitterHooks<RaterEventMap>
	readonly error?: EmitterErrorHandler
	readonly total?: TotalHandler
	readonly programs?: readonly ProgramDefinition[]
	readonly labels?: Readonly<Record<string, string>>
	readonly validate?: boolean
}

/** Coded caller misuse errors. */
export type RaterErrorCode = 'DUPLICATE' | 'MISSING' | 'DEFINITION' | 'MISMATCH'

/** Rater orchestrator contract. */
export interface RaterInterface {
	readonly emitter: EmitterInterface<RaterEventMap>
	readonly programs: ProgramManagerInterface
	rate(subjects: readonly Subject[]): AggregateResult
	rate(subject: Subject): SubjectResult
	destroy(): void
}

/** Compiled program contract. */
export interface ProgramInterface {
	readonly id: string
	readonly name: string
	readonly definition: ProgramDefinition
	rate(subject: Subject, aggregate?: Readonly<Record<string, unknown>>): ProgramResult
}

/** Ordered program manager contract. */
export interface ProgramManagerInterface {
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
