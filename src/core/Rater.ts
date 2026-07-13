import type { EmitterInterface } from '../emitters/index.js'
import type { FieldPath } from '../types.js'
import type {
	LogicalDefinition,
	LogicalResult,
	ReasonerInterface,
	Subject,
} from '../reasons/index.js'
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
import { Emitter } from '../emitters/index.js'
import { isRecord } from '../contracts/index.js'
import { formatField, resolveField } from '../helpers.js'
import { createLogicalReasoner } from '../reasons/index.js'
import { DEFAULT_RATER_VALIDATE } from './constants.js'
import { RaterError } from './errors.js'
import {
	aggregateGroups,
	aggregateProjection,
	aggregateRecord,
	aggregateSums,
	assertSubject,
	emptyTallies,
	logicalFailure,
	rulesToDeterminations,
	tallySubject,
} from './helpers.js'
import { ProgramManager } from './programs/ProgramManager.js'

/** Rating orchestrator over ordered programs. */
export class Rater implements RaterInterface {
	readonly #emitter: Emitter<RaterEventMap>
	readonly #manager: ProgramManager
	readonly #logical: ReasonerInterface
	#destroyed = false

	constructor(options?: RaterOptions) {
		this.#emitter = new Emitter<RaterEventMap>({ on: options?.on, error: options?.error })
		this.#manager = new ProgramManager(
			options?.total,
			options?.labels,
			options?.validate ?? DEFAULT_RATER_VALIDATE,
		)
		this.#logical = createLogicalReasoner()
		for (const definition of options?.programs ?? []) this.#manager.add(definition)
	}

	get emitter(): EmitterInterface<RaterEventMap> {
		return this.#emitter
	}

	get programs(): ProgramManager {
		return this.#manager
	}

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
		const fields = this.#fields(programs)
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

	#fields(programs: readonly ProgramInterface[]): readonly FieldPath[] {
		const fields: FieldPath[] = []
		const keys = new Set<string>()
		for (const program of programs) {
			for (const field of program.definition.aggregate?.fields ?? []) {
				const key = formatField(field)
				if (!keys.has(key)) {
					keys.add(key)
					fields.push(field)
				}
			}
		}
		return fields
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
			const group = this.#group(subject, programGroups.get(program.id) ?? [], aggregate.by)
			output[program.id] = aggregateProjection(count, sums, group)
		}
		return output
	}

	#group(
		subject: Subject,
		groups: readonly AggregateGroup[],
		by?: FieldPath,
	): AggregateGroup | undefined {
		if (by === undefined) return undefined
		const key = String(resolveField(subject, by) ?? '')
		return groups.find((entry) => entry.key === key)
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
		return rulesToDeterminations(definition, result, rulings, record, undefined)
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
		try {
			const result = this.#logical.reason(subject, definition)
			if (result.reasoning === 'logical') return result
			return logicalFailure()
		} catch (error) {
			return logicalFailure(error instanceof Error ? error.message : String(error))
		}
	}

	#ensureAlive(): void {
		if (this.#destroyed) throw new RaterError('MISSING', 'Rater has been destroyed')
	}
}
