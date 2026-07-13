import type { RaterErrorCode } from './types.js'

/**
 * A coded programmer error thrown by the rating layer.
 *
 * @remarks
 * `DUPLICATE` — a program id collision on `ProgramManager.add`. `MISSING` — an
 * unknown authored line reference at compile time.
 * `DEFINITION` — a program definition failed `isProgramDefinition`. `MISMATCH` —
 * a rated subject is not a record, or uses a reserved working-subject key.
 * `DESTROYED` — use of a destroyed entity.
 */
export class RaterError extends Error {
	readonly code: RaterErrorCode
	readonly context?: Readonly<Record<string, unknown>>

	constructor(code: RaterErrorCode, message: string, context?: Readonly<Record<string, unknown>>) {
		super(message)
		this.name = 'RaterError'
		this.code = code
		this.context = context
	}
}

/** Narrow a caught value to a {@link RaterError}. */
export function isRaterError(value: unknown): value is RaterError {
	return value instanceof RaterError
}
