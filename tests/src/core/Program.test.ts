import {
	atom,
	compound,
	createProgram,
	factorGroup,
	fieldFactor,
	isRaterError,
	lineDefinition,
	logicalDefinition,
	noticeDefinition,
	outcomeProjection,
	passDefinition,
	ProgramManager,
	programDefinition,
	quantitativeDefinition,
	rule,
	rulingDefinition,
	staticFactor,
	sumAmounts,
} from '@src/core'
import { describe, expect, it } from 'vitest'
import {
	captureError,
	createAuthorityProgramDefinition,
	createLineResult,
	createPropertyProgramDefinition,
	createRatingDefinition,
	createRatingSubject,
	invokeRaw,
	isDeeplyFrozen,
	sequence,
} from '../../../setup.js'

describe('Program — pass pipeline', () => {
	it('logical passes merge equals conclusions for later passes and line rates', () => {
		const occupancy = logicalDefinition('occupancy', 'Occupancy', [
			rule('public', [atom('venue', 'equals', true)], atom('public', 'equals', true)),
		])
		const gates = logicalDefinition('gates', 'Gates', [
			rule('needs-review', [atom('public', 'equals', true)], atom('review', 'equals', true)),
		])
		const rate = quantitativeDefinition('rate', 'Rate', [
			factorGroup('charge', 'sum', [staticFactor('base', 10)]),
		])
		const program = createProgram(
			programDefinition('venue', 'Venue', {
				passes: [passDefinition(occupancy), passDefinition(gates, 'event')],
				rulings: {
					public: rulingDefinition('notice'),
					'needs-review': rulingDefinition('condition', 'event', 'Public venue'),
				},
				lines: [lineDefinition('event', 'Event', rate)],
			}),
		)
		const result = program.rate({ venue: true })
		expect(result.lines[0]?.amount).toBe(10)
		expect(result.lines[0]?.determinations[0]?.id).toBe('needs-review')
		expect(result.status).toBe('conditional')
	})

	it('quantitative passes write their value under definition id and keep derivation worksheets', () => {
		const cap = quantitativeDefinition('cap', 'Cap', [
			factorGroup('cap', 'sum', [staticFactor('base', 5000), fieldFactor('seats', 'seats')]),
		])
		const gates = logicalDefinition('cap-gates', 'Cap gates', [
			rule('over-cap', [atom('cap', 'above', 5000)], atom('overCap', 'equals', true)),
		])
		const program = createProgram(
			programDefinition('venue', 'Venue', {
				passes: [passDefinition(cap), passDefinition(gates, 'event')],
				rulings: { 'over-cap': rulingDefinition('referral', 'event', 'Cap is {{cap}}') },
				lines: [lineDefinition('event', 'Event', createRatingDefinition())],
			}),
		)
		const result = program.rate(createRatingSubject({ seats: 10 }))
		expect(result.derivations[0]?.id).toBe('cap')
		// interpolateMessage renders finite numbers with thousands separators.
		expect(result.lines[0]?.determinations[0]?.message).toBe('Cap is 5,010')
		expect(result.eligibility).toBe('referral')
	})
})

