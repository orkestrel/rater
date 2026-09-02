import type { EmitterInterface } from '@orkestrel/emitter'
import type {
	QuantitativeDefinition,
	QuantitativeResult,
	ReasonInterface,
	Subject,
} from '@orkestrel/reason'
import type {
	LineDefinition,
	LineResult,
	RaterEventMap,
	RaterInterface,
	RaterOptions,
	RatingDefinition,
	RatingResult,
	TotalHandler,
} from './types.js'
import { Emitter } from '@orkestrel/emitter'
import { arrayOf, isArray, isRecord } from '@orkestrel/contract'
import { buildErrorResult, createQuantitativeReasoner, createReason } from '@orkestrel/reason'
import { RaterError } from './errors.js'
import { buildLineResult, sumAmounts } from './helpers.js'
import { isLineDefinition, isRatingDefinition } from './validators.js'

/**
 * The rating orchestrator — owns (or receives) the shared quantitative
 * reasoning engine and projects results into the rating domain vocabulary.
 *
 * @remarks
 * When no `engine` is injected, `Rater` builds and OWNS its own
 * quantitative-only engine (`bail: false`) — Rater performs NO evaluation
 * arithmetic of its own; it only orchestrates and projects. The
 * array-of-lines `rate` overload is declared FIRST so a plain line list
 * resolves to that form. `destroy()` destroys an OWNED engine, then the
 * emitter LAST; an INJECTED engine is never destroyed. Afterwards every
 * other method throws {@link RaterError} `'DESTROYED'`.
 *
 * @example
 * ```ts
 * import { Rater } from '@orkestrel/rater'
 *
 * const rater = new Rater()
 * rater.rate([], { id: 'subject-1' }) // { lines: [], success: true }
 * rater.destroy()
 * ```
 */
export class Rater implements RaterInterface {
	readonly #emitter: Emitter<RaterEventMap>
	readonly #engine: ReasonInterface
	readonly #owned: boolean
	readonly #total: TotalHandler | undefined
	readonly #labels: Readonly<Record<string, string>> | undefined
	#destroyed = false

	constructor(options?: RaterOptions) {
		this.#emitter = new Emitter<RaterEventMap>({
			...(options?.on === undefined ? {} : { on: options.on }),
			...(options?.error === undefined ? {} : { error: options.error }),
		})
		if (options?.engine === undefined) {
			this.#engine = createReason({ reasoners: [createQuantitativeReasoner()], bail: false })
			this.#owned = true
		} else {
			this.#engine = options.engine
			this.#owned = false
		}
		this.#total = options?.total
		this.#labels = options?.labels
	}

	get emitter(): EmitterInterface<RaterEventMap> {
		return this.#emitter
	}

	// Array overload first so a plain line list resolves to that form.
	rate(lines: readonly LineDefinition[], subject: Subject): RatingResult
	rate(definition: RatingDefinition, subject: Subject): RatingResult
	rate(input: readonly LineDefinition[] | RatingDefinition, subject: Subject): RatingResult {
		this.#ensureAlive()
		const lines = this.#normalize(input)
		if (!isRecord(subject)) throw new RaterError('MISMATCH', 'Subject must be a record')
		const results = lines.map((line) => this.#rateLine(line, subject))
		const total = (this.#total ?? sumAmounts)(results)
		const success = results.every((entry) => entry.worksheet.success)
		const result: RatingResult = {
			lines: results,
			...(total === undefined ? {} : { total }),
			success,
		}
		this.#emitter.emit('rate', subject, result)
		return result
	}

	destroy(): void {
		if (this.#destroyed) return
		this.#destroyed = true
		if (this.#owned) this.#engine.destroy()
		this.#emitter.destroy()
	}

	#normalize(input: readonly LineDefinition[] | RatingDefinition): readonly LineDefinition[] {
		if (arrayOf(isLineDefinition)(input)) return input
		if (isRatingDefinition(input)) return input.lines
		throw new RaterError(
			'DEFINITION',
			'Rating input must be an array of line definitions or a rating definition',
		)
	}

	#rateLine(line: LineDefinition, subject: Subject): LineResult {
		const result = this.#reasonQuantitative(subject, line.rate)
		return buildLineResult(line, result, this.#labels)
	}

	// Narrows the engine's tagged ReasonResult union down to a QuantitativeResult
	// for a definition the engine is guaranteed (by dispatch-by-reasoning, given
	// only the quantitative reasoner is ever registered) to resolve as such — a
	// defensive, total fallback rather than an assertion. A nonconforming
	// injected engine result missing (or with a non-array) `errors` contributes
	// no errors from that side rather than throwing.
	#reasonQuantitative(subject: Subject, definition: QuantitativeDefinition): QuantitativeResult {
		const result = this.#engine.reason(subject, definition)
		if (result.reasoning === 'quantitative') return result
		const failure = buildErrorResult(
			definition,
			`Expected quantitative result, got ${result.reasoning}`,
		)
		const errors = [...(isArray<string>(result.errors) ? result.errors : []), ...failure.errors]
		if (failure.reasoning === 'quantitative') return { ...failure, errors }
		return {
			reasoning: 'quantitative',
			value: 0,
			groups: [],
			count: 0,
			success: false,
			trace: [],
			errors,
		}
	}

	#ensureAlive(): void {
		if (this.#destroyed) throw new RaterError('DESTROYED', 'Rater has been destroyed')
	}
}
