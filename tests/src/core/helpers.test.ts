import type {
	Determination,
	Expression,
	LogicalResult,
	QuantitativeResult,
	Status,
} from '@src/core'
import {
	aggregateDefinition,
	aggregateGroups,
	aggregateProjection,
	aggregateRecord,
	aggregateSums,
	appendDeterminations,
	assertSubject,
	atom,
	authorityToDeterminations,
	check,
	checkPremises,
	combineEligibilities,
	completeTallies,
	compound,
	decideEligibility,
	deriveDeterminationEligibility,
	deriveStatus,
	describeComparison,
	describeExpression,
	describePremise,
	emptySums,
	emptyTallies,
	factorGroup,
	fieldFactor,
	filterLineDeterminations,
	filterProgramDeterminations,
	findMissingLineReferences,
	findRule,
	freezeProgramDefinition,
	hasReservedKey,
	isAggregateDefinition,
	isLineDefinition,
	isNotice,
	isPassDefinition,
	isProgramDefinition,
	isRaterError,
	isRuling,
	lineDefinition,
	logicalDefinition,
	logicalFailure,
	logicalPremises,
	mergeConclusion,
	noticeDefinition,
	noticesToDeterminations,
	outcomeProjection,
	passDefinition,
	premiseCheck,
	programDefinition,
	programResult,
	quantitativeDefinition,
	quantitativeFailure,
	ratedLine,
	rule,
	rulesToDeterminations,
	rulingDefinition,
	sumAmounts,
	tallySubject,
	unratedLine,
	worksheetFactor,
	worksheetGroup,
	worksheetStep,
	worksheetSteps,
	resultsWorksheet,
} from '@src/core'
import { describe, expect, it } from 'vitest'
import {
	captureError,
	createLineResult,
	createRatingDefinition,
	EXTREME_NUMBERS,
	isDeeplyFrozen,
	repeatValue,
	sequence,
	TRICKY_KEYS,
} from '../../../setup.js'

describe('builders — exact definitions', () => {
	it('builds program, line, pass, ruling, notice, and aggregate records that satisfy guards', () => {
		const rate = createRatingDefinition()
		const gate = logicalDefinition('gate', 'Gate', [
			rule('r1', [atom('x', 'equals', true)], atom('ok', 'equals', true)),
		])
		const line = lineDefinition('line', 'Line', rate, {
			description: 'desc',
			metadata: { tier: 'a' },
		})
		const pass = passDefinition(gate, 'line')
		const ruling = rulingDefinition('condition', 'line', 'Message {{x}}')
		const notice = noticeDefinition('n1', 'Notice {{x}}', 'line')
		const aggregate = aggregateDefinition(['value'], 'location', gate)
		const program = programDefinition('p1', 'Program', {
			description: 'desc',
			passes: [pass],
			lines: [line],
			rulings: { r1: ruling },
			notices: [notice],
			authority: gate,
			aggregate,
			metadata: { version: 1 },
		})

		expect(isLineDefinition(line)).toBe(true)
		expect(isPassDefinition(pass)).toBe(true)
		expect(isRuling(ruling)).toBe(true)
		expect(isNotice(notice)).toBe(true)
		expect(isAggregateDefinition(aggregate)).toBe(true)
		expect(isProgramDefinition(program)).toBe(true)
		expect(Object.keys(programDefinition('empty', 'Empty')).sort()).toEqual(['id', 'lines', 'name'])
	})

	it('omits undefined optional keys instead of writing undefined values', () => {
		expect(Object.keys(rulingDefinition('notice'))).toEqual(['effect'])
		expect(Object.keys(noticeDefinition('n1', 'Notice'))).toEqual(['id', 'message'])
		expect(Object.keys(aggregateDefinition(['value']))).toEqual(['fields'])
	})
})

