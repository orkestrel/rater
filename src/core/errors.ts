import type { RaterErrorCode } from './types.js'
import { holds, INTRINSICS, isFunction, isObject } from '@orkestrel/contract'

/**
 * Represents a coded programmer error thrown by the rating layer.
 *
 * @remarks
 * `DEFINITION` — the `rate` input failed both the array-of-lines and rating
 * definition validation. `MISMATCH` — a rated subject is not a record.
 * `DESTROYED` — use of a destroyed entity. `context` carries optional
 * structured detail beside the message.
 *
 * @example
 * ```ts
 * import { RaterError } from '@orkestrel/rater'
 *
 * throw new RaterError('MISMATCH', 'Subject must be a record')
 * ```
 */
export class RaterError extends Error {
	readonly code: RaterErrorCode
	readonly context?: Readonly<Record<string, unknown>>

	constructor(code: RaterErrorCode, message: string, context?: Readonly<Record<string, unknown>>) {
		super(message)
		INTRINSICS.define(this, Symbol.for('@orkestrel/rater.RaterError'), { value: this })
		this.name = 'RaterError'
		this.code = code
		if (context !== undefined) this.context = context
	}
}

/**
 * Narrows a caught value to a {@link RaterError}.
 *
 * @param value - The caught value to test
 * @returns True if the error carries its own identity brand and declared members; false otherwise
 *
 * @example
 * ```ts
 * import { isRaterError, RaterError } from '@orkestrel/rater'
 *
 * try {
 * 	throw new RaterError('DESTROYED', 'Rater has been destroyed')
 * } catch (error) {
 * 	if (isRaterError(error)) error.code // 'DESTROYED'
 * }
 * ```
 */
export function isRaterError(value: unknown): value is RaterError {
	return holds(() => {
		if (!(value instanceof Error) || INTRINSICS.prototype(value) === Error.prototype) return false
		const brand = INTRINSICS.describe(value, Symbol.for('@orkestrel/rater.RaterError'))
		if (brand?.value !== value) return false
		const code: unknown = INTRINSICS.reflect.read(value, 'code')
		if (code !== 'DEFINITION' && code !== 'MISMATCH' && code !== 'DESTROYED') return false
		const context: unknown = INTRINSICS.reflect.read(value, 'context')
		return context === undefined || isObject(context) || isFunction(context)
	})
}