describe('Program — determinations and statuses', () => {
	it('routes rulings to ruling.line before pass.line and keeps non-applied authored rulings', () => {
		const gate = logicalDefinition('gate', 'Gate', [
			rule('applied', [atom('risk', 'equals', true)], atom('applied', 'equals', true)),
			rule('missed', [atom('risk', 'equals', false)], atom('missed', 'equals', true)),
		])
		const program = createProgram(
			programDefinition('p1', 'Program', {
				passes: [passDefinition(gate, 'default')],
				rulings: {
					applied: rulingDefinition('restriction', 'override', 'Risk {{risk}}'),
					missed: rulingDefinition('referral', 'default', 'Missed'),
				},
				lines: [
					lineDefinition('default', 'Default', createRatingDefinition()),
					lineDefinition('override', 'Override', createRatingDefinition()),
				],
			}),
		)
		const result = program.rate(createRatingSubject({ risk: true }))
		expect(result.lines[0]?.determinations).toEqual([
			{
				id: 'missed',
				effect: 'referral',
				applied: false,
				line: 'default',
				message: 'Missed',
				premises: [
					{ field: 'risk', comparison: 'equals', expected: false, actual: true, met: false },
				],
			},
		])
		expect(result.lines[1]?.determinations[0]?.message).toBe('Risk true')
		expect(result.status).toBe('ineligible')
	})

	it('unrouted applied rulings restrict the pass line and notices are applied', () => {
		const result = createProgram(createPropertyProgramDefinition()).rate(
			createRatingSubject({ coastal: true }),
		)
		expect(
			result.lines[0]?.determinations.map((entry) => [entry.id, entry.effect, entry.applied]),
		).toEqual([
			['coastal', 'referral', true],
			['notice', 'notice', true],
		])
		expect(result.status).toBe('referral')
	})

	it('covers ineligible, referral, conditional, unrated, and eligible statuses', () => {
		const restriction = createProgram(programWithRuling('restriction')).rate(
			createRatingSubject({ flag: true }),
		)
		const referral = createProgram(programWithRuling('referral')).rate(
			createRatingSubject({ flag: true }),
		)
		const condition = createProgram(programWithRuling('condition')).rate(
			createRatingSubject({ flag: true }),
		)
		const unrated = createProgram(
			programDefinition('bad-rate', 'Bad rate', {
				lines: [
					lineDefinition(
						'line',
						'Line',
						quantitativeDefinition('missing', 'Missing', [
							factorGroup('required', 'sum', [
								fieldFactor('missing', 'missing', { required: true }),
							]),
						]),
					),
				],
			}),
		).rate({})
		const eligible = createProgram(programWithRuling('notice')).rate(
			createRatingSubject({ flag: false }),
		)
		expect(restriction.status).toBe('ineligible')
		expect(referral.status).toBe('referral')
		expect(condition.status).toBe('conditional')
		expect(unrated.status).toBe('unrated')
		expect(eligible.status).toBe('eligible')
	})
})

describe('Program — authority and totals', () => {
	it('runs authority last over outcome and omits decision when a limit applies', () => {
		const program = createProgram(createAuthorityProgramDefinition(), { total: sumAmounts })
		const result = program.rate(createRatingSubject())
		expect(result.total).toBe(110)
		expect(result.decision).toBeUndefined()
		expect(result.determinations[0]?.effect).toBe('limit')
		expect(result.determinations[0]?.message).toBe('Total 110 needs authority')
	})

	it('derives decision when authority is clean and omits decision when authority errors', () => {
		const clean = createProgram(
			programDefinition('clean', 'Clean', {
				authority: logicalDefinition('authority', 'Authority', [
					rule('large', [atom(['outcome', 'total'], 'above', 1000)], atom('large', 'equals', true)),
				]),
				lines: [lineDefinition('line', 'Line', createRatingDefinition())],
			}),
			{ total: sumAmounts },
		)
		const manager = new ProgramManager(undefined, undefined, false)
		const malformed = {
			id: 'malformed-authority',
			name: 'Malformed authority',
			authority: {
				reasoning: 'logical',
				id: 'authority',
				name: 'Authority',
				strategy: 'forward',
				rules: 'bad',
			},
			lines: [lineDefinition('line', 'Line', createRatingDefinition())],
		}
		const bad = invokeRaw(manager, manager.add, [malformed])
		expect(clean.rate(createRatingSubject()).decision).toBe('approved')
		expect(bad.rate(createRatingSubject()).decision).toBeUndefined()
		expect(bad.rate(createRatingSubject()).errors.length).toBe(1)
	})

	it('per-program total overrides rater-wide total and no handler leaves total undefined', () => {
		const noTotal = createProgram(createPropertyProgramDefinition()).rate(createRatingSubject())
		const programTotal = createProgram(createPropertyProgramDefinition(), {
			total: () => 999,
		}).rate(createRatingSubject())
		expect(noTotal.total).toBeUndefined()
		expect(programTotal.total).toBe(999)
	})
})

