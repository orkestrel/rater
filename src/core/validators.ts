import type { Guard } from '@orkestrel/contract'
import type { LineDefinition, RatingDefinition, Stage } from './types.js'
import { arrayOf, isJSONValue, isString, literalOf, recordOf } from '@orkestrel/contract'
import { isQuantitativeDefinition } from '@orkestrel/reason'

/**
 * Determine whether a value is a {@link Stage} literal.
 *
 * @param value - The value to test
 * @returns `true` when `value` is `'factor'`, `'group'`, or `'total'`
 *
 * @example
 * ```ts
 * import { isStage } from '@orkestrel/rater'
 *
 * isStage('group') // true
 * isStage('step') // false
 * ```
 */
export const isStage: Guard<Stage> = literalOf('factor', 'group', 'total')

/**
 * Determine whether a value is an exact {@link LineDefinition} record.
 *
 * @remarks
 * Total guard (AGENTS §14): adversarial input (cycles, hostile prototypes)
 * returns `false`, never throws. The record shape is EXACT — an extra key fails.
 *
 * @param value - The value to test
 * @returns `true` when `value` is a `LineDefinition`
 *
 * @example
 * ```ts
 * import { quantitativeDefinition } from '@orkestrel/reason'
 * import { isLineDefinition } from '@orkestrel/rater'
 *
 * isLineDefinition({ id: 'base', name: 'Base', rate: quantitativeDefinition('base', 'Base', []) }) // true
 * ```
 */
export function isLineDefinition(value: unknown): value is LineDefinition {
	return recordOf(
		{
			id: isString,
			name: isString,
			description: isString,
			rate: isQuantitativeDefinition,
			metadata: isJSONValue,
		},
		['description', 'metadata'],
	)(value)
}

/**
 * Determine whether a value is an exact {@link RatingDefinition} record.
 *
 * @remarks
 * Total guard (AGENTS §14): adversarial input (cycles, hostile prototypes)
 * returns `false`, never throws. The record shape is EXACT — an extra key fails.
 *
 * @param value - The value to test
 * @returns `true` when `value` is a `RatingDefinition`
 *
 * @example
 * ```ts
 * import { isRatingDefinition } from '@orkestrel/rater'
 *
 * isRatingDefinition({ id: 'r1', name: 'Rating', lines: [] }) // true
 * ```
 */
export function isRatingDefinition(value: unknown): value is RatingDefinition {
	return recordOf(
		{
			id: isString,
			name: isString,
			description: isString,
			lines: arrayOf(isLineDefinition),
			metadata: isJSONValue,
		},
		['description', 'metadata'],
	)(value)
}
