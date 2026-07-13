import type { EmitterInterface } from '@orkestrel/emitter'
import type {
	EvaluatorInterface,
	LogicalDefinition,
	LogicalResult,
	ReasonInterface,
	Subject,
} from '@orkestrel/reason'
import type {
	AggregateGroup,
	AggregateResult,
	Determination,
	ProgramInterface,
	RaterEventMap,
	RaterInterface,
	RaterOptions,
	Ruling,
	SubjectResult,
	Tally,
} from './types.js'
import { Emitter } from '@orkestrel/emitter'
import {
	createEvaluator,
	createLogicalReasoner,
	createQuantitativeReasoner,
	createReason,
} from '@orkestrel/reason'
import { isRecord } from '@orkestrel/contract'
import { RaterError } from './errors.js'
import {
	aggregateFields,
	aggregateGroups,
	aggregateProjection,
	aggregateRecord,
	aggregateSums,
	assertSubject,
	emptyTallies,
	groupFor,
	rulesToDeterminations,
	tallySubject,
} from './helpers.js'
import { ProgramManager } from './programs/ProgramManager.js'

/**
 * The rating orchestrator — owns the shared reasoning engine and an ordered
 * {@link ProgramManager}, and projects results into the rating domain
 * vocabulary.
 *
 * @remarks
 * Constructs ONE shared reason engine (quantitative + logical reasoners,
 * `bail: false`) and injects it into every compiled program — Rater performs
 * NO evaluation arithmetic of its own; it only orchestrates and projects. The
 * batch `rate` overload is declared FIRST (AGENTS §9.2) so an array subject
 * resolves to the batch form. `destroy()` tears down the manager, then the
 * engine, then the emitter LAST (AGENTS §13); afterwards every other method
 * throws {@link RaterError} `'DESTROYED'`.
 */
export class Rater implements RaterInterface {
	readonly #emitter: Emitter<RaterEventMap>
	readonly #manager: ProgramManager
	readonly #engine: ReasonInterface
	readonly #evaluator: EvaluatorInterface
	#destroyed = false