describe('Program — safety and determinism', () => {
	it('rejects reserved direct subject keys with MISMATCH', () => {
		const program = createProgram(createPropertyProgramDefinition())
		const aggregate = captureError(() => program.rate({ aggregate: {} }))
		const outcome = captureError(() => program.rate({ outcome: {} }))
		if (!isRaterError(aggregate)) throw new Error('expected a RaterError')
		if (!isRaterError(outcome)) throw new Error('expected a RaterError')
		expect(aggregate.code).toBe('MISMATCH')
		expect(outcome.code).toBe('MISMATCH')
	})

	it('rejects function-bearing and cyclic definitions with DEFINITION', () => {
		const bad: unknown = { ...programDefinition('bad', 'Bad', {}), metadata: () => 1 }
		const functionError = captureError(() => invokeRaw(undefined, createProgram, [bad]))
		const cycle: Record<string, unknown> = {}
		cycle.self = cycle
		const manager = new ProgramManager(undefined, undefined, false)
		const cyclic = {
			id: 'cycle',
			name: 'Cycle',
			metadata: cycle,
			lines: [lineDefinition('line', 'Line', createRatingDefinition())],
		}
		const cycleError = captureError(() => invokeRaw(manager, manager.add, [cyclic]))
		if (!isRaterError(functionError)) throw new Error('expected a RaterError')
		if (!isRaterError(cycleError)) throw new Error('expected a RaterError')
		expect(functionError.code).toBe('DEFINITION')
		expect(cycleError.code).toBe('DEFINITION')
	})

	it('is deterministic, leaves subjects immutable, and exposes frozen definition/results', () => {
		const program = createProgram(createPropertyProgramDefinition(), { total: sumAmounts })
		const subject = Object.freeze(createRatingSubject())
		const first = program.rate(subject)
		const second = program.rate(subject)
		expect(first).toEqual(second)
		expect(Object.isFrozen(program.definition)).toBe(true)
		expect(Object.isFrozen(program.definition.lines)).toBe(true)
		expect(Object.isFrozen(first)).toBe(false)
	})
	it('produces in-result errors for malformed nested definitions when validation is off', () => {
		const broken: unknown = { ...createRatingDefinition(), groups: 'nope' }
		const definition: unknown = {
			id: 'bad',
			name: 'Bad',
			lines: [{ id: 'line', name: 'Line', rate: broken }],
		}
		const manager = new ProgramManager(undefined, undefined, false)
		invokeRaw(manager, manager.add, [definition])
		const program = manager.program('bad')
		if (program === undefined) throw new Error('expected a compiled program')
		const result = program.rate(createRatingSubject())
		expect(result.errors.length).toBeGreaterThan(0)
		expect(result.status).toBe('unrated')
		expect(result.lines[0]?.amount).toBeUndefined()
		expect(result.lines[0]?.worksheet?.success).toBe(false)
	})

	it('throws MISMATCH for a non-record direct rate subject', () => {
		const program = createProgram(createPropertyProgramDefinition())
		const error = captureError(() => invokeRaw(program, program.rate, ['nope']))
		if (!isRaterError(error)) throw new Error('expected a RaterError')
		expect(error.code).toBe('MISMATCH')
	})
})

function programWithRuling(effect: 'restriction' | 'referral' | 'condition' | 'notice') {
	const gate = logicalDefinition('gate', 'Gate', [
		rule('flag', [atom('flag', 'equals', true)], atom('flagged', 'equals', true)),
	])
	return programDefinition(`program-${effect}`, `Program ${effect}`, {
		passes: [passDefinition(gate, 'line')],
		rulings: { flag: rulingDefinition(effect, 'line') },
		lines: [lineDefinition('line', 'Line', createRatingDefinition())],
	})
}

// Wrap `leaf` in `depth` single-operand compounds so evaluation, description, and
// atom extraction each recurse to `depth`; a single-operand `and`/`or` forwards its
// child's truth, so the nested premise still resolves to the leaf's comparison.
function nestExpression(depth: number, leaf: ReturnType<typeof atom>): ReturnType<typeof atom> {
	let expression = leaf
	for (let index = 0; index < depth; index += 1) expression = compound('and', [expression])
	return expression
}

