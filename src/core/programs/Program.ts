import type {
	LogicalDefinition,
	LogicalResult,
	QuantitativeDefinition,
	QuantitativeResult,
	ReasonerInterface,
	Subject,
} from '../../reasons/index.js'
import type {
	Determination,
	LineResult,
	ProgramDefinition,
	ProgramInterface,
	ProgramOptions,
	ProgramResult,
	Worksheet,
} from '../types.js'
import { createLogicalReasoner, createQuantitativeReasoner } from '../../reasons/index.js'
import { setField } from '../../helpers.js'
import { RaterError } from '../errors.js'
import { AGGREGATE_KEY, OUTCOME_KEY } from '../constants.js'
import {
	appendDeterminations,
	assertSubject,
	authorityToDeterminations,
	decideEligibility,
	freezeProgramDefinition,
	filterLineDeterminations,
	logicalFailure,
	mergeConclusion,
	findMissingLineReferences,
	noticesToDeterminations,
	outcomeProjection,
	filterProgramDeterminations,
	programResult,
	quantitativeFailure,
	ratedLine,
	rulesToDeterminations,
	resultsWorksheet,
	deriveDeterminationEligibility,
} from '../helpers.js'

/** Compiled program that rates one subject with deterministic evidence. */
export class Program implements ProgramInterface {
	readonly #definition: ProgramDefinition
	readonly #total: ProgramOptions['total']
	readonly #labels: Readonly<Record<string, string>> | undefined
	readonly #logical: ReasonerInterface
	readonly #quantitative: ReasonerInterface

	constructor(definition: ProgramDefinition, options?: ProgramOptions) {
		const missing = findMissingLineReferences(definition)
		if (missing.length > 0) {
			throw new RaterError('MISSING', `Unknown line reference: ${missing.join(', ')}`, {
				program: definition.id,
			})
		}
		try {
			this.#definition = freezeProgramDefinition(definition)
		} catch (error) {
			throw new RaterError('DEFINITION', 'Program definition could not be cloned', {
				program: definition.id,
				error: error instanceof Error ? error.message : String(error),
			})
		}
		this.#total = options?.total
		this.#labels = options?.labels
		this.#logical = createLogicalReasoner()
		this.#quantitative = createQuantitativeReasoner()
	}

	get id(): string {
		return this.#definition.id
	}

	get name(): string {
		return this.#definition.name
	}

	get definition(): ProgramDefinition {
		return this.#definition
	}

	rate(subject: Subject, aggregate?: Readonly<Record<string, unknown>>): ProgramResult {
		assertSubject(subject)
		const record: Record<string, unknown> = { ...subject }
		if (aggregate !== undefined) record[AGGREGATE_KEY] = aggregate
		const determinations: Determination[] = []
		const derivations: Worksheet[] = []
		const trace: string[] = []
		const errors: string[] = []

		for (const entry of this.#definition.passes ?? []) {
			if (entry.definition.reasoning === 'logical') {
				const result = this.#reasonLogical(record, entry.definition)
				trace.push(...result.trace)
				errors.push(...result.errors)
				determinations.push(
					...rulesToDeterminations(
						entry.definition,
						result,
						this.#definition.rulings,
						record,
						entry.line,
						this.#labels,
					),
				)
				for (const rated of result.rules) {
					if (rated.applied) {
						const rule = entry.definition.rules.find((candidate) => candidate.id === rated.id)
						if (rule !== undefined) mergeConclusion(record, rule)
					}
				}
			} else {
				const result = this.#reasonQuantitative(record, entry.definition)
				trace.push(...result.trace)
				errors.push(...result.errors)
				setField(record, entry.definition.id, result.value)
				derivations.push(resultsWorksheet(entry.definition, result, this.#labels))
			}
		}

		determinations.push(...noticesToDeterminations(this.#definition.notices, record))
		const scoped = filterProgramDeterminations(determinations)
		const lines = this.#rateLines(record, scoped, determinations, errors)
		const total = this.#total?.(lines)
		const base = programResult(this.#definition, lines, scoped, derivations, total, trace, errors)
		if (this.#definition.authority === undefined) return base
		const authorityRecord = { ...record, [OUTCOME_KEY]: outcomeProjection(base) }
		const authority = this.#reasonLogical(authorityRecord, this.#definition.authority)
		const limits = authorityToDeterminations(
			this.#definition.authority,
			authority,
			this.#definition.rulings,
			authorityRecord,
			this.#labels,
		)
		return appendDeterminations(
			base,
			limits,
			limits.length === 0 && authority.errors.length === 0
				? decideEligibility(base.eligibility)
				: undefined,
			authority.trace,
			authority.errors,
		)
	}

	#rateLines(
		record: Readonly<Record<string, unknown>>,
		context: readonly Determination[],
		determinations: readonly Determination[],
		errors: string[],
	): readonly LineResult[] {
		const lines: LineResult[] = []
		for (const entry of this.#definition.lines) {
			const own = filterLineDeterminations(determinations, entry.id)
			const result = this.#reasonQuantitative(record, entry.rate)
			errors.push(...result.errors)
			const line = ratedLine(entry, result, own, this.#labels)
			lines.push({
				...line,
				eligibility: deriveDeterminationEligibility([...context, ...line.determinations]),
			})
		}
		return lines
	}

	#reasonLogical(subject: Subject, definition: LogicalDefinition): LogicalResult {
		try {
			const result = this.#logical.reason(subject, definition)
			if (result.reasoning === 'logical') return result
			return logicalFailure(`Expected logical result, got ${result.reasoning}`)
		} catch (error) {
			return logicalFailure(error instanceof Error ? error.message : String(error))
		}
	}

	#reasonQuantitative(subject: Subject, definition: QuantitativeDefinition): QuantitativeResult {
		try {
			const result = this.#quantitative.reason(subject, definition)
			if (result.reasoning === 'quantitative') return result
			return quantitativeFailure(`Expected quantitative result, got ${result.reasoning}`)
		} catch (error) {
			return quantitativeFailure(error instanceof Error ? error.message : String(error))
		}
	}
}
