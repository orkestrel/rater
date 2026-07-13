import type { QuantitativeDefinition } from '@src/core'
import {
	aggregateDefinition,
	atom,
	factorGroup,
	isAggregateDefinition,
	isDecision,
	isEffect,
	isEligibility,
	isLineDefinition,
	isNotice,
	isPassDefinition,
	isProgramDefinition,
	isQuantitativeDefinition,
	isRuling,
	isRulings,
	isStage,
	isStatus,
	lineDefinition,
	logicalDefinition,
	noticeDefinition,
	passDefinition,
	programDefinition,
	quantitativeDefinition,
	rule,
	rulingDefinition,
	staticFactor,
} from '@src/core'
import { describe, expect, it } from 'vitest'
import {
	EXTREME_NUMBERS,
	SOUNDNESS_SAMPLE,
	TRICKY_KEYS,
	createAggregateProgramDefinition,
	createAuthorityProgramDefinition,
	createPropertyProgramDefinition,
	createRatingDefinition,
	sequence,
} from '../../../setup.js'

describe('literal guards — eligibility decision status effect stage', () => {
	it('accept valid literals and reject invalid values', () => {
		for (const value of ['eligible', 'ineligible', 'referral'])
			expect(isEligibility(value)).toBe(true)
		for (const value of ['approved', 'denied', 'submitted']) expect(isDecision(value)).toBe(true)
		for (const value of ['ineligible', 'referral', 'conditional', 'unrated', 'eligible'])
			expect(isStatus(value)).toBe(true)
		for (const value of ['restriction', 'referral', 'condition', 'notice', 'limit'])
			expect(isEffect(value)).toBe(true)
		for (const value of ['factor', 'group', 'total']) expect(isStage(value)).toBe(true)
		expect(isEligibility('approved')).toBe(false)
		expect(isDecision('eligible')).toBe(false)
		expect(isStatus('pending')).toBe(false)
		expect(isEffect('block')).toBe(false)
		expect(isStage('line')).toBe(false)
	})

	it('survives the adversarial soundness corpus without throwing', () => {
		for (const value of SOUNDNESS_SAMPLE) {
			expect(() => isEligibility(value)).not.toThrow()
			expect(() => isDecision(value)).not.toThrow()
			expect(() => isStatus(value)).not.toThrow()
			expect(() => isEffect(value)).not.toThrow()
			expect(() => isStage(value)).not.toThrow()
		}
	})
})

describe('definition guards — exact records', () => {
	it('accept builder outputs', () => {
		const gate = logicalDefinition('gate', 'Gate', [
			rule('r1', [atom('x', 'equals', true)], atom('ok', 'equals', true)),
		])
		expect(isRuling(rulingDefinition('referral', 'line', 'message'))).toBe(true)
		expect(isNotice(noticeDefinition('notice', 'message', 'line'))).toBe(true)
		expect(isPassDefinition(passDefinition(gate, 'line'))).toBe(true)
		expect(isLineDefinition(lineDefinition('line', 'Line', createRatingDefinition()))).toBe(true)
		expect(isAggregateDefinition(aggregateDefinition(['value'], 'location', gate))).toBe(true)
		expect(
			isProgramDefinition(
				programDefinition('p1', 'Program', {
					lines: [lineDefinition('line', 'Line', createRatingDefinition())],
				}),
			),
		).toBe(true)
		expect(isRulings({ r1: rulingDefinition('notice') })).toBe(true)
	})

	it('rejects missing required keys', () => {
		expect(isRuling({ line: 'line' })).toBe(false)
		expect(isNotice({ id: 'n1' })).toBe(false)
		expect(isPassDefinition({ line: 'line' })).toBe(false)
		expect(isLineDefinition({ id: 'line', name: 'Line' })).toBe(false)
		expect(isAggregateDefinition({ by: 'location' })).toBe(false)
		expect(isProgramDefinition({ id: 'p1', name: 'Program' })).toBe(false)
	})

	it('rejects wrong types', () => {
		expect(isRuling({ effect: 'referral', line: 7 })).toBe(false)
		expect(isNotice({ id: 'n1', message: 7 })).toBe(false)
		expect(isPassDefinition({ definition: createRatingDefinition(), line: 7 })).toBe(false)
		expect(
			isLineDefinition({ id: 'line', name: 'Line', rate: logicalDefinition('g', 'G', []) }),
		).toBe(false)
		expect(isAggregateDefinition({ fields: ['value'], gates: createRatingDefinition() })).toBe(
			false,
		)
		expect(
			isProgramDefinition({
				id: 'p1',
				name: 'Program',
				lines: [lineDefinition('line', 'Line', createRatingDefinition())],
				metadata: () => 1,
			}),
		).toBe(false)
		expect(isRulings({ r1: { effect: 'bad' } })).toBe(false)
	})

	it('rejects extra keys', () => {
		expect(isRuling({ effect: 'referral', extra: true })).toBe(false)
		expect(isNotice({ id: 'n1', message: 'message', extra: true })).toBe(false)
		expect(isPassDefinition({ definition: createRatingDefinition(), extra: true })).toBe(false)
		expect(
			isLineDefinition({ id: 'line', name: 'Line', rate: createRatingDefinition(), extra: true }),
		).toBe(false)
		expect(isAggregateDefinition({ fields: ['value'], extra: true })).toBe(false)
		expect(isProgramDefinition({ id: 'p1', name: 'Program', lines: [], extra: true })).toBe(false)
	})

	it('survives the adversarial corpus without throwing', () => {
		for (const value of SOUNDNESS_SAMPLE) {
			expect(() => isRuling(value)).not.toThrow()
			expect(() => isNotice(value)).not.toThrow()
			expect(() => isPassDefinition(value)).not.toThrow()
			expect(() => isLineDefinition(value)).not.toThrow()
			expect(() => isAggregateDefinition(value)).not.toThrow()
			expect(() => isProgramDefinition(value)).not.toThrow()
			expect(() => isRulings(value)).not.toThrow()
		}
	})
})

