import type {
	ProgramDefinition,
	ProgramInterface,
	ProgramManagerInterface,
	ProgramOptions,
	TotalHandler,
} from '../types.js'
import { DEFAULT_RATER_VALIDATE } from '../constants.js'
import { RaterError } from '../errors.js'
import { isProgramDefinition } from '../validators.js'
import { Program } from './Program.js'

/** Ordered manager for compiled programs. */
export class ProgramManager implements ProgramManagerInterface {
	readonly #programs = new Map<string, ProgramInterface>()
	readonly #total: TotalHandler | undefined
	readonly #labels: Readonly<Record<string, string>> | undefined
	readonly #validate: boolean
	#destroyed = false

	constructor(
		total?: TotalHandler,
		labels?: Readonly<Record<string, string>>,
		validate = DEFAULT_RATER_VALIDATE,
	) {
		this.#total = total
		this.#labels = labels
		this.#validate = validate
	}

	get size(): number {
		this.#ensureAlive()
		return this.#programs.size
	}

	has(id: string): boolean {
		this.#ensureAlive()
		return this.#programs.has(id)
	}

	program(id: string): ProgramInterface | undefined {
		this.#ensureAlive()
		return this.#programs.get(id)
	}

	programs(): readonly ProgramInterface[] {
		this.#ensureAlive()
		return [...this.#programs.values()]
	}

	add(definition: ProgramDefinition, options?: ProgramOptions): ProgramInterface {
		this.#ensureAlive()
		if (this.#programs.has(definition.id)) {
			throw new RaterError('DUPLICATE', `Program already exists: ${definition.id}`, {
				program: definition.id,
			})
		}
		if (this.#validate && !isProgramDefinition(definition)) {
			throw new RaterError('DEFINITION', 'Program definition failed validation')
		}
		const program = new Program(definition, {
			total: options?.total ?? this.#total,
			labels: options?.labels ?? this.#labels,
		})
		this.#programs.set(program.id, program)
		return program
	}

	remove(ids: readonly string[]): boolean
	remove(id: string): boolean
	remove(): void
	remove(target?: string | readonly string[]): boolean | void {
		this.#ensureAlive()
		if (target === undefined) {
			this.#programs.clear()
			return
		}
		if (typeof target === 'string') return this.#programs.delete(target)
		let removed = true
		for (const id of target) removed = this.#programs.delete(id) && removed
		return removed
	}

	destroy(): void {
		if (this.#destroyed) return
		this.#programs.clear()
		this.#destroyed = true
	}

	#ensureAlive(): void {
		if (this.#destroyed) throw new RaterError('MISSING', 'Program manager has been destroyed')
	}
}
