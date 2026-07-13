import type { EmitterInterface } from '@orkestrel/emitter'
import type { ReasonInterface } from '@orkestrel/reason'
import type {
	ProgramDefinition,
	ProgramInterface,
	ProgramManagerEventMap,
	ProgramManagerInterface,
	ProgramManagerOptions,
	ProgramOptions,
} from '../types.js'
import { Emitter } from '@orkestrel/emitter'
import { DEFAULT_RATER_VALIDATE } from '../constants.js'
import { RaterError } from '../errors.js'
import { isProgramDefinition } from '../validators.js'
import { Program } from './Program.js'

/**
 * An ordered manager over compiled {@link ProgramInterface}s (AGENTS §9), built
 * over an injected, shared reasoning engine.
 *
 * @remarks
 * OWNS its `#programs` collection and its own {@link Emitter} over
 * {@link ProgramManagerEventMap}. `destroy()` is idempotent and tears the
 * emitter down LAST; every other call afterwards throws
 * {@link RaterError} `'DESTROYED'`.
 */
export class ProgramManager implements ProgramManagerInterface {
	readonly #programs = new Map<string, ProgramInterface>()
	readonly #engine: ReasonInterface
	readonly #emitter: Emitter<ProgramManagerEventMap>
	readonly #total: ProgramOptions['total']
	readonly #labels: Readonly<Record<string, string>> | undefined
	readonly #validate: boolean
	#destroyed = false

	constructor(engine: ReasonInterface, options?: ProgramManagerOptions) {
		this.#engine = engine
		this.#emitter = new Emitter<ProgramManagerEventMap>({ on: options?.on, error: options?.error })
		this.#total = options?.total
		this.#labels = options?.labels
		this.#validate = options?.validate ?? DEFAULT_RATER_VALIDATE
	}

	get emitter(): EmitterInterface<ProgramManagerEventMap> {
		return this.#emitter
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
		const id = definition.id
		if (this.#validate && !isProgramDefinition(definition)) {
			throw new RaterError('DEFINITION', 'Program definition failed validation', { program: id })
		}
		const program = new Program(definition, this.#engine, {
			total: options?.total ?? this.#total,
			labels: options?.labels ?? this.#labels,
		})
		this.#programs.set(program.id, program)
		this.#emitter.emit('add', program.id)
		return program
	}

	remove(ids: readonly string[]): boolean
	remove(id: string): boolean
	remove(): void
	remove(target?: string | readonly string[]): boolean | void {
		this.#ensureAlive()
		if (target === undefined) {
			for (const id of this.#programs.keys()) this.#emitter.emit('remove', id)
			this.#programs.clear()
			return
		}
		if (typeof target === 'string') return this.#removeOne(target)
		let removed = true
		for (const id of target) removed = this.#removeOne(id) && removed
		return removed
	}

	destroy(): void {
		if (this.#destroyed) return
		this.#programs.clear()
		this.#destroyed = true
		this.#emitter.emit('destroy')
		this.#emitter.destroy()
	}

	#removeOne(id: string): boolean {
		const removed = this.#programs.delete(id)
		if (removed) this.#emitter.emit('remove', id)
		return removed
	}

	#ensureAlive(): void {
		if (this.#destroyed) throw new RaterError('DESTROYED', 'ProgramManager has been destroyed')
	}
}