describe('raters guards — totality over the adversarial corpus', () => {
	const literalGuards = [isEligibility, isDecision, isStatus, isEffect, isStage]
	const recordGuards = [
		isRuling,
		isNotice,
		isPassDefinition,
		isLineDefinition,
		isAggregateDefinition,
		isProgramDefinition,
		isRulings,
	]

	it('returns a boolean for every guard on every adversarial input', () => {
		for (const guard of [...literalGuards, ...recordGuards])
			for (const value of SOUNDNESS_SAMPLE) expect(typeof guard(value)).toBe('boolean')
	})
})

describe('raters guards — every builder output round-trips through its guard', () => {
	const gate = logicalDefinition('gate', 'Gate', [
		rule('r1', [atom('x', 'equals', true)], atom('ok', 'equals', true)),
	])

	it('accepts builder output with only required keys', () => {
		expect(isRuling(rulingDefinition('referral'))).toBe(true)
		expect(isNotice(noticeDefinition('n1', 'message'))).toBe(true)
		expect(isPassDefinition(passDefinition(gate))).toBe(true)
		expect(isLineDefinition(lineDefinition('line', 'Line', createRatingDefinition()))).toBe(true)
		expect(isAggregateDefinition(aggregateDefinition(['value']))).toBe(true)
		expect(isRulings({ r1: rulingDefinition('notice') })).toBe(true)
	})

	it('accepts builder output carrying every optional key', () => {
		expect(isRuling(rulingDefinition('referral', 'line', 'message'))).toBe(true)
		expect(isNotice(noticeDefinition('n1', 'message', 'line'))).toBe(true)
		expect(isPassDefinition(passDefinition(gate, 'line'))).toBe(true)
		expect(
			isLineDefinition(
				lineDefinition('line', 'Line', createRatingDefinition(), {
					description: 'desc',
					metadata: { a: 1 },
				}),
			),
		).toBe(true)
		expect(isAggregateDefinition(aggregateDefinition(['value'], 'location', gate))).toBe(true)
	})

	it('accepts the full sample program definitions', () => {
		expect(isProgramDefinition(createPropertyProgramDefinition())).toBe(true)
		expect(isProgramDefinition(createAuthorityProgramDefinition())).toBe(true)
		expect(isProgramDefinition(createAggregateProgramDefinition())).toBe(true)
	})
})

describe('raters guards — exact-record: one stray key rejected, full key set accepted', () => {
	const gate = logicalDefinition('gate', 'Gate', [
		rule('r1', [atom('x', 'equals', true)], atom('ok', 'equals', true)),
	])

	it('rejects any single extra key beyond the declared shape', () => {
		expect(isRuling({ effect: 'referral', line: 'l', message: 'm', extra: 1 })).toBe(false)
		expect(isNotice({ id: 'n', message: 'm', line: 'l', extra: 1 })).toBe(false)
		expect(isPassDefinition({ definition: gate, line: 'l', extra: 1 })).toBe(false)
		expect(
			isLineDefinition({
				id: 'l',
				name: 'L',
				description: 'd',
				rate: createRatingDefinition(),
				metadata: null,
				extra: 1,
			}),
		).toBe(false)
		expect(
			isAggregateDefinition({ fields: ['value'], by: 'location', gates: gate, extra: 1 }),
		).toBe(false)
	})

	it('accepts exactly the required-plus-optional key set', () => {
		expect(isRuling({ effect: 'referral', line: 'l', message: 'm' })).toBe(true)
		expect(isNotice({ id: 'n', message: 'm', line: 'l' })).toBe(true)
		expect(isPassDefinition({ definition: gate, line: 'l' })).toBe(true)
		expect(
			isLineDefinition({
				id: 'l',
				name: 'L',
				description: 'd',
				rate: createRatingDefinition(),
				metadata: null,
			}),
		).toBe(true)
		expect(isAggregateDefinition({ fields: ['value'], by: 'location', gates: gate })).toBe(true)
	})

	it('rejects a program definition missing the REQUIRED lines key, accepts it once present', () => {
		expect(
			isProgramDefinition({
				id: 'p',
				name: 'P',
				description: 'd',
				passes: [],
				rulings: {},
				notices: [],
			}),
		).toBe(false)
		expect(
			isProgramDefinition({
				id: 'p',
				name: 'P',
				lines: [lineDefinition('l', 'L', createRatingDefinition())],
			}),
		).toBe(true)
	})
})

