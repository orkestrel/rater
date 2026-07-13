import type {
	EvaluatorInterface,
	QuantitativeDefinition,
	QuantitativeResult,
	ReasonInterface,
	Subject,
} from '@orkestrel/reason'
import type {
	Determination,
	LineResult,
	ProgramDefinition,
	ProgramInterface,
	ProgramOptions,
	ProgramResult,
	Worksheet,
} from '../types.js'
import {
	assignField,
	buildErrorResult,
	createEvaluator,
	extractConclusions,
	mergeSubjects,
} from '@orkestrel/reason'
import { AGGREGATE_KEY, OUTCOME_KEY } from '../constants.js'
import { RaterError } from '../errors.js'
import {
	assertSubject,
	authorityToDeterminations,
	decideEligibility,
	deriveDeterminationEligibility,
	filterLineDeterminations,
	filterProgramDeterminations,
	findMissingLineReferences,
	findRule,
	noticesToDeterminations,
	outcomeProjection,
	programResult,
	ratedLine,
	resultsWorksheet,
	rulesToDeterminations,
} from '../helpers.js'

/**
 * A compiled program — rates one subject at a time over an injected, shared
 * reasoning engine.
 *
 * @remarks
 * The engine is INJECTED and never owned, destroyed, or otherwise mutated by
 * the program: every actual evaluation (passes, lines, authority) delegates to
 * it. `rate` builds its working subject through copy-on-write overlays only —
 * the caller's `subject` is never mutated.
 */
export class Program implements ProgramInterface {
	readonly #definition: ProgramDefinition
	readonly #engine: ReasonInterface
	readonly #evaluator: EvaluatorInterface
	readonly #total: ProgramOptions['total']
	readonly #labels: Readonly<Record<string, string>> | undefined

	constructor(definition: ProgramDefinition, reason: ReasonInterface, options?: ProgramOptions) {
		const missing = findMissingLineReferences(definition)
		if (missing.length > 0) {
			throw new RaterError('MISSING', `Unknown line reference: ${missing.join(', ')}`, {
				program: definition.id,
			})
		}
		this.#definition = definition
		this.#engine = reason
		this.#evaluator = createEvaluator()
		this.#total = options?.total
		this.#labels = options?.labels
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
		let working: Subject =
			aggregate === undefined ? subject : assignField(subject, AGGREGATE_KEY, aggregate)
		const determinations: Determination[] = []
		const derivations: Worksheet[] = []
		const trace: string[] = []
		const errors: string[] = []

		for (const pass of this.#definition.passes ?? []) {
			if (pass.definition.reasoning === 'quantitative') {
				const result = this.#engine.reason(working, pass.definition)
				trace.push(...result.trace)
				errors.push(...result.errors)
				if (result.reasoning === 'quantitative') {
					working = assignField(working, pass.definition.id, result.value)
					derivations.push(resultsWorksheet(pass.definition, result, this.#labels))
				}
			} else {
				const result = this.#engine.reason(working, pass.definition)
				trace.push(...result.trace)
				errors.push(...result.errors)
				if (result.reasoning === 'logical') {
					determinations.push(
						...rulesToDeterminations(
							pass.definition,
							result,
							this.#definition.rulings,
							working,
							pass.line,
							this.#evaluator,
							this.#labels,
						),
					)
					for (const entry of result.rules) {
						if (!entry.applied) continue
						const rule = findRule(pass.definition, entry.id)
						if (rule !== undefined)
							working = mergeSubjects(working, extractConclusions(rule.conclusion))
					}
				}
			}
		}

		determinations.push(...noticesToDeterminations(this.#definition.notices, working))
		const scoped = filterProgramDeterminations(determinations)
		const lines = this.#rateLines(working, scoped, determinations)
		const total = this.#total?.(lines)
		const base = programResult(
			this.#definition,
			lines,
			scoped,
			derivations,
			total,
			undefined,
			trace,
			errors,
		)
		if (this.#definition.authority === undefined) return base

		const authorityWorking = assignField(working, OUTCOME_KEY, outcomeProjection(base))
		const authorityResult = this.#engine.reason(authorityWorking, this.#definition.authority)
		if (authorityResult.reasoning !== 'logical') return base
		const limits = authorityToDeterminations(
			this.#definition.authority,
			authorityResult,
			this.#definition.rulings,
			authorityWorking,
			this.#evaluator,
			this.#labels,
		)
		const decision =
			limits.length === 0 && authorityResult.errors.length === 0
				? decideEligibility(base.eligibility)
				: undefined
		return programResult(
			this.#definition,
			lines,
			[...scoped, ...limits],
			derivations,
			total,
			decision,
			[...trace, ...authorityResult.trace],
			[...errors, ...authorityResult.errors],
		)
	}

	#rateLines(
		working: Subject,
		context: readonly Determination[],
		determinations: readonly Determination[],
	): readonly LineResult[] {
		const lines: LineResult[] = []
		for (const entry of this.#definition.lines) {
			const own = filterLineDeterminations(determinations, entry.id)
			const line = ratedLine(entry, this.#quantitative(working, entry.rate), own, this.#labels)
			lines.push({
				...line,
				eligibility: deriveDeterminationEligibility([...context, ...line.determinations]),
			})
		}
		return lines
	}

	// Narrows the engine's tagged ReasonResult union down to a QuantitativeResult
	// for a definition the engine is guaranteed (by dispatch-by-reasoning) to
	// resolve as such — a defensive, total fallback rather than an assertion.
	#quantitative(subject: Subject, definition: QuantitativeDefinition): QuantitativeResult {
		const result = this.#engine.reason(subject, definition)
		if (result.reasoning === 'quantitative') return result
		const failure = buildErrorResult(
			definition,
			`Expected quantitative result, got ${result.reasoning}`,
		)
		if (failure.reasoning === 'quantitative') return failure
		return {
			reasoning: 'quantitative',
			value: 0,
			groups: [],
			count: 0,
			success: false,
			trace: [],
			errors: failure.errors,
		}
	}
}