describe('eligibility helpers — precedence and status', () => {
	it('maps eligibility to decisions and combines by severity', () => {
		expect(decideEligibility('eligible')).toBe('approved')
		expect(decideEligibility('ineligible')).toBe('denied')
		expect(decideEligibility('referral')).toBe('submitted')
		expect(combineEligibilities([])).toBe('eligible')
		expect(combineEligibilities(['eligible', 'referral'])).toBe('referral')
		expect(combineEligibilities(['eligible', 'ineligible', 'referral'])).toBe('ineligible')
	})

	it('derives all status branches', () => {
		const good = createLineResult('l1', 'eligible', 10)
		expect(deriveStatus('ineligible', [], [good])).toBe('ineligible')
		expect(deriveStatus('referral', [], [good])).toBe('referral')
		expect(deriveStatus('eligible', [determination('c1', 'condition', true)], [good])).toBe(
			'conditional',
		)
		expect(deriveStatus('eligible', [], [createLineResult('l1', 'eligible')])).toBe('unrated')
		expect(deriveStatus('eligible', [], [good])).toBe('eligible')
	})

	it('derives determination eligibility from applied effects only', () => {
		expect(deriveDeterminationEligibility([determination('r1', 'restriction', true)])).toBe(
			'ineligible',
		)
		expect(deriveDeterminationEligibility([determination('r1', 'referral', true)])).toBe('referral')
		expect(deriveDeterminationEligibility([determination('r1', 'restriction', false)])).toBe(
			'eligible',
		)
	})
})

describe('message and premise helpers — display-neutral evidence', () => {
	it('describes comparisons, premises, and compound expressions', () => {
		const premise = premiseCheck(check('age', 'from', 18), 21, true, { age: 'Driver age' })
		expect(describeComparison('above')).toBe('is more than')
		expect(describePremise(premise)).toBe('Driver age is at least 18 ? met')
		expect(describePremise({ description: 'Compound gate', met: false })).toBe(
			'Compound gate ? not met',
		)
		expect(describeExpression(atom('age', 'from', 18), { age: 'Age' })).toBe(
			'Age is at least 18 ? unknown',
		)
		expect(
			describeExpression({
				form: 'compound',
				operator: 'and',
				operands: [atom('age', 'from', 18)],
			}),
		).toBe('and (age is at least 18 ? unknown)')
	})

	it('creates one premise per authored check and compound premise without atom fields', () => {
		const first = check('age', 'from', 18)
		const premises = checkPremises([first], [{ field: 'age', met: true, actual: 30 }])
		expect(premises).toEqual([
			{ field: 'age', comparison: 'from', expected: 18, actual: 30, met: true },
		])
		const authored = rule(
			'r1',
			[{ form: 'compound', operator: 'and', operands: [atom('age', 'from', 18)] }],
			atom('ok', 'equals', true),
		)
		const logical = logicalPremises(
			authored,
			{ id: 'r1', applied: true, premises: [true], conclusion: true },
			{ age: 30 },
		)
		expect(logical).toEqual([{ description: 'and (age is at least 18 ? unknown)', met: true }])
	})

	it('skips a vacuous empty-array membership atom but keeps a non-empty one', () => {
		const noneEmpty = rule('r2', [atom('total', 'none', [])], atom('gate-r2', 'equals', true))
		expect(
			logicalPremises(
				noneEmpty,
				{ id: 'r2', applied: true, premises: [true], conclusion: true },
				{},
			),
		).toEqual([])

		const anyEmpty = rule('r3', [atom('total', 'any', [])], atom('gate-r3', 'equals', true))
		expect(
			logicalPremises(
				anyEmpty,
				{ id: 'r3', applied: true, premises: [true], conclusion: true },
				{},
			),
		).toEqual([])

		const noneFilled = rule(
			'r4',
			[atom('occupancy', 'none', ['Office', 'Retail'])],
			atom('gate-r4', 'equals', true),
		)
		expect(
			logicalPremises(
				noneFilled,
				{ id: 'r4', applied: true, premises: [true], conclusion: true },
				{ occupancy: 'Warehouse' },
			),
		).toEqual([
			{
				field: 'occupancy',
				comparison: 'none',
				expected: ['Office', 'Retail'],
				actual: 'Warehouse',
				met: true,
			},
		])
	})
})

