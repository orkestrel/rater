// Base test setup — environment-agnostic helpers loaded first by every
// Vitest project (`setupFiles[0]`). Keep this file free of `node:*` and of
// `document` / `window` / Vue.

import type { EventMap, EmitterInterface } from '@orkestrel/emitter'
import type {
	LogicalDefinition,
	QuantitativeDefinition,
	ReasonInterface,
	Subject,
} from '@orkestrel/reason'
import type { Eligibility, LineResult, ProgramDefinition } from '@src/core'
import {
	atom,
	createLogicalReasoner,
	createQuantitativeReasoner,
	createReason,
	factorGroup,
	fieldFactor,
	logicalDefinition,
	quantitativeDefinition,
	rule,
	staticFactor,
} from '@orkestrel/reason'
import {
	aggregateDefinition,
	lineDefinition,
	noticeDefinition,
	passDefinition,
	programDefinition,
	rulingDefinition,
} from '@src/core'

// ---------------------------------------------------------------------------
// General primitives
// ---------------------------------------------------------------------------

/** A real callback that records its calls (AGENTS §16.1) — use instead of a mock. */
export interface TestRecorderInterface<TArgs extends readonly unknown[]> {
	readonly calls: readonly TArgs[]
	readonly count: number
	readonly handler: (...args: TArgs) => void
	clear(): void
}

/** Build a fresh {@link TestRecorderInterface} over the given argument tuple. */
export function createRecorder<TArgs extends readonly unknown[]>(): TestRecorderInterface<TArgs> {
	const calls: TArgs[] = []
	return {
		get calls(): readonly TArgs[] {
			return calls
		},
		get count(): number {
			return calls.length
		},
		handler: (...args: TArgs): void => {
			calls.push(args)
		},
		clear: (): void => {
			calls.length = 0
		},
	}
}

/** A recorder shaped for an `EmitterErrorHandler` (`(error, event) => void`). */
export function createErrorRecorder(): TestRecorderInterface<[error: unknown, event: string]> {
	return createRecorder<[error: unknown, event: string]>()
}

/**
 * Wire one recorder per requested event onto an emitter and return the same
 * recorders back, keyed by event name — each precisely typed to its own
 * event's argument tuple.
 */
export function recordEmitterEvents<
	TMap extends EventMap,
	TRecorders extends Partial<{ readonly [K in keyof TMap]: TestRecorderInterface<TMap[K]> }>,
>(emitter: EmitterInterface<TMap>, recorders: TRecorders): TRecorders {
	for (const key in recorders) {
		const recorder = recorders[key]
		if (recorder !== undefined) emitter.on(key, recorder.handler)
	}
	return recorders
}

/** Run `thunk`, returning the thrown value, or `undefined` when it does not throw. */
export function captureError(thunk: () => unknown): unknown {
	try {
		thunk()
		return undefined
	} catch (error) {
		return error
	}
}

/**
 * Invoke `method` with `args` bypassing TypeScript's static parameter checking —
 * for exercising runtime validation against intentionally malformed inputs a
 * correctly-typed call site could never construct.
 */
export function invokeRaw<T>(thisArg: unknown, method: unknown, args: readonly unknown[]): T {
	if (typeof method !== 'function') throw new TypeError('invokeRaw target is not callable')
	return Reflect.apply(method, thisArg, args)
}

/** A sequence of `count` numbers starting at `start` (default `0`). */
export function sequence(count: number, start = 0): readonly number[] {
	return Array.from({ length: count }, (_unused, index) => start + index)
}

/** `count` copies of `value`. */
export function repeatValue<T>(count: number, value: T): readonly T[] {
	return Array.from({ length: count }, () => value)
}

/** Finite numbers whose accumulation overflows to `Infinity`. */
export const EXTREME_NUMBERS: readonly number[] = Object.freeze([
	Number.MAX_VALUE,
	Number.MAX_VALUE,
	Number.MIN_VALUE,
	-Number.MAX_VALUE,
])

