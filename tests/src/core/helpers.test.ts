import { check, factorGroup, quantitativeDefinition, staticFactor } from '@orkestrel/reason'
import {
	checkEvidence,
	evidenceCheck,
	lineDefinition,
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

describe('helpers — evidenceCheck and checkEvidence', () => {
	it('builds one evidence row from a check, applying a label when provided', () => {
		const entry = check('age', 'above', 18)
		expect(evidenceCheck(entry, 25, true)).toEqual({
			field: 'age',
			comparison: 'above',
			expected: 18,
			actual: 25,
			met: true,
		})
		expect(evidenceCheck(entry, 25, true, { age: 'Age' }).label).toBe('Age')
	})

	it('omits met when undefined and label when unmapped', () => {
		const entry = check('age', 'above', 18)
		const evidence = evidenceCheck(entry, undefined, undefined)
		expect(evidence).toEqual({
			field: 'age',
			comparison: 'above',
			expected: 18,
			actual: undefined,
		})
		expect('met' in evidence).toBe(false)
		expect('label' in evidence).toBe(false)
	})

	it('joins checks and results by index, tolerating a shorter results list', () => {
		const checks = [check('age', 'above', 18), check('state', 'equals', 'CA')]
		const results = [{ field: 'age', met: true, actual: 25 }]
		const evidence = checkEvidence(checks, results)
		expect(evidence).toHaveLength(2)
		expect(evidence[0]?.met).toBe(true)
		expect(evidence[1]?.met).toBeUndefined()
	})

	it('returns an empty list for absent checks', () => {
		expect(checkEvidence(undefined, undefined)).toEqual([])
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

	it('threads labels into a joined factor evidence row', () => {
		const engine = createEngine()
		const definition = createQuoteRate()
		const result = engine.reason(createSubject({ seats: 10 }), definition)
		if (result.reasoning !== 'quantitative') throw new Error('expected a quantitative result')
		const group = definition.groups[0]
		const factor = group?.factors[1]
		if (factor === undefined) throw new Error('expected a factor')
		const joined = worksheetFactor(factor, result.groups[0]?.factors ?? [], { seats: 'Seats' })
		expect(joined.evidence[0]?.label).toBe('Seats')
		engine.destroy()
	})

	it('defaults a group with no matching result', () => {
		const group = factorGroup('empty', 'sum', [])
		const joined = worksheetGroup(group, [])
		expect(joined.applied).toBe(false)
		expect(joined.value).toBe(0)
		expect(joined.factors).toEqual([])
	})

	it('defaults a factor with no matching result, still building evidence from authored checks', () => {
		const definition = createQuoteRate()
		const group = definition.groups[0]
		const factor = group?.factors[1]
		if (factor === undefined) throw new Error('expected a factor')
		const joined = worksheetFactor(factor, [])
		expect(joined.applied).toBe(false)
		expect('value' in joined).toBe(false)
		expect(joined.evidence).toHaveLength(1)
		expect(joined.evidence[0]?.field).toBe('seats')
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

	it('emits factor rows only for applied, valued factors', () => {
		const definition = quantitativeDefinition('quote', 'Quote', [
			factorGroup('charge', 'sum', [staticFactor('base', 100)]),
		])
		const group = worksheetGroup(definition.groups[0] ?? factorGroup('charge', 'sum', []), [])
		const result = {
			reasoning: 'quantitative' as const,
			value: 0,
			groups: [],
			count: 0,
			success: false,
			trace: [],
			errors: [],
		}
		const steps = worksheetSteps(definition, result, [group])
		expect(steps.some((step) => step.stage === 'factor')).toBe(false)
		expect(steps.map((step) => step.stage)).toEqual(['group', 'total'])
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

	it('surfaces precision only when the definition sets it', () => {
		const engine = createEngine()
		const withPrecision = quantitativeDefinition(
			'quote',
			'Quote',
			[factorGroup('charge', 'sum', [staticFactor('base', 100)])],
			{ precision: 2 },
		)
		const withoutPrecision = quantitativeDefinition('quote', 'Quote', [
			factorGroup('charge', 'sum', [staticFactor('base', 100)]),
		])
		const withResult = engine.reason(createSubject(), withPrecision)
		const withoutResult = engine.reason(createSubject(), withoutPrecision)
		if (withResult.reasoning !== 'quantitative') throw new Error('expected a quantitative result')
		if (withoutResult.reasoning !== 'quantitative')
			throw new Error('expected a quantitative result')
		expect('precision' in resultsWorksheet(withPrecision, withResult)).toBe(true)
		expect('precision' in resultsWorksheet(withoutPrecision, withoutResult)).toBe(false)
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

	// Helper-level pin only — opposing infinities never arise on the real rating
	// path; this pins the actual arithmetic (Infinity + -Infinity = NaN).
	it('poisons the sum to NaN when opposing infinities are summed', () => {
		const lines = [
			createLineResult('a', Number.POSITIVE_INFINITY),
			createLineResult('b', Number.NEGATIVE_INFINITY),
		]
		expect(Number.isNaN(sumAmounts(lines))).toBe(true)
	})
})