describe('worksheet helpers — quantitative joins', () => {
	it('joins groups, factors, steps, trace, errors, and labels', () => {
		const definition = quantitativeDefinition('rate', 'Rate', [
			factorGroup('g1', 'sum', [
				fieldFactor('value', 'value', { checks: [check('value', 'from', 0)] }),
			]),
		])
		const result: QuantitativeResult = {
			reasoning: 'quantitative',
			value: 25,
			groups: [
				{
					id: 'g1',
					applied: true,
					value: 25,
					factors: [
						{
							id: 'value',
							applied: true,
							value: 25,
							checks: [{ field: 'value', actual: 25, met: true }],
						},
					],
				},
			],
			count: 1,
			success: true,
			trace: ['ok'],
			errors: [],
		}
		const worksheet = resultsWorksheet(definition, result, { value: 'Value' })
		expect(worksheet.groups[0]).toEqual({
			id: 'g1',
			name: 'g1',
			applied: true,
			value: 25,
			factors: [
				{
					id: 'value',
					name: 'value',
					applied: true,
					value: 25,
					premises: [
						{
							field: 'value',
							label: 'Value',
							comparison: 'from',
							expected: 0,
							actual: 25,
							met: true,
						},
					],
				},
			],
		})
		expect(worksheet.steps.map((step) => step.stage)).toEqual(['factor', 'group', 'total'])
		expect(worksheet.trace).toEqual(['ok'])
	})

	it('builds standalone worksheet pieces with missing results defaulted', () => {
		const rate = createRatingDefinition()
		const group = worksheetGroup(rate.groups[0], [])
		const factor = worksheetFactor(rate.groups[0].factors[0], [])
		expect(group.applied).toBe(false)
		expect(group.value).toBe(0)
		expect(factor.applied).toBe(false)
		expect(
			worksheetSteps(
				rate,
				{
					reasoning: 'quantitative',
					value: 10,
					groups: [],
					count: 0,
					success: true,
					trace: [],
					errors: [],
				},
				[group],
			),
		).toHaveLength(2)
		expect(worksheetStep('total', undefined, undefined, 10, 'sum = 10')).toEqual({
			stage: 'total',
			value: 10,
			expression: 'sum = 10',
		})
	})
})

describe('logical determination helpers — routing and projections', () => {
	it('merges equals conclusions and finds rules', () => {
		const record: Record<string, unknown> = {}
		const authored = rule('r1', [], {
			form: 'compound',
			operator: 'and',
			operands: [atom('ok', 'equals', true), atom('ignored', 'above', 1)],
		})
		mergeConclusion(record, authored)
		expect(record).toEqual({ ok: true })
		expect(findRule(logicalDefinition('d', 'D', [authored]), 'r1')).toEqual(authored)
		expect(findRule(logicalDefinition('d', 'D', []), 'missing')).toBeUndefined()
	})

	it('converts rule results, authority, and notices into placed determinations', () => {
		const gate = logicalDefinition('gate', 'Gate', [
			rule('r1', [atom('value', 'above', 10)], atom('r1', 'equals', true)),
		])
		const result: LogicalResult = {
			reasoning: 'logical',
			conclusion: true,
			rules: [{ id: 'r1', applied: true, premises: [true], conclusion: true }],
			count: 1,
			success: true,
			trace: [],
			errors: [],
		}
		const routed = rulesToDeterminations(
			gate,
			result,
			{ r1: rulingDefinition('referral', 'line', 'Value {{value}}') },
			{ value: 20 },
			undefined,
		)
		const authority = authorityToDeterminations(
			gate,
			result,
			{ r1: rulingDefinition('limit', undefined, 'Limit {{value}}') },
			{ value: 20 },
		)
		const notices = noticesToDeterminations([noticeDefinition('n1', 'Notice {{value}}', 'line')], {
			value: 20,
		})
		expect(routed[0]).toEqual({
			id: 'r1',
			effect: 'referral',
			applied: true,
			line: 'line',
			message: 'Value 20',
			premises: [{ field: 'value', comparison: 'above', expected: 10, actual: 20, met: true }],
		})
		expect(authority[0].effect).toBe('limit')
		expect(notices[0]).toEqual({
			id: 'n1',
			effect: 'notice',
			applied: true,
			line: 'line',
			message: 'Notice 20',
			premises: [],
		})
	})

	it('filters line and program determinations', () => {
		const determinations = [
			determination('line', 'notice', true, 'l1'),
			determination('program', 'notice', true),
		]
		expect(filterLineDeterminations(determinations, 'l1')).toEqual([determinations[0]])
		expect(filterProgramDeterminations(determinations)).toEqual([determinations[1]])
	})
})

