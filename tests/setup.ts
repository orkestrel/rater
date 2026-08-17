// Base test setup — environment-agnostic helpers loaded first by every
// Vitest project (`setupFiles[0]`). Keep this file free of `node:*` and of
// `document` / `window` / Vue.

import type {
	Definition,
	QuantitativeDefinition,
	ReasonEventMap,
	ReasonerInterface,
	ReasonInterface,
	ReasonResult,
	ReasonValidationResult,
	Subject,
} from '@orkestrel/reason'
import type { LineDefinition, LineResult, TotalHandler, Worksheet } from '@src/core'
import { createEmitter } from '@orkestrel/emitter'
import { isArray, isRecord } from '@orkestrel/contract'
import {
	check,
	createLogicalReasoner,
	createQuantitativeReasoner,
	createReason,
	factorGroup,
	fieldFactor,
	lookupFactor,
	quantitativeDefinition,
	staticFactor,
} from '@orkestrel/reason'
import { lineDefinition } from '@src/core'

// ---------------------------------------------------------------------------
// General primitives
// ---------------------------------------------------------------------------

/** A recorder shaped for a {@link TotalHandler} — records the lines it was called with and returns a fixed sentinel. */
export interface TestTotalRecorderInterface {
	readonly calls: ReadonlyArray<readonly LineResult[]>
	readonly count: number
	readonly handler: TotalHandler
}

/** Build a {@link TestTotalRecorderInterface} that always resolves to `sentinel`. */
export function createTotalRecorder(sentinel: number): TestTotalRecorderInterface {
	const calls: Array<readonly LineResult[]> = []
	return {
		get calls(): ReadonlyArray<readonly LineResult[]> {
			return calls
		},
		get count(): number {
			return calls.length
		},
		handler: (lines: readonly LineResult[]): number => {
			calls.push(lines)
			return sentinel
		},
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

/** Recursively `Object.freeze` a value and every object/array it reaches. */
export function deepFreeze<T>(value: T): T {
	if (isArray(value)) {
		for (const item of value) deepFreeze(item)
		return Object.freeze(value)
	}
	if (isRecord(value)) {
		for (const key of Object.keys(value)) deepFreeze(value[key])
		return Object.freeze(value)
	}
	return value
}

/** Finite numbers whose accumulation overflows to `Infinity`. */
export const EXTREME_NUMBERS: readonly number[] = Object.freeze([
	Number.MAX_VALUE,
	Number.MAX_VALUE,
	Number.MIN_VALUE,
	-Number.MAX_VALUE,
])

// ---------------------------------------------------------------------------
// Rater scenario builders
// ---------------------------------------------------------------------------

/** A minimal rating subject: `id` and `seats`, overridable. */
export function createSubject(overrides?: Readonly<Record<string, unknown>>): Subject {
	return { id: 'subject-1', seats: 10, ...overrides }
}

/** A quantitative definition that always resolves to `value`, regardless of the subject. */
export function createStaticRate(id: string, value: number): QuantitativeDefinition {
	return quantitativeDefinition(id, id, [
		factorGroup('group', 'sum', [staticFactor('value', value)]),
	])
}

/** A line whose rate always resolves to `value` — for line-selection and dispatch proofs. */
export function createLine(id: string, value: number): LineDefinition {
	return lineDefinition(id, id, createStaticRate(id, value))
}

/** A quantitative definition rating `base` (100) plus `seats`, with a checked field factor. */
export function createQuoteRate(): QuantitativeDefinition {
	return quantitativeDefinition('quote', 'Quote', [
		factorGroup('charge', 'sum', [
			staticFactor('base', 100),
			fieldFactor('seats', 'seats', { fallback: 0, checks: [check('seats', 'above', 0)] }),
		]),
	])
}

/** A line whose required lookup factor fails: the subject's `region` is absent from the table and has no fallback. */
export function createLookupFailureLine(id: string): LineDefinition {
	return lineDefinition(
		id,
		id,
		quantitativeDefinition(id, id, [
			factorGroup('group', 'sum', [
				lookupFactor('region', 'region', { east: 10, west: 20 }, { required: true }),
			]),
		]),
	)
}

/** A line whose required factor fails its own check (subject `age` never clears the threshold). */
export function createCheckFailureLine(id: string): LineDefinition {
	return lineDefinition(
		id,
		id,
		quantitativeDefinition(id, id, [
			factorGroup('group', 'sum', [
				staticFactor('flag', 5, { checks: [check('age', 'above', 65)], required: true }),
			]),
		]),
	)
}

/** The shared reasoning engine a {@link RaterOptions.engine} is injected with — quantitative-only unless `logical` is requested. */
export function createEngine(options?: { readonly logical?: boolean }): ReasonInterface {
	return createReason({
		reasoners: options?.logical
			? [createQuantitativeReasoner(), createLogicalReasoner()]
			: [createQuantitativeReasoner()],
		bail: false,
	})
}

/**
 * A minimal, hostile-input-friendly {@link ReasonInterface} stub whose
 * `reason()` always resolves to the caller-supplied `result` — for exercising
 * `Rater`'s defensive handling of an untrusted injected engine. Every other
 * member is a minimal conforming no-op.
 */
export function createStubEngine<T extends ReasonResult>(result: T): ReasonInterface {
	function reason(subjects: readonly Subject[], definition: Definition): readonly ReasonResult[]
	function reason(subject: Subject, definition: Definition): ReasonResult
	function reason(input: Subject | readonly Subject[]): ReasonResult | readonly ReasonResult[] {
		return isArray(input) ? [result] : result
	}
	return {
		emitter: createEmitter<ReasonEventMap>(),
		reason,
		register: (): void => {},
		reasoner: (): ReasonerInterface | undefined => undefined,
		reasoners: (): readonly ReasonerInterface[] => [],
		supports: (): boolean => false,
		validate: (): ReasonValidationResult => ({ valid: true, errors: [], warnings: [] }),
		destroy: (): void => {},
	}
}

/** A minimal, type-shaped {@link Worksheet} stub — for line results that never touch the real engine. */
export function createWorksheet(overrides?: Partial<Worksheet>): Worksheet {
	return {
		id: 'worksheet',
		name: 'Worksheet',
		aggregation: 'sum',
		value: 0,
		groups: [],
		steps: [],
		trace: [],
		errors: [],
		success: true,
		...overrides,
	}
}

/** A minimal `LineResult` carrying only `amount` — for `sumAmounts` edge cases. */
export function createLineResult(id: string, amount?: number): LineResult {
	return {
		id,
		name: id,
		...(amount === undefined ? {} : { amount }),
		worksheet: createWorksheet(),
		success: amount !== undefined,
	}
}
