import { check } from '@orkestrel/reason'
import {
	checkPremises,
	lineDefinition,
	premiseCheck,
	ratedLine,
	resultsWorksheet,
	sumAmounts,
	worksheetFactor,
	worksheetGroup,
	worksheetStep,
	worksheetSteps,
} from '@src/core'
import { describe, expect, it } from 'vitest'
import {
	EXTREME_NUMBERS,
	createEngine,
	createLineResult,
	createLookupFailureLine,
	createQuoteRate,
	createSubject,
} from '../../setup.js'

describe('helpers — premiseCheck and checkPremises', () => {
	it('builds one premise from a check, applying a label when provided', () => {
		const entry = check('age', 'above', 18)
		expect(premiseCheck(entry, 25, true)).toEqual({
			field: 'age',
			comparison: 'above',
			expected: 18,
			actual: 25,
			met: true,
		})
		expect(premiseCheck(entry, 25, true, { age: 'Age' }).label).toBe('Age')
	})

	it('omits met when undefined and label when unmapped', () => {
		const entry = check('age', 'above', 18)
		const premise = premiseCheck(entry, undefined, undefined)
		expect(premise).toEqual({ field: 'age', comparison: 'above', expected: 18, actual: undefined })
		expect('met' in premise).toBe(false)
		expect('label' in premise).toBe(false)
	})

	it('joins checks and results by index, tolerating a shorter results list', () => {
		const checks = [check('age', 'above', 18), check('state', 'equals', 'CA')]
		const results = [{ field: 'age', met: true, actual: 25 }]
		const premises = checkPremises(checks, results)
		expect(premises).toHaveLength(2)
		expect(premises[0]?.met).toBe(true)
		expect(premises[1]?.met).toBeUndefined()
	})

	it('returns an empty list for absent checks', () => {
		expect(checkPremises(undefined, undefined)).toEqual([])
	})
})

describe('helpers — worksheet joins', () => {
	it('joins a factor and a group to their evaluated results', () => {
		const engine = createEngine()
		const definition = createQuoteRate()
		const result = engine.reason(createSubject({ seats: 10 }), definition)
		if (result.reasoning !== 'quantitative') throw new Error('expected a quantitative result')
		const group = definition.groups[0]
		if (group === undefined) throw new Error('expected a group')
		const factor = group.factors[1]
		if (factor === undefined) throw new Error('expected a factor')
		expect(worksheetFactor(factor, result.groups[0]?.factors ?? [])).toMatchObject({
			id: 'seats',
			applied: true,
			value: 10,
		})
		expect(worksheetGroup(group, result.groups)).toMatchObject({
			id: 'charge',
			applied: true,
			value: 110,
		})
		engine.destroy()
	})

	it('threads labels into a joined factor premise', () => {
		const engine = createEngine()
		const definition = createQuoteRate()
		const result = engine.reason(createSubject({ seats: 10 }), definition)
		if (result.reasoning !== 'quantitative') throw new Error('expected a quantitative result')
		const group = definition.groups[0]
		const factor = group?.factors[1]
		if (factor === undefined) throw new Error('expected a factor')
		const joined = worksheetFactor(factor, result.groups[0]?.factors ?? [], { seats: 'Seats' })
		expect(joined.premises[0]?.label).toBe('Seats')
		engine.destroy()
	})
})

describe('helpers — worksheetStep and worksheetSteps', () => {
	it('builds a single step row', () => {
		expect(worksheetStep('total', 'quote', 'Quote', 110, 'sum = 110')).toEqual({
			stage: 'total',
			id: 'quote',
			name: 'Quote',
			value: 110,
			expression: 'sum = 110',
		})
	})

	it('orders steps as applied factors, then the group, then the total', () => {
		const engine = createEngine()
		const definition = createQuoteRate()
		const result = engine.reason(createSubject({ seats: 10 }), definition)
		if (result.reasoning !== 'quantitative') throw new Error('expected a quantitative result')
		const groups = definition.groups.map((group) => worksheetGroup(group, result.groups))
		const steps = worksheetSteps(definition, result, groups)
		expect(steps.map((step) => step.stage)).toEqual(['factor', 'factor', 'group', 'total'])
		expect(steps.at(-1)).toMatchObject({ stage: 'total', value: 110 })
		engine.destroy()
	})
})

describe('helpers — resultsWorksheet', () => {
	it('joins a definition and its result into the full audit trail, passing through trace/errors/success', () => {
		const engine = createEngine()
		const definition = createQuoteRate()
		const result = engine.reason(createSubject({ seats: 10 }), definition)
		if (result.reasoning !== 'quantitative') throw new Error('expected a quantitative result')
		const worksheet = resultsWorksheet(definition, result)
		expect(worksheet.id).toBe('quote')
		expect(worksheet.value).toBe(110)
		expect(worksheet.groups).toHaveLength(1)
		expect(worksheet.trace).toEqual(result.trace)
		expect(worksheet.errors).toEqual(result.errors)
		expect(worksheet.success).toBe(result.success)
		engine.destroy()
	})
})

describe('helpers — ratedLine', () => {
	it('carries an amount only when the evaluation succeeds', () => {
		const engine = createEngine()
		const definition = createQuoteRate()
		const line = lineDefinition('line', 'Line', definition)
		const result = engine.reason(createSubject({ seats: 10 }), definition)
		if (result.reasoning !== 'quantitative') throw new Error('expected a quantitative result')
		const rated = ratedLine(line, result)
		expect(rated).toMatchObject({ id: 'line', name: 'Line', amount: 110, success: true })
		expect(rated.worksheet.success).toBe(true)
		engine.destroy()
	})

	it('omits amount on a failed evaluation', () => {
		const engine = createEngine()
		const line = createLookupFailureLine('line')
		const result = engine.reason(createSubject({ region: 'north' }), line.rate)
		if (result.reasoning !== 'quantitative') throw new Error('expected a quantitative result')
		const rated = ratedLine(line, result)
		expect(rated.success).toBe(false)
		expect('amount' in rated).toBe(false)
		engine.destroy()
	})
})

describe('helpers — sumAmounts', () => {
	it('sums defined amounts and returns undefined when none are defined', () => {
		expect(sumAmounts([])).toBeUndefined()
		expect(sumAmounts([createLineResult('a')])).toBeUndefined()
		expect(sumAmounts([createLineResult('a', 10), createLineResult('b', 5)])).toBe(15)
	})

	it('accumulates -0 as positive zero', () => {
		expect(Object.is(sumAmounts([createLineResult('a', -0)]), 0)).toBe(true)
	})

	it('overflows finite extreme numbers to Infinity', () => {
		const lines = EXTREME_NUMBERS.map((amount, index) => createLineResult(`s${index}`, amount))
		expect(sumAmounts(lines)).toBe(Number.POSITIVE_INFINITY)
	})

	// Helper-level pin only — the shared engine fails a non-finite value before Rater
	// ever builds a LineResult, so a NaN amount cannot arise on the real rating path.
	it('poisons the sum to NaN when any line carries a NaN amount', () => {
		const lines = [createLineResult('a', 10), createLineResult('b', Number.NaN)]
		expect(sumAmounts(lines)).toBeNaN()
	})
})
