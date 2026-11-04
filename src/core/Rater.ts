import type { ContractShape } from '@orkestrel/contract'
import type { EmitterInterface } from '@orkestrel/emitter'
import type {
	QuantitativeDefinition,
	QuantitativeResult,
	ReasonInterface,
	ReasonResult,
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
import { arrayOf, isArray, isFiniteNumber, isRecord, isString } from '@orkestrel/contract'
import {
	createQuantitativeReasoner,
	createReason,
	createSubjectDoor,
	describeFault,
	filterUniqueFaults,
	filterUniqueFields,
	isQuantitativeResult,
	isReasonError,
	scanShape,
	scanShapeReads,
} from '@orkestrel/reason'
import { RaterError } from './errors.js'
import { buildLineResult, sumAmounts } from './helpers.js'
import { isLineDefinition, isRatingDefinition } from './validators.js'

/**
 * Orchestrates rating — owns (or receives) the shared quantitative
 * reasoning engine and projects results into the rating domain vocabulary.
 *
 * @remarks
 * When no `engine` is injected, `Rater` builds and owns its own
 * quantitative-only engine (`bail: false`) — Rater performs no evaluation
 * arithmetic of its own; it only orchestrates and projects. The
 * array-of-lines `rate` overload is declared first so a plain line list
 * resolves to that form. `destroy()` destroys an owned engine, then the
 * emitter last; an injected engine is never destroyed. Afterwards every
 * other method throws {@link RaterError} `'DESTROYED'`.
 *
 * @example
 * ```ts
 * import { Rater } from '@orkestrel/rater'
 *
 * const rater = new Rater()
 * rater.rate([], { id: 'subject-1' }).success // true
 * rater.destroy()
 * ```
 */
export class Rater implements RaterInterface {
	readonly #emitter: Emitter<RaterEventMap>
	readonly #engine: ReasonInterface
	readonly #owned: boolean
	readonly #total: TotalHandler | undefined
	readonly #labels: Readonly<Record<string, string>> | undefined
	readonly #door = createSubjectDoor()
	readonly #valid = new WeakSet<RatingDefinition>()
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
		const admission = this.#door.admit(subject, this.#readShape(input))
		const admitted = admission.subject
		if (admitted === undefined) {
			const refused: RatingResult = {
				lines: [],
				success: false,
				errors: admission.errors,
				faults: admission.faults,
				repairs: [],
				defaulted: [],
			}
			this.#emitter.emit('rate', subject, refused)
			return refused
		}
		const results = lines.map((line) => this.#rateLine(line, admitted))
		const rated = results.every((entry) => entry.worksheet.success)
		// No handler totals a line that refused, because the total would read as an answer.
		const summed = rated ? (this.#total ?? sumAmounts)(results) : undefined
		// A total past what a number holds is no answer either, and the sum alone can overflow.
		const overflowed = summed !== undefined && !isFiniteNumber(summed)
		const total = overflowed ? undefined : summed
		const success = rated && !overflowed
		const faults = filterUniqueFaults(results.flatMap((entry) => entry.worksheet.faults))
		const said = new Set(faults.map((fault) => describeFault(fault)))
		// `success` is the verdict, so a line that failed and said nothing still has to say so.
		const other = results.flatMap((entry) => {
			const { errors, success: settled } = entry.worksheet
			if (!settled && errors.length === 0) return [`${entry.id}: The line failed and said nothing`]
			return errors.filter((error) => !said.has(error)).map((error) => `${entry.id}: ${error}`)
		})
		const repairs = filterUniqueFaults([
			...admission.repairs,
			...results.flatMap((entry) => entry.worksheet.repairs),
		])
		const defaulted = filterUniqueFields([
			...admission.defaulted,
			...results.flatMap((entry) => entry.worksheet.defaulted),
		])
		const result: RatingResult = {
			lines: results,
			...(total === undefined ? {} : { total }),
			success,
			errors: [...other, ...said, ...(overflowed ? ['The total is not a finite number'] : [])],
			faults,
			repairs,
			defaulted,
		}
		this.#emitter.emit('rate', admitted, result)
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

	// A rating's shape is checked against what its lines read once per definition, by identity.
	#readShape(input: readonly LineDefinition[] | RatingDefinition): ContractShape | undefined {
		if (arrayOf(isLineDefinition)(input)) return undefined
		const { shape, lines } = input
		if (shape === undefined || this.#valid.has(input)) return shape
		const checks = lines.flatMap((line) =>
			line.rate.groups.flatMap((group) => group.factors.flatMap((factor) => factor.checks ?? [])),
		)
		const fields = lines.flatMap((line) =>
			line.rate.groups.flatMap((group) =>
				group.factors.flatMap((factor) =>
					factor.source.origin === 'static' ? [] : [factor.source.field],
				),
			),
		)
		const errors = [...scanShape(shape), ...scanShapeReads(shape, checks, fields, new Set()).errors]
		if (errors.length > 0) {
			throw new RaterError('DEFINITION', `Rating shape is invalid: ${errors.join(', ')}`)
		}
		this.#valid.add(input)
		return shape
	}

	#rateLine(line: LineDefinition, subject: Subject): LineResult {
		const result = this.#reasonQuantitative(subject, line.rate)
		return buildLineResult(line, result, this.#labels)
	}

	// Narrows the engine's answer to a QuantitativeResult, and reads nothing it has not checked:
	// an injected engine can answer anything, null included, so this is total. An engine that
	// contradicts itself refuses, because `success` is the verdict and it has to be earned.
	#reasonQuantitative(subject: Subject, definition: QuantitativeDefinition): QuantitativeResult {
		const result: unknown = this.#reason(subject, definition)
		if (isQuantitativeResult(result)) return this.#settle(result)
		const answer = isRecord(result) ? result : {}
		const named = isString(answer.reasoning) ? answer.reasoning : 'something else'
		const said = isArray<unknown>(answer.errors) ? answer.errors.filter(isString) : []
		return {
			reasoning: 'quantitative',
			value: 0,
			groups: [],
			count: 0,
			success: false,
			trace: [],
			errors: [...said, `Expected quantitative result, got ${named}`],
			faults: [],
			repairs: [],
			defaulted: [],
		}
	}

	#settle(result: QuantitativeResult): QuantitativeResult {
		if (!result.success) return result
		const clean = result.errors.length === 0 && result.faults.length === 0
		if (clean && isFiniteNumber(result.value)) return result
		const said = result.errors.length > 0 ? [] : ['The line succeeded beside a fault or no value']
		return { ...result, success: false, errors: [...result.errors, ...said] }
	}

	// An invalid line definition is an authoring error, so it reaches the caller as one.
	#reason(subject: Subject, definition: QuantitativeDefinition): ReasonResult {
		try {
			return this.#engine.reason(subject, definition)
		} catch (error) {
			if (isReasonError(error) && error.code === 'INVALID') {
				throw new RaterError('DEFINITION', error.message)
			}
			throw error
		}
	}

	#ensureAlive(): void {
		if (this.#destroyed) throw new RaterError('DESTROYED', 'Rater has been destroyed')
	}
}