describe('line and program result helpers — immutable outcome construction', () => {
	it('builds unrated and rated lines, sums amounts, and projects outcomes', () => {
		const definition = lineDefinition('l1', 'Line', createRatingDefinition())
		const unrated = unratedLine(definition, [determination('r1', 'restriction', true)])
		const rated = ratedLine(
			definition,
			{
				reasoning: 'quantitative',
				value: 12,
				groups: [],
				count: 0,
				success: true,
				trace: [],
				errors: [],
			},
			[],
		)
		const program = programResult(
			programDefinition('p1', 'Program', { lines: [definition] }),
			[rated],
			[],
			[],
			sumAmounts([rated]),
			[],
			[],
		)
		expect(unrated.eligibility).toBe('ineligible')
		expect(rated.amount).toBe(12)
		expect(sumAmounts([])).toBeUndefined()
		expect(sumAmounts([unrated, rated])).toBe(12)
		expect(outcomeProjection(program)).toEqual({
			eligibility: 'eligible',
			status: 'eligible',
			total: 12,
			lines: { l1: 12 },
		})
	})

	it('appends late determinations to program and line placement with decision and errors', () => {
		const base = programResult(
			programDefinition('p1', 'Program'),
			[createLineResult('l1', 'eligible', 10)],
			[],
			[],
			10,
			['base'],
			[],
		)
		const appended = appendDeterminations(
			base,
			[determination('limit', 'limit', true), determination('line', 'limit', true, 'l1')],
			'approved',
			['auth'],
			['warn'],
		)
		expect(appended.decision).toBe('approved')
		expect(appended.determinations).toHaveLength(1)
		expect(appended.lines[0].determinations).toHaveLength(1)
		expect(appended.success).toBe(false)
		expect(appended.trace).toEqual(['base', 'auth'])
	})
})

describe('aggregate helpers — sums, groups, projections, and tallies', () => {
	it('sums finite fields, ignores missing and NaN, and coerces group keys', () => {
		const subjects = [
			{ value: 10, nested: { amount: 2 }, location: 'north' },
			{ value: Number.NaN },
			{ value: 5, location: 7 },
		]
		expect(aggregateSums(subjects, ['value', ['nested', 'amount']])).toEqual({
			value: 15,
			'nested.amount': 2,
		})
		expect(aggregateGroups(subjects, ['value'], 'location')).toEqual([
			{ key: 'north', count: 1, sums: { value: 10 } },
			{ key: '', count: 1, sums: { value: 0 } },
			{ key: '7', count: 1, sums: { value: 5 } },
		])
		expect(
			aggregateProjection(3, { value: 15 }, { key: 'north', count: 1, sums: { value: 10 } }),
		).toEqual({
			count: 3,
			sums: { value: 15 },
			group: { key: 'north', count: 1, sums: { value: 10 } },
		})
		expect(aggregateRecord(3, { value: 15 })).toEqual({
			aggregate: { count: 3, sums: { value: 15 } },
		})
	})

	it('builds empty, complete, and updated tallies without mutating the prior tally', () => {
		const tallies = emptyTallies(['value'])
		const updated = tallySubject(tallies, 'eligible', { value: 10 }, ['value'])
		expect(emptySums(['value', ['nested', 'amount']])).toEqual({ value: 0, 'nested.amount': 0 })
		expect(completeTallies({ referral: { count: 2, sums: { value: 5 } } }).referral).toEqual({
			count: 2,
			sums: { value: 5 },
		})
		for (const status of statuses()) expect(tallies[status].count).toBe(0)
		expect(updated.eligible).toEqual({ count: 1, sums: { value: 10 } })
		expect(tallies.eligible).toEqual({ count: 0, sums: { value: 0 } })
	})
})

