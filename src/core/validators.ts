import type { Guard } from '@orkestrel/contract'
import type {
	Evidence,
	LineDefinition,
	LineResult,
	RatingDefinition,
	RatingResult,
	Stage,
	Step,
	Worksheet,
	WorksheetFactor,
	WorksheetGroup,
} from './types.js'
import {
	arrayOf,
	isBoolean,
	isJSONValue,
	isNumber,
	isString,
	literalOf,
	objectOf,
	recordOf,
} from '@orkestrel/contract'
import {
	isAggregation,
	isComparison,
	isFieldPath,
	isQuantitativeDefinition,
} from '@orkestrel/reason'

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

/**
 * Determine whether a value is an open result-side {@link Evidence} object.
 *
 * @remarks
 * Unknown members, prototypes, and class instances are admitted. Arrays are
 * refused. `expected` and `actual` are `unknown`, so this guard does not read or
 * check them; either member may also be absent because `objectOf` reads declared
 * members rather than requiring or enumerating own keys.
 *
 * @param value - The value to test
 * @returns `true` when every checked `Evidence` member conforms
 *
 * @example
 * ```ts
 * import { isEvidence } from '@orkestrel/rater'
 *
 * isEvidence({ field: 'age', comparison: 'above', expected: 18, actual: 25, met: true }) // true
 * ```
 */
export function isEvidence(value: unknown): value is Evidence {
	return objectOf(
		{
			field: isFieldPath,
			label: isString,
			comparison: isComparison,
			met: isBoolean,
		},
		['field', 'label', 'comparison', 'met'],
	)(value)
}

/**
 * Determine whether a value is an open {@link WorksheetFactor} result object.
 *
 * @remarks
 * Unknown members, prototypes, and class instances are admitted. Arrays are
 * refused. Optional members may be absent or read as `undefined`.
 *
 * @param value - The value to test
 * @returns `true` when every published worksheet-factor member conforms
 *
 * @example
 * ```ts
 * import { isWorksheetFactor } from '@orkestrel/rater'
 *
 * isWorksheetFactor({ id: 'base', applied: true, value: 100, evidence: [] }) // true
 * ```
 */
export function isWorksheetFactor(value: unknown): value is WorksheetFactor {
	return objectOf(
		{
			id: isString,
			name: isString,
			description: isString,
			applied: isBoolean,
			value: isNumber,
			evidence: arrayOf(isEvidence),
		},
		['name', 'description', 'value'],
	)(value)
}

/**
 * Determine whether a value is an open {@link WorksheetGroup} result object.
 *
 * @remarks
 * Unknown members, prototypes, and class instances are admitted. Arrays are
 * refused. Optional members may be absent or read as `undefined`.
 *
 * @param value - The value to test
 * @returns `true` when every published worksheet-group member conforms
 *
 * @example
 * ```ts
 * import { isWorksheetGroup } from '@orkestrel/rater'
 *
 * isWorksheetGroup({ id: 'charges', applied: true, value: 100, factors: [] }) // true
 * ```
 */
export function isWorksheetGroup(value: unknown): value is WorksheetGroup {
	return objectOf(
		{
			id: isString,
			name: isString,
			description: isString,
			applied: isBoolean,
			value: isNumber,
			factors: arrayOf(isWorksheetFactor),
		},
		['name', 'description'],
	)(value)
}

/**
 * Determine whether a value is an open {@link Step} result object.
 *
 * @remarks
 * Unknown members, prototypes, and class instances are admitted. Arrays are
 * refused. Optional members may be absent or read as `undefined`.
 *
 * @param value - The value to test
 * @returns `true` when every published worksheet-step member conforms
 *
 * @example
 * ```ts
 * import { isStep } from '@orkestrel/rater'
 *
 * isStep({ stage: 'total', value: 100 }) // true
 * ```
 */
export function isStep(value: unknown): value is Step {
	return objectOf(
		{
			stage: isStage,
			id: isString,
			name: isString,
			value: isNumber,
			expression: isString,
		},
		['id', 'name', 'expression'],
	)(value)
}

/**
 * Determine whether a value is an open {@link Worksheet} result object.
 *
 * @remarks
 * Unknown members, prototypes, and class instances are admitted. Arrays are
 * refused. Optional members may be absent or read as `undefined`.
 *
 * @param value - The value to test
 * @returns `true` when every published worksheet member conforms
 *
 * @example
 * ```ts
 * import { isWorksheet } from '@orkestrel/rater'
 *
 * isWorksheet({ id: 'quote', name: 'Quote', aggregation: 'sum', value: 0, groups: [], steps: [], trace: [], errors: [], success: true }) // true
 * ```
 */
export function isWorksheet(value: unknown): value is Worksheet {
	return objectOf(
		{
			id: isString,
			name: isString,
			aggregation: isAggregation,
			precision: isNumber,
			value: isNumber,
			groups: arrayOf(isWorksheetGroup),
			steps: arrayOf(isStep),
			trace: arrayOf(isString),
			errors: arrayOf(isString),
			success: isBoolean,
		},
		['precision'],
	)(value)
}

/**
 * Determine whether a value is an open {@link LineResult} object.
 *
 * @remarks
 * Unknown members, prototypes, and class instances are admitted. Arrays are
 * refused. `amount` may be absent or read as `undefined`; when present it stays
 * a plain JavaScript `number` without a finite or range refinement.
 *
 * @param value - The value to test
 * @returns `true` when every published line-result member conforms
 *
 * @example
 * ```ts
 * import { isLineResult } from '@orkestrel/rater'
 *
 * isLineResult({ id: 'base', name: 'Base', worksheet: { id: 'base', name: 'Base', aggregation: 'sum', value: 0, groups: [], steps: [], trace: [], errors: [], success: false }, success: false }) // true
 * ```
 */
export function isLineResult(value: unknown): value is LineResult {
	return objectOf(
		{
			id: isString,
			name: isString,
			amount: isNumber,
			worksheet: isWorksheet,
			success: isBoolean,
		},
		['amount'],
	)(value)
}

/**
 * Determine whether a value is an open {@link RatingResult} object.
 *
 * @remarks
 * Use this guard for a result returned by a borrowed `RaterInterface`. Unknown
 * members, prototypes, and class instances are admitted. Arrays are refused.
 * `total` may be absent or read as `undefined`; when present it stays a plain
 * JavaScript `number` without a finite or range refinement.
 *
 * @param value - The value to test
 * @returns `true` when every published rating-result member conforms
 *
 * @example
 * ```ts
 * import { isRatingResult } from '@orkestrel/rater'
 *
 * isRatingResult({ lines: [], success: true }) // true
 * ```
 */
export function isRatingResult(value: unknown): value is RatingResult {
	return objectOf(
		{
			lines: arrayOf(isLineResult),
			total: isNumber,
			success: isBoolean,
		},
		['total'],
	)(value)
}
