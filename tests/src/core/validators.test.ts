import { logicalDefinition } from '@orkestrel/reason'
import {
	aggregateDefinition,
	isAggregateDefinition,
	isDecision,
	isEffect,
	isEligibility,
	isLineDefinition,
	isNotice,
	isPassDefinition,
	isProgramDefinition,
	isRuling,
	isRulings,
	isStage,
	isStatus,
	lineDefinition,
	noticeDefinition,
	passDefinition,
	programDefinition,
	rulingDefinition,
} from '@src/core'
import { describe, expect, it } from 'vitest'
import { createRatingDefinition } from '../../setup.js'

describe('validators — literal guards', () => {
	it('isEligibility accepts the three eligibility literals and rejects everything else', () => {
		expect(isEligibility('eligible')).toBe(true)
		expect(isEligibility('ineligible')).toBe(true)
		expect(isEligibility('referral')).toBe(true)
		expect(isEligibility('approved')).toBe(false)
		expect(isEligibility(undefined)).toBe(false)
	})

	it('isDecision accepts the three decision literals and rejects everything else', () => {
		expect(isDecision('approved')).toBe(true)
		expect(isDecision('denied')).toBe(true)
		expect(isDecision('submitted')).toBe(true)
		expect(isDecision('eligible')).toBe(false)
	})

	it('isStatus accepts the five status literals and rejects everything else', () => {
		for (const status of ['ineligible', 'referral', 'conditional', 'unrated', 'eligible']) {
			expect(isStatus(status)).toBe(true)
		}
		expect(isStatus('active')).toBe(false)
	})

	it('isEffect accepts the five effect literals and rejects everything else', () => {
		for (const effect of ['restriction', 'referral', 'condition', 'notice', 'limit']) {
			expect(isEffect(effect)).toBe(true)
		}
		expect(isEffect('penalty')).toBe(false)
	})

	it('isStage accepts the three stage literals and rejects everything else', () => {
		expect(isStage('factor')).toBe(true)
		expect(isStage('group')).toBe(true)
		expect(isStage('total')).toBe(true)
		expect(isStage('step')).toBe(false)
	})
})

describe('validators — isRuling', () => {
	it('accepts a bare and a fully-populated ruling', () => {
		expect(isRuling(rulingDefinition('restriction'))).toBe(true)
		expect(isRuling(rulingDefinition('referral', 'line', 'Message'))).toBe(true)
	})

	it('rejects a missing effect, a wrong-typed effect, and an extra key', () => {
		expect(isRuling({})).toBe(false)
		expect(isRuling({ effect: 'unknown' })).toBe(false)
		expect(isRuling({ effect: 'restriction', extra: true })).toBe(false)
	})
})

describe('validators — isNotice', () => {
	it('accepts a line-scoped and an unscoped notice', () => {
		expect(isNotice(noticeDefinition('n1', 'Message'))).toBe(true)
		expect(isNotice(noticeDefinition('n1', 'Message', 'line'))).toBe(true)
	})

	it('rejects a missing id/message and non-string fields', () => {
		expect(isNotice({ message: 'Message' })).toBe(false)
		expect(isNotice({ id: 'n1' })).toBe(false)
		expect(isNotice({ id: 'n1', message: 5 })).toBe(false)
	})
})

describe('validators — isPassDefinition', () => {
	it('accepts a logical and a quantitative pass, scoped or unscoped', () => {
		const logical = logicalDefinition('l', 'L', [])
		const quantitative = createRatingDefinition()
		expect(isPassDefinition(passDefinition(logical))).toBe(true)
		expect(isPassDefinition(passDefinition(logical, 'line'))).toBe(true)
		expect(isPassDefinition(passDefinition(quantitative))).toBe(true)
	})

	it('rejects a definition of neither reasoning', () => {
		expect(isPassDefinition({ definition: { reasoning: 'symbolic' } })).toBe(false)
		expect(isPassDefinition({})).toBe(false)
	})
})

describe('validators — isLineDefinition', () => {
	it('accepts a minimal and a fully-populated line definition', () => {
		const rate = createRatingDefinition()
		expect(isLineDefinition(lineDefinition('line', 'Line', rate))).toBe(true)
		expect(
			isLineDefinition(
				lineDefinition('line', 'Line', rate, { description: 'd', metadata: { a: 1 } }),
			),
		).toBe(true)
	})

	it('rejects a missing rate and a non-quantitative rate', () => {
		expect(isLineDefinition({ id: 'line', name: 'Line' })).toBe(false)
		expect(
			isLineDefinition({ id: 'line', name: 'Line', rate: logicalDefinition('l', 'L', []) }),
		).toBe(false)
	})
})

describe('validators — isAggregateDefinition', () => {
	it('accepts fields-only and fully-populated aggregate definitions', () => {
		expect(isAggregateDefinition(aggregateDefinition(['amount']))).toBe(true)
		expect(
			isAggregateDefinition(
				aggregateDefinition(['amount'], 'location', logicalDefinition('g', 'G', [])),
			),
		).toBe(true)
	})

	it('rejects a non-array fields and a non-logical gates', () => {
		expect(isAggregateDefinition({ fields: 'amount' })).toBe(false)
		expect(isAggregateDefinition({ fields: ['amount'], gates: {} })).toBe(false)
	})
})

describe('validators — isRulings', () => {
	it('accepts an empty and a populated rule-id-keyed record', () => {
		expect(isRulings({})).toBe(true)
		expect(isRulings({ r1: rulingDefinition('restriction') })).toBe(true)
	})

	it('rejects a record with one malformed entry', () => {
		expect(isRulings({ r1: rulingDefinition('restriction'), r2: { effect: 'bogus' } })).toBe(false)
	})
})

describe('validators — isProgramDefinition', () => {
	it('accepts a minimal program and a fully-populated one', () => {
		expect(isProgramDefinition(programDefinition('p1', 'P1', []))).toBe(true)
		const rate = createRatingDefinition()
		const full = programDefinition('p2', 'P2', [lineDefinition('line', 'Line', rate)], {
			description: 'd',
			passes: [passDefinition(logicalDefinition('l', 'L', []), 'line')],
			rulings: { r1: rulingDefinition('restriction', 'line') },
			notices: [noticeDefinition('n1', 'Message', 'line')],
			authority: logicalDefinition('a', 'A', []),
			aggregate: aggregateDefinition(['amount']),
			metadata: { key: 'value' },
		})
		expect(isProgramDefinition(full)).toBe(true)
	})

	it('rejects a missing lines array, a function-bearing metadata, and a malformed nested line', () => {
		expect(isProgramDefinition({ id: 'p', name: 'P' })).toBe(false)
		expect(
			isProgramDefinition({ ...programDefinition('p', 'P', []), metadata: (): number => 1 }),
		).toBe(false)
		expect(isProgramDefinition({ id: 'p', name: 'P', lines: [{ id: 'l', name: 'L' }] })).toBe(false)
	})

	it('rejects a cyclic value without throwing', () => {
		const cyclic: Record<string, unknown> = { id: 'p', name: 'P', lines: [] }
		cyclic.self = cyclic
		expect(() => isProgramDefinition(cyclic)).not.toThrow()
		expect(isProgramDefinition(cyclic)).toBe(false)
	})
})