describe('definition safety helpers — freezing and references', () => {
	it('deep-freezes cloned definitions', () => {
		const definition = programDefinition('p1', 'Program', {
			lines: [lineDefinition('l1', 'Line', createRatingDefinition())],
		})
		const frozen = freezeProgramDefinition(definition)
		expect(Object.isFrozen(frozen)).toBe(true)
		expect(Object.isFrozen(frozen.lines)).toBe(true)
	})

	it('detects reserved keys and reports missing line references', () => {
		expect(hasReservedKey({ aggregate: {} })).toBe(true)
		expect(hasReservedKey({ outcome: {} })).toBe(true)
		expect(hasReservedKey({ value: 1 })).toBe(false)
		const definition = programDefinition('p1', 'Program', {
			passes: [passDefinition(logicalDefinition('g', 'G', []), 'missing-pass')],
			rulings: { r1: rulingDefinition('notice', 'missing-ruling') },
			notices: [noticeDefinition('n1', 'Notice', 'missing-notice')],
			lines: [lineDefinition('l1', 'Line', createRatingDefinition())],
		})
		expect([...findMissingLineReferences(definition)].sort()).toEqual([
			'missing-notice',
			'missing-pass',
			'missing-ruling',
		])
	})
})

function determination(
	id: string,
	effect: Determination['effect'],
	applied: boolean,
	lineId?: string,
): Determination {
	return { id, effect, applied, ...(lineId === undefined ? {} : { line: lineId }), premises: [] }
}

function statuses(): readonly Status[] {
	return ['ineligible', 'referral', 'conditional', 'unrated', 'eligible']
}

describe('aggregateSums — numeric quirks and IEEE accumulation', () => {
	it('skips non-finite field values while summing finite ones', () => {
		const subjects = [
			{ value: Number.POSITIVE_INFINITY },
			{ value: Number.NEGATIVE_INFINITY },
			{ value: Number.NaN },
			{ value: 10 },
			{ value: 5 },
		]
		expect(aggregateSums(subjects, ['value'])).toEqual({ value: 15 })
	})

	it('normalizes a lone −0 addend to +0', () => {
		const sum = aggregateSums([{ value: -0 }], ['value']).value
		expect(Object.is(sum, 0)).toBe(true)
		expect(Object.is(sum, -0)).toBe(false)
	})

	it('reproduces real IEEE-754 accumulation at boundary magnitudes', () => {
		expect(
			aggregateSums([{ value: Number.MAX_SAFE_INTEGER }, { value: 1 }, { value: 1 }], ['value'])
				.value,
		).toBe(2 ** 53)
		expect(aggregateSums([{ value: 1e16 }, { value: 1 }, { value: -1e16 }], ['value']).value).toBe(
			0,
		)
		expect(aggregateSums([{ value: 0.1 }, { value: 0.2 }], ['value']).value).toBe(
			0.30000000000000004,
		)
		expect(aggregateSums([{ value: Number.MIN_VALUE }], ['value']).value).toBe(Number.MIN_VALUE)
		expect(
			aggregateSums([{ value: Number.MAX_VALUE }, { value: Number.MIN_VALUE }], ['value']).value,
		).toBe(Number.MAX_VALUE)
	})

	it('sums the EXTREME_NUMBERS fixture, overflowing the accumulator to +Infinity', () => {
		const subjects = EXTREME_NUMBERS.map((value) => ({ value }))
		const sum = aggregateSums(subjects, ['value']).value
		expect(Number.isFinite(sum)).toBe(false)
		expect(sum).toBe(Number.POSITIVE_INFINITY)
	})

	it('treats a dotted string field as ONE key and an array path as a descent', () => {
		const subject = { 'a.b': 5, a: { b: 99 } }
		expect(aggregateSums([subject], ['a.b'])).toEqual({ 'a.b': 5 })
		expect(aggregateSums([subject], [['a', 'b']])).toEqual({ 'a.b': 99 })
	})
})

