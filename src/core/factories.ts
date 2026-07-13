import type { FieldPath } from '@orkestrel/contract'
import type { LogicalDefinition, QuantitativeDefinition, ReasonInterface } from '@orkestrel/reason'
import type {
	AggregateDefinition,
	Effect,
	LineDefinition,
	Notice,
	PassDefinition,
	ProgramDefinition,
	ProgramInterface,
	ProgramManagerInterface,
	ProgramManagerOptions,
	ProgramOptions,
	RaterInterface,
	RaterOptions,
	Ruling,
} from './types.js'
import { isRecord } from '@orkestrel/contract'
import { Program } from './programs/Program.js'
import { ProgramManager } from './programs/ProgramManager.js'
import { Rater } from './Rater.js'
import { RaterError } from './errors.js'
import { isProgramDefinition } from './validators.js'

/**
 * Create a rating orchestrator.
 *
 * @param options - Optional total handler, seed programs, labels, validation policy, and emitter hooks
 * @returns A {@link RaterInterface}
 *
 * @example
 * ```ts
 * import { createRater } from '@orkestrel/rater'
 *
 * const rater = createRater()
 * rater.destroy()
 * ```
 */
export function createRater(options?: RaterOptions): RaterInterface {
	return new Rater(options)
}

/**
 * Create and validate one compiled program over a shared reasoning engine.
 *
 * @param definition - The authored program definition
 * @param reason - The shared reasoning engine, injected (never owned or destroyed by the program)
 * @param options - Optional total handler and labels
 * @returns A {@link ProgramInterface}
 * @throws {@link RaterError} `'DEFINITION'` when the definition fails {@link isProgramDefinition}
 *
 * @example
 * ```ts
 * import { createLogicalReasoner, createQuantitativeReasoner, createReason } from '@orkestrel/reason'
 * import { createProgram, programDefinition } from '@orkestrel/rater'
 *
 * const reason = createReason({ reasoners: [createQuantitativeReasoner(), createLogicalReasoner()], bail: false })
 * const program = createProgram(programDefinition('p1', 'Program', []), reason)
 * ```
 */
export function createProgram(
	definition: ProgramDefinition,
	reason: ReasonInterface,
	options?: ProgramOptions,
): ProgramInterface {
	const id = isRecord(definition) ? definition.id : undefined
	if (!isProgramDefinition(definition)) {
		throw new RaterError('DEFINITION', 'Program definition failed validation', { program: id })
	}
	return new Program(definition, reason, options)
}

/**
 * Create an ordered manager over compiled programs (AGENTS §9), built over an
 * injected, shared reasoning engine.
 *
 * @param reason - The shared reasoning engine, injected into every compiled program
 * @param options - Optional total handler, labels, validation policy, and emitter hooks
 * @returns A {@link ProgramManagerInterface}
 *
 * @example
 * ```ts
 * import { createLogicalReasoner, createQuantitativeReasoner, createReason } from '@orkestrel/reason'
 * import { createProgramManager, programDefinition } from '@orkestrel/rater'
 *
 * const reason = createReason({ reasoners: [createQuantitativeReasoner(), createLogicalReasoner()], bail: false })
 * const manager = createProgramManager(reason)
 * manager.add(programDefinition('p1', 'Program', []))
 * manager.destroy()
 * ```
 */
export function createProgramManager(
	reason: ReasonInterface,
	options?: ProgramManagerOptions,
): ProgramManagerInterface {
	return new ProgramManager(reason, options)
}

/**
 * Build a {@link ProgramDefinition}.
 *
 * @param id - The program id
 * @param name - The display name
 * @param lines - The program's rateable lines
 * @param overrides - Optional {@link ProgramDefinition} fields merged over the defaults
 * @returns A fresh program definition
 *
 * @example
 * ```ts
 * import { programDefinition } from '@orkestrel/rater'
 *
 * programDefinition('p1', 'Program', [])
 * ```
 */
export function programDefinition(
	id: string,
	name: string,
	lines: readonly LineDefinition[],
	overrides?: Partial<Omit<ProgramDefinition, 'id' | 'name' | 'lines'>>,
): ProgramDefinition {
	return { id, name, lines, ...overrides }
}

/**
 * Build a {@link LineDefinition}.
 *
 * @param id - The line id
 * @param name - The display name
 * @param rate - The line's quantitative rating definition
 * @param overrides - Optional {@link LineDefinition} fields merged over the defaults
 * @returns A fresh line definition
 *
 * @example
 * ```ts
 * import { quantitativeDefinition } from '@orkestrel/reason'
 * import { lineDefinition } from '@orkestrel/rater'
 *
 * lineDefinition('base', 'Base Amount', quantitativeDefinition('base', 'Base', []))
 * ```
 */
export function lineDefinition(
	id: string,
	name: string,
	rate: QuantitativeDefinition,
	overrides?: Partial<Omit<LineDefinition, 'id' | 'name' | 'rate'>>,
): LineDefinition {
	return { id, name, rate, ...overrides }
}

/**
 * Build a {@link PassDefinition}.
 *
 * @param definition - The pass's logical or quantitative definition
 * @param line - The line id this pass is scoped to, when it is line-scoped
 * @returns A fresh pass definition
 *
 * @example
 * ```ts
 * import { quantitativeDefinition } from '@orkestrel/reason'
 * import { passDefinition } from '@orkestrel/rater'
 *
 * passDefinition(quantitativeDefinition('surcharge', 'Surcharge', []))
 * ```
 */
export function passDefinition(
	definition: LogicalDefinition | QuantitativeDefinition,
	line?: string,
): PassDefinition {
	return { definition, ...(line === undefined ? {} : { line }) }
}

/**
 * Build a {@link Ruling}.
 *
 * @param effect - The determination effect a fired rule routes to
 * @param line - The line id this ruling is scoped to, when it is line-scoped
 * @param message - An interpolated message template, when the ruling carries one
 * @returns A fresh ruling
 *
 * @example
 * ```ts
 * import { rulingDefinition } from '@orkestrel/rater'
 *
 * rulingDefinition('restriction', 'base', 'Amount exceeds {{limit}}')
 * ```
 */
export function rulingDefinition(effect: Effect, line?: string, message?: string): Ruling {
	return {
		effect,
		...(line === undefined ? {} : { line }),
		...(message === undefined ? {} : { message }),
	}
}

/**
 * Build a {@link Notice}.
 *
 * @param id - The notice id
 * @param message - An interpolated message template
 * @param line - The line id this notice is scoped to, when it is line-scoped
 * @returns A fresh notice
 *
 * @example
 * ```ts
 * import { noticeDefinition } from '@orkestrel/rater'
 *
 * noticeDefinition('n1', 'Rated on {{date}}')
 * ```
 */
export function noticeDefinition(id: string, message: string, line?: string): Notice {
	return { id, message, ...(line === undefined ? {} : { line }) }
}

/**
 * Build an {@link AggregateDefinition}.
 *
 * @param fields - The batch fields to sum
 * @param by - The partition key field, when the aggregate is partitioned
 * @param gates - The logical definition gating aggregate determinations, when present
 * @returns A fresh aggregate definition
 *
 * @example
 * ```ts
 * import { aggregateDefinition } from '@orkestrel/rater'
 *
 * aggregateDefinition(['amount'])
 * ```
 */
export function aggregateDefinition(
	fields: readonly FieldPath[],
	by?: FieldPath,
	gates?: LogicalDefinition,
): AggregateDefinition {
	return { fields, ...(by === undefined ? {} : { by }), ...(gates === undefined ? {} : { gates }) }
}
