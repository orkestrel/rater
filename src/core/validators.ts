import type { Guard } from '@orkestrel/contract'
import type {
	AggregateDefinition,
	Decision,
	Effect,
	Eligibility,
	LineDefinition,
	Notice,
	PassDefinition,
	ProgramDefinition,
	Ruling,
	Stage,
	Status,
} from './types.js'
import {
	arrayOf,
	isJSONValue,
	isRecord,
	isString,
	literalOf,
	recordOf,
	unionOf,
	whereOf,
} from '@orkestrel/contract'
import { isFieldPath, isLogicalDefinition, isQuantitativeDefinition } from '@orkestrel/reason'

/** Determine whether a value is an {@link Eligibility} literal. */
export const isEligibility: Guard<Eligibility> = literalOf('eligible', 'ineligible', 'referral')

/** Determine whether a value is a {@link Decision} literal. */
export const isDecision: Guard<Decision> = literalOf('approved', 'denied', 'submitted')

/** Determine whether a value is a {@link Status} literal. */
export const isStatus: Guard<Status> = literalOf(
	'ineligible',
	'referral',
	'conditional',
	'unrated',
	'eligible',
)

/** Determine whether a value is an {@link Effect} literal. */
export const isEffect: Guard<Effect> = literalOf(
	'restriction',
	'referral',
	'condition',
	'notice',
	'limit',
)

/** Determine whether a value is a {@link Stage} literal. */
export const isStage: Guard<Stage> = literalOf('factor', 'group', 'total')

/** Determine whether a value is an exact {@link Ruling} record. */
export function isRuling(value: unknown): value is Ruling {
	return recordOf({ effect: isEffect, line: isString, message: isString }, ['line', 'message'])(
		value,
	)
}

/** Determine whether a value is an exact {@link Notice} record. */
export function isNotice(value: unknown): value is Notice {
	return recordOf({ id: isString, message: isString, line: isString }, ['line'])(value)
}

/** Determine whether a value is an exact {@link PassDefinition} record. */
export function isPassDefinition(value: unknown): value is PassDefinition {
	return recordOf(
		{ line: isString, definition: unionOf(isLogicalDefinition, isQuantitativeDefinition) },
		['line'],
	)(value)
}

/** Determine whether a value is an exact {@link LineDefinition} record. */
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

/** Determine whether a value is an exact {@link AggregateDefinition} record. */
export function isAggregateDefinition(value: unknown): value is AggregateDefinition {
	return recordOf({ fields: arrayOf(isFieldPath), by: isFieldPath, gates: isLogicalDefinition }, [
		'by',
		'gates',
	])(value)
}

/** Determine whether a value is a rule-id-keyed {@link Ruling} record. */
export const isRulings: Guard<Readonly<Record<string, Ruling>>> = whereOf(
	isRecord,
	(record): record is Readonly<Record<string, Ruling>> => Object.values(record).every(isRuling),
)

/** Determine whether a value is an exact {@link ProgramDefinition} record. */
export function isProgramDefinition(value: unknown): value is ProgramDefinition {
	return recordOf(
		{
			id: isString,
			name: isString,
			description: isString,
			passes: arrayOf(isPassDefinition),
			lines: arrayOf(isLineDefinition),
			rulings: isRulings,
			notices: arrayOf(isNotice),
			authority: isLogicalDefinition,
			aggregate: isAggregateDefinition,
			metadata: isJSONValue,
		},
		['description', 'passes', 'rulings', 'notices', 'authority', 'aggregate', 'metadata'],
	)(value)
}