describe('aggregateGroups — key coercion and first-seen ordering', () => {
	it('coerces group-by values via String(value ?? "") and merges colliding keys', () => {
		const subjects = [
			{ value: 1, k: true },
			{ value: 2, k: false },
			{ value: 4, k: null },
			{ value: 8 },
			{ value: 16, k: Number.NaN },
			{ value: 32, k: 7 },
			{ value: 64, k: '7' },
			{ value: 128, k: 7n },
			{ value: 256, k: -0 },
			{ value: 512, k: 0 },
		]
		expect(aggregateGroups(subjects, ['value'], 'k')).toEqual([
			{ key: 'true', count: 1, sums: { value: 1 } },
			{ key: 'false', count: 1, sums: { value: 2 } },
			{ key: '', count: 2, sums: { value: 12 } },
			{ key: 'NaN', count: 1, sums: { value: 16 } },
			{ key: '7', count: 3, sums: { value: 224 } },
			{ key: '0', count: 2, sums: { value: 768 } },
		])
	})

	it('groups by adversarial and unicode keys preserving first-seen order', () => {
		const subjects = TRICKY_KEYS.map((k, index) => ({ value: index, k }))
		const groups = aggregateGroups(subjects, ['value'], 'k')
		expect(groups.map((group) => group.key)).toEqual([...TRICKY_KEYS])
		expect(groups.every((group) => group.count === 1)).toBe(true)
		expect(Object.hasOwn(Object.prototype, 'value')).toBe(false)
	})
})

describe('aggregate and tally at scale — exact accumulation and stable ordering', () => {
	it('sums and groups a thousand generated subjects with exact totals and first-seen key order', () => {
		const subjects = sequence(1000).map((value) => ({ value, bucket: value % 10 }))
		expect(aggregateSums(subjects, ['value'])).toEqual({ value: 499500 })
		const uniform = repeatValue(1000, { value: 2 })
		expect(aggregateSums(uniform, ['value'])).toEqual({ value: 2000 })
		const groups = aggregateGroups(subjects, ['value'], 'bucket')
		expect(groups.map((group) => group.key)).toEqual([
			'0',
			'1',
			'2',
			'3',
			'4',
			'5',
			'6',
			'7',
			'8',
			'9',
		])
		expect(groups.every((group) => group.count === 100)).toBe(true)
		expect(groups[0]).toEqual({
			key: '0',
			count: 100,
			sums: { value: sequence(100).reduce((total, index) => total + index * 10, 0) },
		})
	})

	it('folds a thousand subjects into a single status tally without losing precision', () => {
		const folded = sequence(1000)
			.map((value) => ({ value }))
			.reduce(
				(tallies, subject) => tallySubject(tallies, 'eligible', subject, ['value']),
				emptyTallies(['value']),
			)
		expect(folded.eligible).toEqual({ count: 1000, sums: { value: 499500 } })
		expect(folded.ineligible.count).toBe(0)
		expect(folded.referral.count).toBe(0)
		expect(folded.conditional.count).toBe(0)
		expect(folded.unrated.count).toBe(0)
	})
})

