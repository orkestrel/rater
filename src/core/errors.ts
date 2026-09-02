import type { RaterErrorCode } from './types.js'

/**
 * Represents a coded programmer error thrown by the rating layer.
 *
 * @remarks
 * `DEFINITION` — the `rate` input failed both the array-of-lines and rating
 * definition validation. `MISMATCH` — a rated subject is not a record.
 * `DESTROYED` — use of a destroyed entity.
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
		this.name = 'RaterError'
		this.code = code
		if (context !== undefined) this.context = context
	}
}

/**
 * Narrows a caught value to a {@link RaterError}.
 *
 * @param value - The caught value to test
 * @returns True if `value` is a `RaterError`; false otherwise
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
	return value instanceof RaterError
}
