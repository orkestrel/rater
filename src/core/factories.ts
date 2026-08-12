import type { RaterInterface, RaterOptions } from './types.js'
import { Rater } from './Rater.js'

/**
 * Create a rating orchestrator.
 *
 * @param options - Optional total handler, labels, injected engine, and emitter hooks
 * @returns A {@link RaterInterface}
 *
 * @example
 * ```ts
 * import { createRater } from '@orkestrel/rater'
 *
 * const rater = createRater()
 * rater.destroy()
 * ```
 */
export function createRater(options?: RaterOptions): RaterInterface {
	return new Rater(options)
}
