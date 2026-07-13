import type { Expression } from '@orkestrel/reason'
import { atom, check, compound, createEvaluator, logicalDefinition, rule } from '@orkestrel/reason'
import {
	aggregateGroups,
	aggregateProjection,
	aggregateRecord,
	aggregateSums,
	assertSubject,
	authorityToDeterminations,
	checkPremises,
	combineEligibilities,
	completeTallies,
	decideEligibility,
	deriveDeterminationEligibility,
	deriveStatus,
	describeComparison,
	describeExpression,
	describePremise,
	emptySums,
	emptyTallies,
	filterLineDeterminations,
	filterProgramDeterminations,
	findMissingLineReferences,
	findRule,
	hasReservedKey,
	interpolateMessage,
	isRaterError,
	lineDefinition,
	logicalPremises,
	noticesToDeterminations,
	outcomeProjection,
	premiseCheck,
	programDefinition,
	programResult,
	ratedLine,
	resultsWorksheet,
	rulesToDeterminations,
	sumAmounts,
	tallySubject,
	worksheetFactor,
	worksheetGroup,
	worksheetStep,
	worksheetSteps,
} from '@src/core'
import { describe, expect, it } from 'vitest'
import {
	createEngine,
	createLineResult,
	createRatingDefinition,
	createRatingSubject,
} from '../../setup.js'

describe('helpers — interpolateMessage', () => {
	it('resolves dotted paths and renders finite numbers with en-US thousands grouping', () => {
		expect(interpolateMessage('Limit is {{limit}}', { limit: 5010 })).toBe('Limit is 5,010')
		expect(interpolateMessage('{{a.b}}', { a: { b: 'nested' } })).toBe('nested')
	})

	it('renders an unresolved path as empty and coerces a non-number with String', () => {
		expect(interpolateMessage('Missing {{gone}}', {})).toBe('Missing ')
		expect(interpolateMessage('Flag {{flag}}', { flag: true })).toBe('Flag true')
	})
})

describe('helpers — describeComparison', () => {
	it('describes every comparison as a display-neutral verb phrase', () => {
		expect(describeComparison('equals')).toBe('is')
		expect(describeComparison('not')).toBe('is not')
		expect(describeComparison('above')).toBe('is more than')
		expect(describeComparison('below')).toBe('is less than')
		expect(describeComparison('from')).toBe('is at least')
		expect(describeComparison('to')).toBe('is at most')
		expect(describeComparison('any')).toBe('is any of')
		expect(describeComparison('none')).toBe('is none of')
		expect(describeComparison('between')).toBe('is between')
		expect(describeComparison('outside')).toBe('is outside')
	})
})

describe('helpers — describePremise', () => {
	it('renders a field/comparison premise with a label override', () => {
		const premise = {
			field: 'age',
			comparison: 'above' as const,
			expected: 18,
			actual: 25,
			met: true,
		}
		expect(describePremise(premise)).toBe('age is more than 18 ? met')
		expect(describePremise(premise, { age: 'Age' })).toBe('Age is more than 18 ? met')
	})

	it('falls back to description for a fieldless premise and reports unknown when met is absent', () => {
		expect(describePremise({ description: 'Custom check' })).toBe('Custom check ? unknown')
		expect(describePremise({})).toBe('Premise ? unknown')
	})
})

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

describe('helpers — describeExpression', () => {
	it('describes an atom as its premise sentence and a compound as a connective phrase', () => {
		const leaf: Expression = atom('age', 'above', 18)
		expect(describeExpression(leaf)).toBe('age is more than 18 ? unknown')
		const nested = compound('and', [leaf, atom('state', 'equals', 'CA')])
		expect(describeExpression(nested)).toBe(
			'and (age is more than 18 ? unknown, state is CA ? unknown)',
		)
	})
})

describe('helpers — logicalPremises', () => {
	it('flattens rule premises into evaluated leaves against the working subject', () => {
		const evaluator = createEvaluator()
		const gate = rule('adult', [atom('age', 'from', 18)], atom('adult', 'equals', true))
		const premises = logicalPremises(gate, { age: 25 }, evaluator)
		expect(premises).toEqual([
			{ field: 'age', comparison: 'from', expected: 18, actual: 25, met: true },
		])
	})

	it('skips an empty-array membership check as content-free', () => {
		const evaluator = createEvaluator()
		const gate = rule('none', [atom('tags', 'any', [])], atom('flag', 'equals', true))
		expect(logicalPremises(gate, { tags: [] }, evaluator)).toEqual([])
	})
})