describe('Program — total and sumAmounts edges', () => {
	it('returns undefined for no amounts and a defined zero for a single zero line', () => {
		expect(sumAmounts([])).toBeUndefined()
		expect(sumAmounts([createLineResult('a', 'eligible')])).toBeUndefined()
		expect(sumAmounts([createLineResult('a', 'eligible', 0)])).toBe(0)
	})

	it('accumulates signed zero as positive zero and adds floats without rounding away drift', () => {
		expect(Object.is(sumAmounts([createLineResult('a', 'eligible', -0)]), 0)).toBe(true)
		expect(Object.is(sumAmounts([createLineResult('a', 'eligible', -0)]), -0)).toBe(false)
		expect(
			Object.is(
				sumAmounts([createLineResult('a', 'eligible', -0), createLineResult('b', 'eligible', -0)]),
				0,
			),
		).toBe(true)
		expect(
			sumAmounts([createLineResult('a', 'eligible', 0.1), createLineResult('b', 'eligible', 0.2)]),
		).toBe(0.30000000000000004)
	})

	it('propagates non-finite amounts and skips amount-less lines', () => {
		expect(
			sumAmounts([
				createLineResult('a', 'eligible', Number.POSITIVE_INFINITY),
				createLineResult('b', 'eligible', 1),
			]),
		).toBe(Number.POSITIVE_INFINITY)
		expect(
			sumAmounts([
				createLineResult('a', 'eligible', Number.POSITIVE_INFINITY),
				createLineResult('b', 'eligible', Number.NEGATIVE_INFINITY),
			]),
		).toBeNaN()
		expect(sumAmounts([createLineResult('a', 'eligible', Number.NaN)])).toBeNaN()
		expect(
			sumAmounts([createLineResult('a', 'eligible'), createLineResult('b', 'eligible', 5)]),
		).toBe(5)
	})

	it('sums many integer line amounts deterministically', () => {
		const many = sequence(1000).map((index) => createLineResult(`line-${index}`, 'eligible', index))
		expect(sumAmounts(many)).toBe((999 * 1000) / 2)
	})
})

describe('Program — deep expression recursion', () => {
	it('rates a deeply nested compound premise and merges a deep conclusion', () => {
		const depth = 300
		const premise = nestExpression(depth, atom('state', 'equals', 'CA'))
		const conclusion = nestExpression(depth, atom('deep', 'equals', true))
		const deep = logicalDefinition('deep', 'Deep', [rule('deep-rule', [premise], conclusion)])
		const after = logicalDefinition('after', 'After', [
			rule('after', [atom('deep', 'equals', true)], atom('after', 'equals', true)),
		])
		const program = createProgram(
			programDefinition('nested', 'Nested', {
				passes: [passDefinition(deep, 'building'), passDefinition(after, 'building')],
				rulings: {
					'deep-rule': rulingDefinition('notice', 'building'),
					after: rulingDefinition('condition', 'building', 'Deep merged'),
				},
				lines: [lineDefinition('building', 'Building', createRatingDefinition())],
			}),
		)
		const result = program.rate(createRatingSubject())
		const merged = result.lines[0]?.determinations.find((entry) => entry.id === 'after')
		const described = result.lines[0]?.determinations.find((entry) => entry.id === 'deep-rule')
		expect(result.status).toBe('conditional')
		expect(merged?.message).toBe('Deep merged')
		expect(described?.premises[0]?.description?.startsWith('and (')).toBe(true)
	})
})

describe('Program — large program determinism', () => {
	it('produces identical, order-stable results across repeated rates', () => {
		const count = 24
		const lines = sequence(count).map((index) =>
			lineDefinition(
				`line-${index}`,
				`Line ${index}`,
				quantitativeDefinition(`rate-${index}`, `Rate ${index}`, [
					factorGroup('charge', 'sum', [staticFactor('base', index)]),
				]),
			),
		)
		const notices = sequence(count).map((index) =>
			noticeDefinition(`notice-${index}`, `Notice ${index}`, `line-${index}`),
		)
		const gate = logicalDefinition('gate', 'Gate', [
			rule('flag', [atom('coastal', 'equals', true)], atom('flagged', 'equals', true)),
		])
		const program = createProgram(
			programDefinition('big', 'Big', {
				passes: [passDefinition(gate)],
				rulings: { flag: rulingDefinition('condition') },
				notices,
				lines,
			}),
		)
		const subject = createRatingSubject({ coastal: true })
		const first = program.rate(subject)
		const second = program.rate(subject)
		expect(first).toEqual(second)
		expect(first.lines.map((line) => line.id)).toEqual(
			sequence(count).map((index) => `line-${index}`),
		)
		expect(first.lines.map((line) => line.amount)).toEqual(sequence(count))
		expect(first.lines[3]?.determinations.map((entry) => entry.id)).toEqual(['notice-3'])
		expect(first.status).toBe('conditional')
	})
})

