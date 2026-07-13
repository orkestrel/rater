import type { Guard } from '../contracts/index.js'
import type {
	AggregateDefinition,
	Decision,
	Effect,
	Eligibility,
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
} from '../contracts/index.js'
import { isFieldPath, isLogicalDefinition, isQuantitativeDefinition } from '../reasons/index.js'

/** Determine whether a value is an eligibility literal. */
export const isEligibility: Guard<Eligibility> = literalOf('eligible', 'ineligible', 'referral')

/** Determine whether a value is a decision literal. */
export const isDecision: Guard<Decision> = literalOf('approved', 'denied', 'submitted')

/** Determine whether a value is a status literal. */
export const isStatus: Guard<Status> = literalOf(
	'ineligible',
	'referral',
	'conditional',
	'unrated',
	'eligible',
)

/** Determine whether a value is an effect literal. */
export const isEffect: Guard<Effect> = literalOf(
	'restriction',
	'referral',
	'condition',
	'notice',
	'limit',
)

/** Determine whether a value is a worksheet stage literal. */
export const isStage: Guard<Stage> = literalOf('factor', 'group', 'total')

/** Determine whether a value is an exact ruling record. */
export function isRuling(value: unknown): value is Ruling {
	return recordOf({ effect: isEffect, line: isString, message: isString }, ['line', 'message'])(
		value,
	)
}

/** Determine whether a value is an exact notice record. */
export function isNotice(value: unknown): value is Notice {
	return recordOf({ id: isString, message: isString, line: isString }, ['line'])(value)
}

/** Determine whether a value is an exact pass definition record. */
export function isPassDefinition(value: unknown): value is PassDefinition {
	return recordOf(
		{ line: isString, definition: unionOf(isLogicalDefinition, isQuantitativeDefinition) },
		['line'],
	)(value)
}

/** Determine whether a value is an exact line definition record. */
export function isLineDefinition(value: unknown): value is ProgramDefinition['lines'][number] {
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

/** Determine whether a value is an exact aggregate definition record. */
export function isAggregateDefinition(value: unknown): value is AggregateDefinition {
	return recordOf({ fields: arrayOf(isFieldPath), by: isFieldPath, gates: isLogicalDefinition }, [
		'by',
		'gates',
	])(value)
}

/** Determine whether a value is a rulings record. */
export const isRulings: Guard<Readonly<Record<string, Ruling>>> = whereOf(
	isRecord,
	(record): record is Readonly<Record<string, Ruling>> => Object.values(record).every(isRuling),
)

/** Determine whether a value is an exact program definition record. */
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