	constructor(options?: RaterOptions) {
		this.#emitter = new Emitter<RaterEventMap>({ on: options?.on, error: options?.error })
		this.#engine = createReason({
			reasoners: [createQuantitativeReasoner(), createLogicalReasoner()],
			bail: false,
		})
		this.#evaluator = createEvaluator()
		this.#manager = new ProgramManager(this.#engine, {
			total: options?.total,
			labels: options?.labels,
			validate: options?.validate,
		})
		for (const definition of options?.programs ?? []) this.#manager.add(definition)
	}

	get emitter(): EmitterInterface<RaterEventMap> {
		return this.#emitter
	}

	get programs(): ProgramManager {
		return this.#manager
	}

	// Array overload first (AGENTS §9.2) so a list resolves to the batch form.
	rate(subjects: readonly Subject[]): AggregateResult
	rate(subject: Subject): SubjectResult
	rate(subject: Subject | readonly Subject[]): SubjectResult | AggregateResult {
		this.#ensureAlive()
		if (isRecord(subject)) return this.#rateOne(subject)
		return this.#rateBatch(subject)
	}

	destroy(): void {
		if (this.#destroyed) return
		this.#manager.destroy()
		this.#engine.destroy()
		this.#destroyed = true
		this.#emitter.destroy()
	}

	#rateOne(subject: Subject): SubjectResult {
		assertSubject(subject)
		const result = this.#subject(subject)
		this.#emitSubject(result)
		return result
	}

	#rateBatch(subjects: readonly Subject[]): AggregateResult {
		for (const subject of subjects) assertSubject(subject)
		const programs = this.#manager.programs()
		const fields = aggregateFields(programs)
		const sums = aggregateSums(subjects, fields)
		// Precompute each program's whole-batch sums and groups ONCE. The per-subject
		// projection pass, the group listing, and the aggregate-determination gates all
		// reuse these instead of re-summing the whole batch for every subject.
		const programSums = new Map<string, Readonly<Record<string, number>>>()
		const programGroups = new Map<string, readonly AggregateGroup[]>()
		for (const program of programs) {
			const aggregate = program.definition.aggregate
			if (aggregate === undefined) continue
			programSums.set(program.id, aggregateSums(subjects, aggregate.fields))
			programGroups.set(program.id, aggregateGroups(subjects, aggregate.fields, aggregate.by))
		}
		const groups = this.#groups(programs, programGroups)
		const determinations = this.#aggregateDeterminations(
			programs,
			programSums,
			programGroups,
			subjects.length,
		)
		const subjectsResult = subjects.map((subject) =>
			this.#subject(
				subject,
				this.#projections(subject, programs, programSums, programGroups, subjects.length),
			),
		)
		const tallies = this.#tallies(subjects, subjectsResult, programs)
		const result: AggregateResult = {
			subjects: subjectsResult,
			determinations,
			groups,
			tallies,
			count: subjects.length,
			sums,
		}
		for (const rated of subjectsResult) this.#emitSubject(rated)
		for (const determination of determinations) {
			if (determination.applied) this.#emitter.emit('determine', determination)
		}
		this.#emitter.emit('aggregate', result)
		return result
	}

	#subject(
		subject: Subject,
		projections?: Readonly<Record<string, Readonly<Record<string, unknown>>>>,
	): SubjectResult {
		const programs = this.#manager.programs().map((program) => {
			const projection = projections?.[program.id]
			return projection === undefined ? program.rate(subject) : program.rate(subject, projection)
		})
		return { subject, programs }
	}

	#emitSubject(result: SubjectResult): void {
		for (const program of result.programs) {
			const determinations = [
				...program.determinations,
				...program.lines.flatMap((rated) => rated.determinations),
			]
			for (const determination of determinations) {
				if (determination.applied) this.#emitter.emit('determine', determination)
			}
			if (program.decision !== undefined) this.#emitter.emit('decide', program.decision, program)
		}
		this.#emitter.emit('rate', result)
	}

	#groups(
		programs: readonly ProgramInterface[],
		programGroups: ReadonlyMap<string, readonly AggregateGroup[]>,
	): readonly AggregateGroup[] {
		const output: AggregateGroup[] = []
		for (const program of programs) {
			const aggregate = program.definition.aggregate
			if (aggregate?.by !== undefined) output.push(...(programGroups.get(program.id) ?? []))
		}
		return output
	}

	#projections(
		subject: Subject,
		programs: readonly ProgramInterface[],
		programSums: ReadonlyMap<string, Readonly<Record<string, number>>>,
		programGroups: ReadonlyMap<string, readonly AggregateGroup[]>,
		count: number,
	): Readonly<Record<string, Readonly<Record<string, unknown>>>> {
		const output: Record<string, Readonly<Record<string, unknown>>> = {}
		for (const program of programs) {
			const aggregate = program.definition.aggregate
			if (aggregate === undefined) continue
			const sums = programSums.get(program.id)
			if (sums === undefined) continue
			const group = groupFor(subject, programGroups.get(program.id) ?? [], aggregate.by)
			output[program.id] = aggregateProjection(count, sums, group)
		}
		return output
	}

	#aggregateDeterminations(
		programs: readonly ProgramInterface[],
		programSums: ReadonlyMap<string, Readonly<Record<string, number>>>,
		programGroups: ReadonlyMap<string, readonly AggregateGroup[]>,
		count: number,
	): readonly Determination[] {
		const determinations: Determination[] = []
		for (const program of programs) {
			const aggregate = program.definition.aggregate
			if (aggregate?.gates === undefined) continue
			const sums = programSums.get(program.id)
			if (sums === undefined) continue
			determinations.push(
				...this.#gate(aggregate.gates, aggregateRecord(count, sums), program.definition.rulings),
			)
			for (const group of programGroups.get(program.id) ?? []) {
				determinations.push(
					...this.#gate(
						aggregate.gates,
						aggregateRecord(group.count, group.sums, group),
						program.definition.rulings,
					),
				)
			}
		}
		return determinations
	}

	#gate(
		definition: LogicalDefinition,
		record: Readonly<Record<string, unknown>>,
		rulings: Readonly<Record<string, Ruling>> | undefined,
	): readonly Determination[] {
		const result = this.#reasonLogical(record, definition)
		return rulesToDeterminations(definition, result, rulings, record, undefined, this.#evaluator)
	}

	#tallies(
		subjects: readonly Subject[],
		results: readonly SubjectResult[],
		programs: readonly ProgramInterface[],
	): Readonly<Record<string, Readonly<Record<string, Tally>>>> {
		const output: Record<string, Readonly<Record<string, Tally>>> = {}
		for (const program of programs) {
			let tallies = emptyTallies(program.definition.aggregate?.fields ?? [])
			for (let index = 0; index < results.length; index += 1) {
				const subject = subjects[index]
				const rated = results[index]?.programs.find((entry) => entry.id === program.id)
				if (subject !== undefined && rated !== undefined) {
					tallies = tallySubject(
						tallies,
						rated.status,
						subject,
						program.definition.aggregate?.fields ?? [],
					)
				}
			}
			output[program.id] = tallies
		}
		return output
	}

	#reasonLogical(subject: Subject, definition: LogicalDefinition): LogicalResult {
		const result = this.#engine.reason(subject, definition)
		if (result.reasoning === 'logical') return result
		return {
			reasoning: 'logical',
			conclusion: false,
			rules: [],
			count: 0,
			success: false,
			trace: [],
			errors: result.errors,
		}
	}

	#ensureAlive(): void {
		if (this.#destroyed) throw new RaterError('DESTROYED', 'Rater has been destroyed')
	}
}