describe('helpers — findRule', () => {
	it('finds a rule by id and returns undefined for an unknown id', () => {
		const gate = rule('adult', [atom('age', 'from', 18)], atom('adult', 'equals', true))
		const definition = logicalDefinition('gate', 'Gate', [gate])
		expect(findRule(definition, 'adult')).toBe(gate)
		expect(findRule(definition, 'missing')).toBeUndefined()
	})
})

describe('helpers — worksheet joins', () => {
	it('joins a factor and a group to their evaluated results', () => {
		const engine = createEngine()
		const definition = createRatingDefinition()
		const result = engine.reason(createRatingSubject({ seats: 10 }), definition)
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

	it('builds a step row and the ordered steps for a resolved worksheet', () => {
		expect(worksheetStep('total', 'quote', 'Quote', 110, 'sum = 110')).toEqual({
			stage: 'total',
			id: 'quote',
			name: 'Quote',
			value: 110,
			expression: 'sum = 110',
		})
		const engine = createEngine()
		const definition = createRatingDefinition()
		const result = engine.reason(createRatingSubject({ seats: 10 }), definition)
		if (result.reasoning !== 'quantitative') throw new Error('expected a quantitative result')
		const groups = definition.groups.map((group) => worksheetGroup(group, result.groups))
		const steps = worksheetSteps(definition, result, groups)
		expect(steps.map((step) => step.stage)).toEqual(['factor', 'factor', 'group', 'total'])
		expect(steps.at(-1)).toMatchObject({ stage: 'total', value: 110 })
		engine.destroy()
	})

	it('resultsWorksheet joins a definition and its result into the full audit trail', () => {
		const engine = createEngine()
		const definition = createRatingDefinition()
		const result = engine.reason(createRatingSubject({ seats: 10 }), definition)
		if (result.reasoning !== 'quantitative') throw new Error('expected a quantitative result')
		const worksheet = resultsWorksheet(definition, result)
		expect(worksheet.id).toBe('quote')
		expect(worksheet.value).toBe(110)
		expect(worksheet.groups).toHaveLength(1)
		expect(worksheet.success).toBe(true)
		engine.destroy()
	})
})

describe('helpers — rulesToDeterminations', () => {
	it('routes an applied rule through its ruling, interpolating the message', () => {
		const engine = createEngine()
		const evaluator = createEvaluator()
		const gate = rule('over', [atom('seats', 'above', 5)], atom('flag', 'equals', true))
		const definition = logicalDefinition('gate', 'Gate', [gate])
		const working = createRatingSubject({ seats: 10 })
		const result = engine.reason(working, definition)
		if (result.reasoning !== 'logical') throw new Error('expected a logical result')
		const determinations = rulesToDeterminations(
			definition,
			result,
			{ over: { effect: 'referral', line: 'line', message: 'Over with {{seats}} seats' } },
			working,
			'default',
			evaluator,
		)
		expect(determinations).toEqual([
			{
				id: 'over',
				effect: 'referral',
				applied: true,
				line: 'line',
				message: 'Over with 10 seats',
				premises: [{ field: 'seats', comparison: 'above', expected: 5, actual: 10, met: true }],
			},
		])
		engine.destroy()
	})

	it('defaults an unrouted applied rule to restriction on the pass line, and skips an unrouted unapplied rule', () => {
		const engine = createEngine()
		const evaluator = createEvaluator()
		const gate = rule('over', [atom('seats', 'above', 5)], atom('flag', 'equals', true))
		const under = rule('under', [atom('seats', 'above', 500)], atom('flag', 'equals', true))
		const definition = logicalDefinition('gate', 'Gate', [gate, under])
		const working = createRatingSubject({ seats: 10 })
		const result = engine.reason(working, definition)
		if (result.reasoning !== 'logical') throw new Error('expected a logical result')
		const determinations = rulesToDeterminations(
			definition,
			result,
			undefined,
			working,
			'default',
			evaluator,
		)
		expect(determinations).toEqual([
			{
				id: 'over',
				effect: 'restriction',
				applied: true,
				line: 'default',
				premises: [{ field: 'seats', comparison: 'above', expected: 5, actual: 10, met: true }],
			},
		])
		engine.destroy()
	})
})

describe('helpers — authorityToDeterminations', () => {
	it('converts only applied rules into limit determinations', () => {
		const engine = createEngine()
		const evaluator = createEvaluator()
		const applies = rule('big', [atom('total', 'above', 1000)], atom('big', 'equals', true))
		const skips = rule('small', [atom('total', 'above', 999999)], atom('small', 'equals', true))
		const definition = logicalDefinition('authority', 'Authority', [applies, skips])
		const working = { total: 1050 }
		const result = engine.reason(working, definition)
		if (result.reasoning !== 'logical') throw new Error('expected a logical result')
		const determinations = authorityToDeterminations(
			definition,
			result,
			{ big: { effect: 'limit', message: 'Total {{total}} needs review' } },
			working,
			evaluator,
		)
		expect(determinations).toEqual([
			{
				id: 'big',
				effect: 'limit',
				applied: true,
				message: 'Total 1,050 needs review',
				premises: [
					{ field: 'total', comparison: 'above', expected: 1000, actual: 1050, met: true },
				],
			},
		])
		engine.destroy()
	})
})

describe('helpers — noticesToDeterminations', () => {
	it('applies every notice unconditionally, interpolating against the working subject', () => {
		const determinations = noticesToDeterminations(
			[
				{ id: 'n1', message: 'Rated {{seats}} seats', line: 'line' },
				{ id: 'n2', message: 'Unscoped' },
			],
			{ seats: 10 },
		)
		expect(determinations).toEqual([
			{
				id: 'n1',
				effect: 'notice',
				applied: true,
				line: 'line',
				message: 'Rated 10 seats',
				premises: [],
			},
			{ id: 'n2', effect: 'notice', applied: true, message: 'Unscoped', premises: [] },
		])
	})

	it('returns an empty list for undefined notices', () => {
		expect(noticesToDeterminations(undefined, {})).toEqual([])
	})
})

const SAMPLE_DETERMINATIONS = [
	{ id: 'a', effect: 'restriction' as const, applied: true, line: 'line', premises: [] },
	{ id: 'b', effect: 'notice' as const, applied: true, premises: [] },
]

describe('helpers — determination filters', () => {
	it('filters to one line and to program-scoped entries', () => {
		expect(filterLineDeterminations(SAMPLE_DETERMINATIONS, 'line')).toEqual([
			SAMPLE_DETERMINATIONS[0],
		])
		expect(filterProgramDeterminations(SAMPLE_DETERMINATIONS)).toEqual([SAMPLE_DETERMINATIONS[1]])
	})
})

describe('helpers — eligibility and status derivation', () => {
	it('derives eligibility from applied effects and combines multiple eligibilities by severity', () => {
		expect(
			deriveDeterminationEligibility([
				{ id: 'r', effect: 'restriction', applied: true, premises: [] },
			]),
		).toBe('ineligible')
		expect(
			deriveDeterminationEligibility([
				{ id: 'r', effect: 'restriction', applied: false, premises: [] },
			]),
		).toBe('eligible')
		expect(
			deriveDeterminationEligibility([
				{ id: 'c', effect: 'condition', applied: true, premises: [] },
			]),
		).toBe('eligible')
		expect(combineEligibilities(['eligible', 'referral', 'ineligible'])).toBe('ineligible')
		expect(combineEligibilities([])).toBe('eligible')
	})

	it('converts eligibility to its deterministic decision', () => {
		expect(decideEligibility('eligible')).toBe('approved')
		expect(decideEligibility('ineligible')).toBe('denied')
		expect(decideEligibility('referral')).toBe('submitted')
	})

	it('derives status precedence: ineligible/referral short-circuit, then condition, unrated, eligible', () => {
		expect(deriveStatus('ineligible', [], [])).toBe('ineligible')
		expect(deriveStatus('referral', [], [])).toBe('referral')
		expect(
			deriveStatus('eligible', [{ id: 'c', effect: 'condition', applied: true, premises: [] }], []),
		).toBe('conditional')
		expect(deriveStatus('eligible', [], [createLineResult('a', 'eligible')])).toBe('unrated')
		// `createLineResult` carries no `worksheet`, which itself reads as unresolved —
		// an `eligible` status requires an amount AND a successful worksheet.
		const resolved = {
			...createLineResult('a', 'eligible', 10),
			worksheet: {
				id: 'a',
				name: 'A',
				aggregation: 'sum' as const,
				value: 10,
				groups: [],
				steps: [],
				trace: [],
				errors: [],
				success: true,
			},
		}
		expect(deriveStatus('eligible', [], [resolved])).toBe('eligible')
	})
})

describe('helpers — ratedLine', () => {
	it('builds a line result carrying the derived eligibility and worksheet', () => {
		const engine = createEngine()
		const definition = createRatingDefinition()
		const line = lineDefinition('line', 'Line', definition)
		const result = engine.reason(createRatingSubject({ seats: 10 }), definition)
		if (result.reasoning !== 'quantitative') throw new Error('expected a quantitative result')
		const rated = ratedLine(line, result, [])
		expect(rated).toMatchObject({ id: 'line', name: 'Line', eligibility: 'eligible', amount: 110 })
		expect(rated.worksheet?.success).toBe(true)
		engine.destroy()
	})
})

describe('helpers — sumAmounts', () => {
	it('sums defined amounts and returns undefined when none are defined', () => {
		expect(sumAmounts([])).toBeUndefined()
		expect(sumAmounts([createLineResult('a', 'eligible')])).toBeUndefined()
		expect(
			sumAmounts([createLineResult('a', 'eligible', 10), createLineResult('b', 'eligible', 5)]),
		).toBe(15)
	})

	it('accumulates -0 as positive zero', () => {
		expect(Object.is(sumAmounts([createLineResult('a', 'eligible', -0)]), 0)).toBe(true)
	})
})

describe('helpers — outcomeProjection and programResult', () => {
	it('projects amount-bearing lines and last-wins on duplicate line ids', () => {
		const definition = programDefinition('p', 'P', [])
		const result = programResult(
			definition,
			[createLineResult('a', 'eligible', 10), createLineResult('a', 'eligible', 20)],
			[],
			[],
			undefined,
			undefined,
			[],
			[],
		)
		// `createLineResult` carries no `worksheet` — deriveStatus therefore reads
		// the missing worksheet as unresolved and the status is `unrated`, even
		// though both amounts are defined.
		expect(outcomeProjection(result)).toEqual({
			eligibility: 'eligible',
			status: 'unrated',
			total: undefined,
			lines: { a: 20 },
		})
	})

	it('reports ineligible when every line is ineligible even with a passing scoped determination', () => {
		const definition = programDefinition('p', 'P', [])
		const line = { ...createLineResult('a', 'ineligible', 10), determinations: [] }
		const result = programResult(definition, [line], [], [], undefined, undefined, [], [])
		expect(result.eligibility).toBe('ineligible')
	})

	it('reports success false when any error accumulated or a line worksheet failed', () => {
		const definition = programDefinition('p', 'P', [])
		const erroring = programResult(definition, [], [], [], undefined, undefined, [], ['boom'])
		expect(erroring.success).toBe(false)
		const engine = createEngine()
		const rate = createRatingDefinition()
		const result = engine.reason(createRatingSubject(), rate)
		if (result.reasoning !== 'quantitative') throw new Error('expected a quantitative result')
		const worksheet = { ...resultsWorksheet(rate, result), success: false }
		const failingLine = {
			...ratedLine(lineDefinition('line', 'Line', rate), result, []),
			worksheet,
		}
		const withFailingLine = programResult(
			definition,
			[failingLine],
			[],
			[],
			undefined,
			undefined,
			[],
			[],
		)
		expect(withFailingLine.success).toBe(false)
		engine.destroy()
	})
})

describe('helpers — findMissingLineReferences', () => {
	it('collects unknown line references from passes, rulings, and notices, deduped', () => {
		const definition = programDefinition(
			'p',
			'P',
			[lineDefinition('known', 'Known', createRatingDefinition())],
			{
				rulings: { r1: { effect: 'referral', line: 'ghost' } },
				notices: [{ id: 'n1', message: 'm', line: 'ghost' }],
			},
		)
		expect(findMissingLineReferences(definition)).toEqual(['ghost'])
	})

	it('returns an empty list when every reference resolves', () => {
		const definition = programDefinition(
			'p',
			'P',
			[lineDefinition('known', 'Known', createRatingDefinition())],
			{
				rulings: { r1: { effect: 'referral', line: 'known' } },
			},
		)
		expect(findMissingLineReferences(definition)).toEqual([])
	})
})

describe('helpers — reserved keys and assertSubject', () => {
	it('detects the reserved aggregate/outcome keys at the top level only', () => {
		expect(hasReservedKey({ aggregate: 1 })).toBe(true)
		expect(hasReservedKey({ outcome: 1 })).toBe(true)
		expect(hasReservedKey({ nested: { aggregate: 1 } })).toBe(false)
		expect(hasReservedKey({})).toBe(false)
	})

	it('assertSubject narrows a valid record and throws MISMATCH otherwise', () => {
		const subject: unknown = { id: 's1' }
		assertSubject(subject)
		expect(subject.id).toBe('s1')
		let error: unknown
		try {
			assertSubject('nope')
		} catch (caught) {
			error = caught
		}
		if (!isRaterError(error)) throw new Error('expected a RaterError')
		expect(error.code).toBe('MISMATCH')
	})
})

describe('helpers — aggregate sums, groups, and projections', () => {
	it('sums fields across subjects, skipping non-finite values', () => {
		expect(
			aggregateSums(
				[{ amount: 10 }, { amount: Number.POSITIVE_INFINITY }, { amount: 20 }],
				['amount'],
			),
		).toEqual({ amount: 30 })
	})

	it('groups subjects by a partition key, blank-stringing a missing key', () => {
		const groups = aggregateGroups([{ g: 'north', amount: 1 }, { amount: 2 }], ['amount'], 'g')
		expect(groups).toEqual([
			{ key: 'north', count: 1, sums: { amount: 1 } },
			{ key: '', count: 1, sums: { amount: 2 } },
		])
	})

	it('returns no groups when partitioning is absent', () => {
		expect(aggregateGroups([{ amount: 1 }], ['amount'])).toEqual([])
	})

	it('builds the aggregate projection and the reserved-key record', () => {
		const group = { key: 'north', count: 1, sums: { amount: 1 } }
		expect(aggregateProjection(2, { amount: 30 })).toEqual({ count: 2, sums: { amount: 30 } })
		expect(aggregateProjection(2, { amount: 30 }, group)).toEqual({
			count: 2,
			sums: { amount: 30 },
			group,
		})
		expect(aggregateRecord(2, { amount: 30 })).toEqual({
			aggregate: { count: 2, sums: { amount: 30 } },
		})
	})
})

describe('helpers — tallies', () => {
	it('zeroes sums for a field set and completes a partial tally record', () => {
		expect(emptySums(['amount'])).toEqual({ amount: 0 })
		const complete = completeTallies({ eligible: { count: 2, sums: { amount: 5 } } })
		expect(Object.keys(complete)).toEqual([
			'ineligible',
			'referral',
			'conditional',
			'unrated',
			'eligible',
		])
		expect(complete.ineligible).toEqual({ count: 0, sums: {} })
		expect(complete.eligible).toEqual({ count: 2, sums: { amount: 5 } })
	})

	it('builds empty tallies in precedence order and folds a subject in by status', () => {
		const tallies = emptyTallies(['amount'])
		expect(Object.keys(tallies)).toEqual([
			'ineligible',
			'referral',
			'conditional',
			'unrated',
			'eligible',
		])
		const updated = tallySubject(tallies, 'eligible', { amount: 10 }, ['amount'])
		expect(updated.eligible).toEqual({ count: 1, sums: { amount: 10 } })
		expect(updated.ineligible).toEqual({ count: 0, sums: { amount: 0 } })
		const second = tallySubject(updated, 'eligible', { amount: 5 }, ['amount'])
		expect(second.eligible).toEqual({ count: 2, sums: { amount: 15 } })
	})
})
