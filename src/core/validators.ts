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
 * Determines whether a value is a {@link Stage} literal.
 *
 * @remarks
 * A scalar union has no open or exact axis, so this guard accepts one of the
 * `Stage` literals and leaves nothing unchecked.
 *
 * @param value - The value to test
 * @returns True if `value` is `'factor'`, `'group'`, or `'total'`; false otherwise
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
 * Determines whether a value is an exact {@link LineDefinition} record.
 *
 * @remarks
 * Every `LineDefinition` member is checked, including its quantitative
 * definition. Total guard: adversarial input (cycles, hostile prototypes)
 * returns `false`, never throws. The record shape is exact — this package owns
 * the authored input record, so an extra key fails and nothing is left
 * unchecked.
 *
 * @param value - The value to test
 * @returns True if `value` is a `LineDefinition`; false otherwise
 *
 * @example
 * ```ts
 * import { createQuantitativeDefinition } from '@orkestrel/reason'
 * import { isLineDefinition } from '@orkestrel/rater'
 *
 * isLineDefinition({ id: 'base', name: 'Base', rate: createQuantitativeDefinition('base', 'Base', []) }) // true
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
 * Determines whether a value is an exact {@link RatingDefinition} record.
 *
 * @remarks
 * Every `RatingDefinition` member is checked, including each nested line
 * definition. Total guard: adversarial input (cycles, hostile prototypes)
 * returns `false`, never throws. The record shape is exact — this package owns
 * the authored input record, so an extra key fails and nothing is left
 * unchecked.
 *
 * @param value - The value to test
 * @returns True if `value` is a `RatingDefinition`; false otherwise
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
 * Determines whether a value is an open result-side {@link Evidence} object.
 *
 * @remarks
 * Optional `field` is checked as a `FieldPath`, `label` as a string,
 * `comparison` as a `Comparison`, and `met` as a boolean, each when defined.
 * Unknown members, prototypes, and class instances are admitted. Arrays are
 * refused. `expected` and `actual` are `unknown`, so this guard does not read or
 * check them and a borrowed result is never narrowed on them; either member may
 * also be absent because `objectOf` reads declared members rather than
 * requiring or enumerating own keys.
 *
 * @param value - The value to test
 * @returns True if every checked `Evidence` member conforms; false otherwise
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
 * Determines whether a value is an open {@link WorksheetFactor} result object.
 *
 * @remarks
 * `id`, the optional authored text, `applied`, an optional plain-number
 * `value`, and each `Evidence` entry are checked. Unknown members, prototypes,
 * and class instances are admitted and left unchecked, because a borrowed
 * result implementation may add them. Arrays are refused. Optional members may
 * be absent or read as `undefined`.
 *
 * @param value - The value to test
 * @returns True if every published worksheet-factor member conforms; false otherwise
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
 * Determines whether a value is an open {@link WorksheetGroup} result object.
 *
 * @remarks
 * `id`, the optional authored text, `applied`, a plain-number `value`, and each
 * `WorksheetFactor` entry are checked. Unknown members, prototypes, and class
 * instances are admitted and left unchecked, because a borrowed result
 * implementation may add them. Arrays are refused. Optional members may be
 * absent or read as `undefined`.
 *
 * @param value - The value to test
 * @returns True if every published worksheet-group member conforms; false otherwise
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
 * Determines whether a value is an open {@link Step} result object.
 *
 * @remarks
 * `stage` is checked through `isStage`, `id`, `name`, and `expression` when
 * defined, and `value` as a plain number. Unknown members, prototypes, and
 * class instances are admitted and left unchecked, because a borrowed result
 * implementation may add them. Arrays are refused. Optional members may be
 * absent or read as `undefined`.
 *
 * @param value - The value to test
 * @returns True if every published worksheet-step member conforms; false otherwise
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
 * Determines whether a value is an open {@link Worksheet} result object.
 *
 * @remarks
 * Identity, `aggregation` through reason's `isAggregation`, an optional
 * plain-number `precision`, a plain-number `value`, the nested groups and steps,
 * `trace`, `errors`, and `success` are checked. Unknown members, prototypes, and
 * class instances are admitted and left unchecked, because a borrowed result
 * implementation may add them. Arrays are refused. Optional members may be
 * absent or read as `undefined`.
 *
 * @param value - The value to test
 * @returns True if every published worksheet member conforms; false otherwise
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
 * Determines whether a value is an open {@link LineResult} object.
 *
 * @remarks
 * Identity, an optional plain-number `amount`, and the nested `Worksheet` that
 * carries the line's outcome are checked. Unknown members, prototypes, and
 * class instances are admitted and left unchecked, because a borrowed result
 * implementation may add them, and so is the relationship between `amount` and
 * `worksheet.success`, which the published interface types independently.
 * Arrays are refused. `amount` may be absent or read as `undefined`; when
 * present it stays a plain JavaScript `number` without a finite or range
 * refinement.
 *
 * @param value - The value to test
 * @returns True if every published line-result member conforms; false otherwise
 *
 * @example
 * ```ts
 * import { isLineResult } from '@orkestrel/rater'
 *
 * isLineResult({ id: 'base', name: 'Base', worksheet: { id: 'base', name: 'Base', aggregation: 'sum', value: 0, groups: [], steps: [], trace: [], errors: [], success: false } }) // true
 * ```
 */
export function isLineResult(value: unknown): value is LineResult {
	return objectOf(
		{
			id: isString,
			name: isString,
			amount: isNumber,
			worksheet: isWorksheet,
		},
		['amount'],
	)(value)
}

/**
 * Determines whether a value is an open {@link RatingResult} object.
 *
 * @remarks
 * Use this guard for a result returned by a borrowed `RaterInterface`. Every
 * nested `LineResult`, an optional plain-number `total`, and a boolean `success`
 * are checked. Unknown members, prototypes, and class instances are admitted and
 * left unchecked, and so are the relationships among totals, lines, and success,
 * because the borrowed interface publishes only their member types. Arrays are
 * refused. `total` may be absent or read as `undefined`; when present it stays a
 * plain JavaScript `number` without a finite or range refinement.
 *
 * @param value - The value to test
 * @returns True if every published rating-result member conforms; false otherwise
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
