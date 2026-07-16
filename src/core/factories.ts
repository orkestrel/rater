import type { QuantitativeDefinition } from '@orkestrel/reason'
import type { LineDefinition, RatingDefinition, RaterInterface, RaterOptions } from './types.js'
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

/**
 * Build a {@link LineDefinition}.
 *
 * @param id - The line id
 * @param name - The display name
 * @param rate - The line's quantitative rating definition
 * @param overrides - Optional {@link LineDefinition} fields merged over the defaults
 * @returns A fresh line definition
 *
 * @example
 * ```ts
 * import { quantitativeDefinition } from '@orkestrel/reason'
 * import { lineDefinition } from '@orkestrel/rater'
 *
 * lineDefinition('base', 'Base Amount', quantitativeDefinition('base', 'Base', []))
 * ```
 */
export function lineDefinition(
	id: string,
	name: string,
	rate: QuantitativeDefinition,
	overrides?: Partial<Omit<LineDefinition, 'id' | 'name' | 'rate'>>,
): LineDefinition {
	return { id, name, rate, ...overrides }
}

/**
 * Build a {@link RatingDefinition}.
 *
 * @param id - The rating id
 * @param name - The display name
 * @param lines - The rating's ordered lines
 * @param overrides - Optional {@link RatingDefinition} fields merged over the defaults
 * @returns A fresh rating definition
 *
 * @example
 * ```ts
 * import { lineDefinition, ratingDefinition } from '@orkestrel/rater'
 * import { quantitativeDefinition } from '@orkestrel/reason'
 *
 * ratingDefinition('r1', 'Rating', [
 * 	lineDefinition('base', 'Base Amount', quantitativeDefinition('base', 'Base', [])),
 * ])
 * ```
 */
export function ratingDefinition(
	id: string,
	name: string,
	lines: readonly LineDefinition[],
	overrides?: Partial<Omit<RatingDefinition, 'id' | 'name' | 'lines'>>,
): RatingDefinition {
	return { id, name, lines, ...overrides }
}