describe('raters guards — adversarial OWN keys are stray extras, inherited names are not', () => {
	it('rejects an OWN __proto__ / constructor / unicode key on an otherwise-valid record', () => {
		for (const key of TRICKY_KEYS) expect(isRuling({ effect: 'referral', [key]: 1 })).toBe(false)
	})

	it('rejects an OWN __proto__ key introduced via JSON.parse', () => {
		const withOwnProto: unknown = JSON.parse('{"effect":"referral","__proto__":{"x":1}}')
		expect(isRuling(withOwnProto)).toBe(false)
	})

	it('accepts a null-prototype record with exactly required keys, rejects it with a stray', () => {
		const clean: Record<string, unknown> = Object.create(null)
		clean.effect = 'referral'
		expect(isRuling(clean)).toBe(true)
		const strayed: Record<string, unknown> = Object.create(null)
		strayed.effect = 'referral'
		// A non-function `constructor` OWN property — the inherited type is `Function`,
		// so set it reflectively; the guard must still reject the strayed shape.
		Reflect.set(strayed, 'constructor', 1)
		expect(isRuling(strayed)).toBe(false)
	})

	it('accepts a plain valid record whose constructor / toString are only INHERITED', () => {
		expect(isRuling({ effect: 'referral' })).toBe(true)
		expect(isNotice({ id: 'n', message: 'm' })).toBe(true)
	})
})

describe('isRulings — dictionary of rulings over scale and adversarial values', () => {
	it('accepts the empty dictionary and a large generated one', () => {
		expect(isRulings({})).toBe(true)
		const many = Object.fromEntries(
			sequence(500).map((index) => [`r${index}`, rulingDefinition('notice')]),
		)
		expect(isRulings(many)).toBe(true)
	})

	it('rejects a dictionary whose value is not a ruling', () => {
		expect(isRulings({ r1: rulingDefinition('notice'), bad: 42 })).toBe(false)
		expect(isRulings({ r1: rulingDefinition('notice'), bad: 'referral' })).toBe(false)
		expect(isRulings({ r1: { effect: 'referral', stray: 1 } })).toBe(false)
	})

	it('rejects non-record containers', () => {
		expect(isRulings([rulingDefinition('notice')])).toBe(false)
		expect(isRulings(new Map())).toBe(false)
	})
})

describe('raters guards — nested reasons numeric fields inherit finite-only rejection', () => {
	const rateWith = (value: number): QuantitativeDefinition =>
		quantitativeDefinition('rate', 'Rate', [factorGroup('g', 'sum', [staticFactor('f', value)])])

	it('accepts every finite EXTREME_NUMBER in a factor value (including -0 and MAX_SAFE)', () => {
		for (const value of EXTREME_NUMBERS) {
			expect(isQuantitativeDefinition(rateWith(value))).toBe(true)
			expect(isLineDefinition(lineDefinition('l', 'L', rateWith(value)))).toBe(true)
		}
	})

	it('rejects NaN and ±Infinity in a factor value through the composed guard', () => {
		for (const value of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
			expect(isQuantitativeDefinition(rateWith(value))).toBe(false)
			expect(isLineDefinition(lineDefinition('l', 'L', rateWith(value)))).toBe(false)
		}
	})
})

describe('literal guards — reject the adversarial spread and near-miss strings', () => {
	it('rejects every adversarial sample value for all literal guards', () => {
		for (const value of SOUNDNESS_SAMPLE)
			for (const guard of [isEligibility, isDecision, isStatus, isEffect, isStage])
				expect(guard(value)).toBe(false)
	})

	it('rejects capitalized, padded, and cross-set near-miss strings', () => {
		for (const near of ['Eligible', 'ELIGIBLE', ' eligible', 'eligible ', 'eligible\n'])
			expect(isEligibility(near)).toBe(false)
		expect(isEligibility('eligible')).toBe(true)
		expect(isDecision('Approved')).toBe(false)
		expect(isStatus('Conditional')).toBe(false)
		expect(isEffect('Restriction')).toBe(false)
		expect(isStage('Factor')).toBe(false)
		expect(isEligibility('approved')).toBe(false)
		expect(isDecision('eligible')).toBe(false)
		expect(isStage('eligible')).toBe(false)
	})
})