describe('sumAmounts — extreme, signed-zero, and non-finite amounts', () => {
	it('sums defined amounts without a finite filter and normalizes signed zero', () => {
		expect(sumAmounts([])).toBeUndefined()
		expect(Object.is(sumAmounts([createLineResult('a', 'eligible', 0)]), 0)).toBe(true)
		expect(Object.is(sumAmounts([createLineResult('a', 'eligible', -0)]), 0)).toBe(true)
		expect(
			sumAmounts([createLineResult('a', 'eligible', 0.1), createLineResult('b', 'eligible', 0.2)]),
		).toBe(0.30000000000000004)
		expect(
			sumAmounts([
				createLineResult('a', 'eligible', Number.POSITIVE_INFINITY),
				createLineResult('b', 'eligible', 1),
			]),
		).toBe(Number.POSITIVE_INFINITY)
		expect(Number.isNaN(sumAmounts([createLineResult('a', 'eligible', Number.NaN)]))).toBe(true)
	})
})

describe('mergeConclusion — prototype-pollution safety', () => {
	it('writes a string __proto__ / constructor equals-atom without polluting Object.prototype', () => {
		const protoRecord: Record<string, unknown> = {}
		mergeConclusion(protoRecord, rule('r', [], atom('__proto__', 'equals', { polluted: true })))
		const constructorRecord: Record<string, unknown> = {}
		mergeConclusion(constructorRecord, rule('r', [], atom('constructor', 'equals', 123)))
		const fresh: Record<string, unknown> = {}
		expect(Object.hasOwn(Object.prototype, 'polluted')).toBe(false)
		expect(fresh.polluted).toBeUndefined()
		expect(Object.hasOwn(constructorRecord, 'constructor')).toBe(true)
		expect(constructorRecord.constructor).toBe(123)
		expect(fresh.constructor).toBe(Object)
	})

	it('ignores non-equals conclusion atoms on reserved keys', () => {
		const record: Record<string, unknown> = {}
		mergeConclusion(record, rule('r', [], atom('__proto__', 'above', 1)))
		expect(Object.keys(record)).toEqual([])
		expect(Object.getPrototypeOf(record)).toBe(Object.prototype)
	})

	it('does not pollute Object.prototype via an array __proto__ field path in setField', () => {
		// fixed: setField now blocks prototype-pollution path segments
		const record: Record<string, unknown> = {}
		const probe: Record<string, unknown> = {}
		const dangerous = rule('r', [], atom(['__proto__', 'injected'], 'equals', 'BOOM'))
		mergeConclusion(record, dangerous)
		// The whole write is refused (a no-op), so nothing leaks onto the prototype — no
		// cleanup is needed and a fresh object gains no injected key.
		expect(Object.hasOwn(Object.prototype, 'injected')).toBe(false)
		expect(probe.injected).toBeUndefined()
		expect(record).toEqual({})
	})
})

describe('describeExpression — deep recursion', () => {
	it('describes a 500-deep compound expression', () => {
		let expression: Expression = atom('leaf', 'equals', true)
		for (let depth = 0; depth < 500; depth += 1) expression = compound('and', [expression])
		const described = describeExpression(expression)
		expect(described.startsWith('and (')).toBe(true)
		expect(described.includes('leaf is true ? unknown')).toBe(true)
	})
})

describe('freezeProgramDefinition — deep structural freeze', () => {
	it('deep-freezes a clone through passes, rules, premises, and operands', () => {
		const gate = logicalDefinition('gate', 'Gate', [
			rule('r1', [compound('and', [atom('x', 'equals', true)])], atom('ok', 'equals', true)),
		])
		const definition = programDefinition('p1', 'Program', {
			passes: [passDefinition(gate, 'l1')],
			lines: [lineDefinition('l1', 'Line', createRatingDefinition())],
		})
		const frozen = freezeProgramDefinition(definition)
		expect(frozen).not.toBe(definition)
		expect(Object.isFrozen(definition)).toBe(false)
		expect(isDeeplyFrozen(frozen)).toBe(true)
	})
})

