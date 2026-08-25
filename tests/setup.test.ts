// Proof of `tests/setup.ts` — the host-independent test infrastructure every project loads
// first. Its subject is what the consuming suites rely on: the recorder's bookkeeping, the
// freeze's reach, the overflow table's arithmetic, and the claim each scenario builder's
// documentation makes about what it rates to. Every rating expectation is taken through
// `@orkestrel/reason`'s engine and compared against a value computed from the builder's own
// arguments, so no expectation travels the route that produced it. Production behavior is
// `tests/src/core/**`'s subject and is not re-proven here.

import type { LineResult } from '@src/core'
import { describe, expect, it } from 'vitest'
import {
	createCheckFailureLine,
	createEngine,
	createLine,
	createLineResult,
	createLookupFailureLine,
	createQuoteRate,
	createStaticRate,
	createStubEngine,
	createSubject,
	createTotalRecorder,
	createWorksheet,
	deepFreeze,
	EXTREME_NUMBERS,
} from './setup.js'

describe('setup — general primitives', () => {
	it('records every handler call in order and answers with the sentinel', () => {
		const recorder = createTotalRecorder(42)
		const first: readonly LineResult[] = [createLineResult('a', 10)]
		const second: readonly LineResult[] = [createLineResult('b', 20), createLineResult('c', 30)]
		expect(recorder.count).toBe(0)
		expect(recorder.handler(first)).toBe(42)
		expect(recorder.handler(second)).toBe(42)
		expect(recorder.calls).toEqual([first, second])
		expect(recorder.count).toBe(recorder.calls.length)
	})

	it('freezes every object and array the value reaches and refuses a nested write', () => {
		const value = { name: 'root', child: { count: 1 }, list: [{ count: 2 }] }
		const frozen = deepFreeze(value)
		expect(frozen).toBe(value)
		expect([
			Object.isFrozen(frozen),
			Object.isFrozen(frozen.child),
			Object.isFrozen(frozen.list),
			Object.isFrozen(frozen.list[0]),
		]).toEqual([true, true, true, true])
		expect(() => {
			frozen.child.count = 99
		}).toThrow(TypeError)
	})

	it('returns a leaf value untouched', () => {
		expect(deepFreeze(7)).toBe(7)
		expect(deepFreeze(undefined)).toBeUndefined()
	})

	it('offers finite numbers that overflow to Infinity once accumulated', () => {
		expect(EXTREME_NUMBERS.every((entry) => Number.isFinite(entry))).toBe(true)
		expect(EXTREME_NUMBERS.reduce((total, entry) => total + entry, 0)).toBe(
			Number.POSITIVE_INFINITY,
		)
		expect(Object.isFrozen(EXTREME_NUMBERS)).toBe(true)
	})
})

describe('setup — subjects and rates', () => {
	it('builds a fresh subject whose fields the overrides replace and extend', () => {
		expect(createSubject()).toEqual({ id: 'subject-1', seats: 10 })
		expect(createSubject({ seats: 2, region: 'east' })).toEqual({
			id: 'subject-1',
			seats: 2,
			region: 'east',
		})
		expect(createSubject()).not.toBe(createSubject())
	})

	it('rates a static rate to its value whatever the subject carries', () => {
		const engine = createEngine()
		const rate = createStaticRate('flat', 7)
		const values = [
			createSubject(),
			createSubject({ seats: 999, region: 'west' }),
			{ id: 'other' },
		].map((subject) => {
			const result = engine.reason(subject, rate)
			return result.reasoning === 'quantitative' ? result.value : undefined
		})
		expect(values).toEqual([7, 7, 7])
		engine.destroy()
	})

	it('names a line for its id and rates it to the line value', () => {
		const engine = createEngine()
		const line = createLine('seat-fee', 25)
		expect([line.id, line.name, line.rate.id]).toEqual(['seat-fee', 'seat-fee', 'seat-fee'])
		const result = engine.reason(createSubject(), line.rate)
		expect(result.reasoning === 'quantitative' ? result.value : undefined).toBe(25)
		engine.destroy()
	})

	it('adds the checked seat count to the quote base and drops it when the check fails', () => {
		const engine = createEngine()
		const rate = createQuoteRate()
		const seats = 4
		const charged = engine.reason(createSubject({ seats }), rate)
		const unchecked = engine.reason(createSubject({ seats: 0 }), rate)
		const chargedValue = charged.reasoning === 'quantitative' ? charged.value : undefined
		const baseValue = unchecked.reasoning === 'quantitative' ? unchecked.value : undefined
		expect(baseValue).toBe(100)
		expect(chargedValue).toBe(100 + seats)
		expect([charged.success, unchecked.success]).toEqual([true, true])
		engine.destroy()
	})
})