/** Adversarial and unicode string keys — prototype-pollution probes and NFC-labile pairs. */
export const TRICKY_KEYS: readonly string[] = Object.freeze([
	'',
	' ',
	'__proto__',
	'toString',
	'constructor',
	'\u212B', // ANGSTROM SIGN
	'\u00C5', // LATIN CAPITAL LETTER A WITH RING ABOVE (NFC-equivalent to the above)
	'\u{1F600}', // emoji, astral code point
	'a\u0301', // 'a' + combining acute accent (NFD form)
])

// ---------------------------------------------------------------------------
// Rater scenario builders
// ---------------------------------------------------------------------------

/** Build the shared reasoning engine a compiled `Program` / `ProgramManager` is injected with. */
export function createEngine(): ReasonInterface {
	return createReason({
		reasoners: [createQuantitativeReasoner(), createLogicalReasoner()],
		bail: false,
	})
}

/** A minimal rating subject: `seats`, `coastal`, `value`, and `location`, overridable. */
export function createRatingSubject(overrides?: Readonly<Record<string, unknown>>): Subject {
	return { id: 'subject-1', seats: 10, coastal: false, value: 10, location: 'north', ...overrides }
}

/** A quantitative line definition: `base` (100) plus `seats` — rates to 110 for the default subject. */
export function createRatingDefinition(): QuantitativeDefinition {
	return quantitativeDefinition('quote', 'Quote', [
		factorGroup('charge', 'sum', [
			staticFactor('base', 100),
			fieldFactor('seats', 'seats', { fallback: 0 }),
		]),
	])
}

/**
 * A property-style program: one logical pass, a routed ruling, and a line-scoped
 * notice with message interpolation.
 */
export function createPropertyProgramDefinition(id = 'property'): ProgramDefinition {
	const coastal: LogicalDefinition = logicalDefinition('coastal-check', 'Coastal check', [
		rule('flag-coastal', [atom('coastal', 'equals', true)], atom('flagged', 'equals', true)),
	])
	return programDefinition(
		id,
		'Property',
		[lineDefinition('line', 'Line', createRatingDefinition())],
		{
			passes: [passDefinition(coastal, 'line')],
			rulings: {
				'flag-coastal': rulingDefinition(
					'referral',
					'line',
					'Coastal surcharge on {{seats}} seats',
				),
			},
			notices: [noticeDefinition('rated', 'Rated with {{seats}} seats', 'line')],
		},
	)
}

/** An authority program: a limit rule over the outcome projection, gating the decision. */
export function createAuthorityProgramDefinition(id = 'authority'): ProgramDefinition {
	return programDefinition(
		id,
		'Authority',
		[lineDefinition('line', 'Line', createRatingDefinition())],
		{
			authority: logicalDefinition('authority', 'Authority', [
				rule(
					'needs-review',
					[atom(['outcome', 'total'], 'above', 1000)],
					atom('review', 'equals', true),
				),
			]),
			rulings: {
				'needs-review': rulingDefinition(
					'limit',
					undefined,
					'Total {{outcome.total}} needs review',
				),
			},
		},
	)
}

/** An aggregate program: a `value` sum partitioned by `location`, gated over 100. */
export function createAggregateProgramDefinition(id = 'portfolio'): ProgramDefinition {
	return programDefinition(
		id,
		'Portfolio',
		[lineDefinition('line', 'Line', createRatingDefinition())],
		{
			aggregate: aggregateDefinition(
				['value'],
				'location',
				logicalDefinition('concentration', 'Concentration', [
					rule(
						'over-limit',
						[atom(['aggregate', 'sums', 'value'], 'above', 100)],
						atom('flagged', 'equals', true),
					),
				]),
			),
			rulings: {
				'over-limit': rulingDefinition('referral', undefined, 'Sums are {{aggregate.sums.value}}'),
			},
		},
	)
}

/** A minimal `LineResult` carrying only `amount` — for `sumAmounts` edge cases. */
export function createLineResult(
	id: string,
	eligibility: Eligibility,
	amount?: number,
): LineResult {
	return {
		id,
		name: id,
		eligibility,
		...(amount === undefined ? {} : { amount }),
		determinations: [],
	}
}
