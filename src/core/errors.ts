import type { RaterErrorCode } from './types.js'

/** Coded rater programmer error. */
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

/** Narrow a caught value to {@link RaterError}. */
export function isRaterError(value: unknown): value is RaterError {
	return value instanceof RaterError
}