describe('setup — failure scenarios', () => {
	it('fails a lookup line off the table and succeeds on a member of it', () => {
		const engine = createEngine()
		const line = createLookupFailureLine('region-fee')
		const missing = engine.reason(createSubject({ region: 'north' }), line.rate)
		const present = engine.reason(createSubject({ region: 'west' }), line.rate)
		expect(missing.success).toBe(false)
		expect(missing.errors.join(' ')).toContain('region')
		expect(present.success).toBe(true)
		expect(present.reasoning === 'quantitative' ? present.value : undefined).toBe(20)
		engine.destroy()
	})

	it('fails a checked line under the threshold and succeeds above it', () => {
		const engine = createEngine()
		const line = createCheckFailureLine('senior-fee')
		const below = engine.reason(createSubject({ age: 65 }), line.rate)
		const above = engine.reason(createSubject({ age: 66 }), line.rate)
		expect(below.success).toBe(false)
		expect(below.errors.join(' ')).toContain('flag')
		expect(above.success).toBe(true)
		expect(above.reasoning === 'quantitative' ? above.value : undefined).toBe(5)
		engine.destroy()
	})
})

describe('setup — engines', () => {
	it('registers the quantitative reasoner alone unless logical is requested', () => {
		const quantitative = createEngine()
		const both = createEngine({ logical: true })
		expect(quantitative.reasoners().map((reasoner) => reasoner.reasoning)).toEqual(['quantitative'])
		expect(quantitative.supports('logical')).toBe(false)
		expect(both.reasoners().map((reasoner) => reasoner.reasoning)).toEqual([
			'quantitative',
			'logical',
		])
		expect(both.supports('logical')).toBe(true)
		quantitative.destroy()
		both.destroy()
	})

	it('answers every stub reason call with the supplied result and stays inert elsewhere', () => {
		const engine = createEngine()
		const rate = createStaticRate('flat', 7)
		const canned = engine.reason(createSubject(), rate)
		engine.destroy()
		const stub = createStubEngine(canned)
		expect(stub.reason(createSubject({ seats: 1 }), createQuoteRate())).toBe(canned)
		expect(stub.reason([createSubject(), createSubject()], createQuoteRate())).toEqual([canned])
		expect(stub.reasoners()).toEqual([])
		expect(stub.reasoner('quantitative')).toBeUndefined()
		expect(stub.supports('quantitative')).toBe(false)
		expect(stub.validate(rate)).toEqual({ valid: true, errors: [], warnings: [] })
	})
})

describe('setup — result stubs', () => {
	it('builds a successful empty worksheet whose overrides replace only the named fields', () => {
		expect(createWorksheet()).toEqual({
			id: 'worksheet',
			name: 'Worksheet',
			aggregation: 'sum',
			value: 0,
			groups: [],
			steps: [],
			trace: [],
			errors: [],
			success: true,
		})
		const overridden = createWorksheet({ value: 3, success: false })
		expect([overridden.value, overridden.success, overridden.id]).toEqual([3, false, 'worksheet'])
	})

	it('derives line-result success from the presence of an amount', () => {
		const rated = createLineResult('rated', 5)
		const unrated = createLineResult('unrated')
		expect([rated.amount, rated.success]).toEqual([5, true])
		expect('amount' in unrated).toBe(false)
		expect(unrated.success).toBe(false)
	})
})