describe('Program — adversarial keys and prototype safety', () => {
	it('ignores reserved keys nested below the top level', () => {
		const program = createProgram(createPropertyProgramDefinition())
		const subject = createRatingSubject({ coastal: false })
		const nested = { ...subject, nested: { aggregate: { x: 1 }, outcome: { y: 2 } } }
		expect(captureError(() => program.rate(nested))).toBeUndefined()
	})

	it('never pollutes Object.prototype through a proto-targeted conclusion', () => {
		const gate = logicalDefinition('proto', 'Proto', [
			rule(
				'pollute',
				[atom('state', 'equals', 'CA')],
				compound('and', [
					atom('__proto__', 'equals', { polluted: true }),
					atom(['constructor', 'prototype', 'polluted'], 'equals', true),
				]),
			),
		])
		const program = createProgram(
			programDefinition('proto', 'Proto', {
				passes: [passDefinition(gate, 'building')],
				rulings: { pollute: rulingDefinition('notice', 'building') },
				lines: [lineDefinition('building', 'Building', createRatingDefinition())],
			}),
		)
		program.rate(createRatingSubject())
		const probe: Record<string, unknown> = {}
		expect(probe.polluted).toBeUndefined()
		expect(Object.hasOwn(Object.prototype, 'polluted')).toBe(false)
	})
})

describe('Program — duplicate line ids', () => {
	it('keeps duplicate line results and applies last-wins in the outcome projection', () => {
		const program = createProgram(
			programDefinition('dup', 'Dup', {
				lines: [
					lineDefinition(
						'dup',
						'First',
						quantitativeDefinition('rate-a', 'A', [
							factorGroup('charge', 'sum', [staticFactor('base', 10)]),
						]),
					),
					lineDefinition(
						'dup',
						'Second',
						quantitativeDefinition('rate-b', 'B', [
							factorGroup('charge', 'sum', [staticFactor('base', 20)]),
						]),
					),
				],
			}),
		)
		const result = program.rate(createRatingSubject())
		expect(result.lines.map((line) => [line.id, line.amount])).toEqual([
			['dup', 10],
			['dup', 20],
		])
		expect(outcomeProjection(result).lines).toEqual({ dup: 20 })
	})
})

describe('Program — empty collections', () => {
	it('treats an empty-line program as eligible with an undefined total', () => {
		const result = createProgram(programDefinition('empty', 'Empty')).rate(createRatingSubject())
		expect(result.lines).toEqual([])
		expect(result.eligibility).toBe('eligible')
		expect(result.status).toBe('eligible')
		expect(result.total).toBeUndefined()
		expect(result.success).toBe(true)
	})

	it('rates a program with no passes, rulings, notices, or authority', () => {
		const result = createProgram(
			programDefinition('bare', 'Bare', {
				lines: [lineDefinition('line', 'Line', createRatingDefinition())],
			}),
		).rate(createRatingSubject())
		expect(result.lines[0]?.amount).toBe(110)
		expect(result.determinations).toEqual([])
		expect(result.derivations).toEqual([])
		expect(result.decision).toBeUndefined()
		expect(result.status).toBe('eligible')
	})
})

describe('Program — freeze definition quirk', () => {
	it('clones a valid definition, freezing the copy deeply while leaving the original mutable', () => {
		const gate = logicalDefinition('gate', 'Gate', [
			rule(
				'flag',
				[compound('and', [atom('coastal', 'equals', true)])],
				atom('flagged', 'equals', true),
			),
		])
		const definition = programDefinition('freeze', 'Freeze', {
			passes: [passDefinition(gate, 'building')],
			lines: [lineDefinition('building', 'Building', createRatingDefinition())],
		})
		const program = createProgram(definition)
		expect(Object.isFrozen(definition)).toBe(false)
		expect(Object.isFrozen(definition.lines)).toBe(false)
		expect(isDeeplyFrozen(program.definition)).toBe(true)
		const pass = program.definition.passes?.[0]
		const premise =
			pass?.definition.reasoning === 'logical' ? pass.definition.rules[0]?.premises[0] : undefined
		expect(premise !== undefined && premise.form === 'compound').toBe(true)
	})

	it('freezes a malformed definition in place when its guard rejects the clone', () => {
		const broken: unknown = { ...createRatingDefinition(), groups: 'nope' }
		const definition = {
			id: 'malformed',
			name: 'Malformed',
			lines: [{ id: 'line', name: 'Line', rate: broken }],
		}
		const manager = new ProgramManager(undefined, undefined, false)
		invokeRaw(manager, manager.add, [definition])
		expect(isDeeplyFrozen(definition)).toBe(true)
	})
})