describe('findMissingLineReferences — dedup, empty, and scale', () => {
	it('deduplicates a reference missing across pass, ruling, and notice', () => {
		const gate = logicalDefinition('g', 'G', [])
		const definition = programDefinition('p', 'P', {
			passes: [passDefinition(gate, 'ghost'), passDefinition(gate, 'ghost')],
			rulings: { r: rulingDefinition('notice', 'ghost') },
			notices: [noticeDefinition('n', 'msg', 'ghost')],
			lines: [lineDefinition('real', 'Real', createRatingDefinition())],
		})
		expect([...findMissingLineReferences(definition)]).toEqual(['ghost'])
	})

	it('reports none for an empty program and for a large fully-referenced program', () => {
		expect([...findMissingLineReferences(programDefinition('empty', 'Empty'))]).toEqual([])
		const gate = logicalDefinition('g', 'G', [])
		const lines = sequence(50).map((index) =>
			lineDefinition(`l${index}`, `Line ${index}`, createRatingDefinition()),
		)
		const large = programDefinition('big', 'Big', {
			passes: sequence(50).map((index) => passDefinition(gate, `l${index}`)),
			lines,
		})
		expect([...findMissingLineReferences(large)]).toEqual([])
	})
})

describe('eligibility combination — empty seed and applied-only effects', () => {
	it('seeds eligible on empty input and maps only applied effects via EFFECT_ELIGIBILITIES', () => {
		expect(combineEligibilities([])).toBe('eligible')
		expect(
			deriveDeterminationEligibility([
				determination('a', 'restriction', true),
				determination('b', 'referral', true),
				determination('c', 'condition', true),
				determination('d', 'notice', true),
				determination('e', 'limit', true),
				determination('f', 'restriction', false),
			]),
		).toBe('ineligible')
		expect(
			deriveDeterminationEligibility([
				determination('a', 'restriction', false),
				determination('b', 'referral', true),
			]),
		).toBe('referral')
		expect(
			deriveDeterminationEligibility([
				determination('c', 'condition', true),
				determination('e', 'limit', true),
			]),
		).toBe('eligible')
	})
})

describe('assertSubject — subject validation guard', () => {
	it('passes a plain record subject without throwing', () => {
		expect(captureError(() => assertSubject({ age: 40 }))).toBeUndefined()
	})

	it('throws MISMATCH for a non-record subject', () => {
		const error = captureError(() => assertSubject(5))
		if (!isRaterError(error)) throw new Error('expected a RaterError')
		expect(error.code).toBe('MISMATCH')
	})

	it('throws MISMATCH for a subject carrying a reserved key', () => {
		const aggregate = captureError(() => assertSubject({ aggregate: {} }))
		const outcome = captureError(() => assertSubject({ outcome: {} }))
		if (!isRaterError(aggregate)) throw new Error('expected a RaterError')
		if (!isRaterError(outcome)) throw new Error('expected a RaterError')
		expect(aggregate.code).toBe('MISMATCH')
		expect(outcome.code).toBe('MISMATCH')
	})
})

describe('logicalFailure — empty failed logical result shell', () => {
	it('carries no errors when no message is given', () => {
		expect(logicalFailure()).toEqual({
			reasoning: 'logical',
			conclusion: false,
			rules: [],
			count: 0,
			success: false,
			trace: [],
			errors: [],
		})
	})

	it('carries the message as its sole errors entry when given', () => {
		expect(logicalFailure('boom')).toEqual({
			reasoning: 'logical',
			conclusion: false,
			rules: [],
			count: 0,
			success: false,
			trace: [],
			errors: ['boom'],
		})
	})
})

describe('quantitativeFailure — empty failed quantitative result shell', () => {
	it('carries no errors when no message is given', () => {
		expect(quantitativeFailure()).toEqual({
			reasoning: 'quantitative',
			value: 0,
			groups: [],
			count: 0,
			success: false,
			trace: [],
			errors: [],
		})
	})

	it('carries the message as its sole errors entry when given', () => {
		expect(quantitativeFailure('boom')).toEqual({
			reasoning: 'quantitative',
			value: 0,
			groups: [],
			count: 0,
			success: false,
			trace: [],
			errors: ['boom'],
		})
	})
})
