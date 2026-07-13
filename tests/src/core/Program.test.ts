import {
	atom,
	compound,
	factorGroup,
	fieldFactor,
	logicalDefinition,
	quantitativeDefinition,
	rule,
	staticFactor,
} from '@orkestrel/reason'
import {
	createProgram,
	isRaterError,
	lineDefinition,
	outcomeProjection,
	passDefinition,
	programDefinition,
	rulingDefinition,
	sumAmounts,
} from '@src/core'
import { describe, expect, it } from 'vitest'
import {
	captureError,
	createAuthorityProgramDefinition,
	createEngine,
	createPropertyProgramDefinition,
	createRatingDefinition,
	createRatingSubject,
	invokeRaw,
} from '../../setup.js'

describe('Program — pass pipeline', () => {
	it('property-style program: passes + rulings + notices with message interpolation', () => {
		const engine = createEngine()
		const program = createProgram(createPropertyProgramDefinition(), engine)
		const result = program.rate(createRatingSubject({ coastal: true, seats: 10 }))
		expect(
			result.lines[0]?.determinations.map((entry) => [entry.id, entry.effect, entry.applied]),
		).toEqual([
			['flag-coastal', 'referral', true],
			['rated', 'notice', true],
		])
		expect(result.lines[0]?.determinations[0]?.message).toBe('Coastal surcharge on 10 seats')
		expect(result.lines[0]?.determinations[1]?.message).toBe('Rated with 10 seats')
		expect(result.status).toBe('referral')
		engine.destroy()
	})

	it('quantitative passes write their value under definition id and keep derivation worksheets', () => {
		const engine = createEngine()
		const cap = quantitativeDefinition('cap', 'Cap', [
			factorGroup('cap', 'sum', [
				staticFactor('base', 1000),
				fieldFactor('seats', 'seats', { fallback: 0 }),
			]),
		])
		const gates = logicalDefinition('cap-gates', 'Cap gates', [
			rule('over-cap', [atom('cap', 'above', 1000)], atom('overCap', 'equals', true)),
		])
		const program = createProgram(
			programDefinition(
				'venue',
				'Venue',
				[lineDefinition('event', 'Event', createRatingDefinition())],
				{
					passes: [passDefinition(cap), passDefinition(gates, 'event')],
					rulings: { 'over-cap': rulingDefinition('referral', 'event', 'Cap is {{cap}}') },
				},
			),
			engine,
		)
		const result = program.rate(createRatingSubject({ seats: 10 }))
		expect(result.derivations[0]?.id).toBe('cap')
		// interpolateMessage renders finite numbers with thousands separators.
		expect(result.lines[0]?.determinations[0]?.message).toBe('Cap is 1,010')
		expect(result.eligibility).toBe('referral')
		engine.destroy()
	})

	it('logical pass conclusions merge ALL atom leaves regardless of comparison (equals-only filtering is dead)', () => {
		const engine = createEngine()
		const seed = logicalDefinition('seed', 'Seed', [
			rule(
				'seed',
				[atom('coastal', 'equals', true)],
				compound('and', [atom('flagged', 'equals', true), atom('threshold', 'above', 50)]),
			),
		])
		const after = logicalDefinition('after', 'After', [
			rule('after', [atom('threshold', 'equals', 50)], atom('afterFlag', 'equals', true)),
		])
		const program = createProgram(
			programDefinition(
				'merge',
				'Merge',
				[lineDefinition('line', 'Line', createRatingDefinition())],
				{
					passes: [passDefinition(seed, 'line'), passDefinition(after, 'line')],
					rulings: {
						seed: rulingDefinition('notice', 'line'),
						after: rulingDefinition('condition', 'line', 'Threshold merged'),
					},
				},
			),
			engine,
		)
		const result = program.rate(createRatingSubject({ coastal: true }))
		const merged = result.lines[0]?.determinations.find((entry) => entry.id === 'after')
		expect(merged?.applied).toBe(true)
		expect(merged?.message).toBe('Threshold merged')
		expect(result.status).toBe('conditional')
		engine.destroy()
	})
})

describe('Program — determinations and statuses', () => {
	it('routes rulings to ruling.line before pass.line and keeps non-applied authored rulings', () => {
		const engine = createEngine()
		const gate = logicalDefinition('gate', 'Gate', [
			rule('applied', [atom('risk', 'equals', true)], atom('applied', 'equals', true)),
			rule('missed', [atom('risk', 'equals', false)], atom('missed', 'equals', true)),
		])
		const program = createProgram(
			programDefinition(
				'p1',
				'Program',
				[
					lineDefinition('default', 'Default', createRatingDefinition()),
					lineDefinition('override', 'Override', createRatingDefinition()),
				],
				{
					passes: [passDefinition(gate, 'default')],
					rulings: {
						applied: rulingDefinition('restriction', 'override', 'Risk {{risk}}'),
						missed: rulingDefinition('referral', 'default', 'Missed'),
					},
				},
			),
			engine,
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
		engine.destroy()
	})

	it('covers ineligible, referral, conditional, unrated, and eligible statuses', () => {
		const engine = createEngine()
		const restriction = createProgram(programWithRuling('restriction'), engine).rate(
			createRatingSubject({ flag: true }),
		)
		const referral = createProgram(programWithRuling('referral'), engine).rate(
			createRatingSubject({ flag: true }),
		)
		const condition = createProgram(programWithRuling('condition'), engine).rate(
			createRatingSubject({ flag: true }),
		)
		const unrated = createProgram(
			programDefinition('bad-rate', 'Bad rate', [
				lineDefinition(
					'line',
					'Line',
					quantitativeDefinition('missing', 'Missing', [
						factorGroup('required', 'sum', [fieldFactor('missing', 'missing', { required: true })]),
					]),
				),
			]),
			engine,
		).rate({})
		const eligible = createProgram(programWithRuling('notice'), engine).rate(
			createRatingSubject({ flag: false }),
		)
		expect(restriction.status).toBe('ineligible')
		expect(referral.status).toBe('referral')
		expect(condition.status).toBe('conditional')
		expect(unrated.status).toBe('unrated')
		expect(eligible.status).toBe('eligible')
		engine.destroy()
	})
})

describe('Program — authority and totals', () => {
	it('runs authority last over the outcome projection and omits the decision when a limit applies', () => {
		const engine = createEngine()
		const program = createProgram(createAuthorityProgramDefinition(), engine, { total: sumAmounts })
		const result = program.rate(createRatingSubject({ seats: 950 }))
		expect(result.total).toBe(1050)
		expect(result.decision).toBeUndefined()
		expect(result.determinations[0]).toMatchObject({
			id: 'needs-review',
			effect: 'limit',
			applied: true,
			message: 'Total 1,050 needs review',
		})
		engine.destroy()
	})

	it('derives a decision when authority is clean', () => {
		const engine = createEngine()
		const program = createProgram(createAuthorityProgramDefinition(), engine, { total: sumAmounts })
		const result = program.rate(createRatingSubject({ seats: 10 }))
		expect(result.total).toBe(110)
		expect(result.decision).toBe('approved')
		expect(result.determinations).toEqual([])
		engine.destroy()
	})

	it('derives denied for an ineligible outcome and submitted for a referral outcome, per ELIGIBILITY_DECISIONS', () => {
		const engine = createEngine()
		// A clean (never-firing) authority so the decision derives straight from
		// base.eligibility via decideEligibility/ELIGIBILITY_DECISIONS.
		const cleanAuthority = logicalDefinition('clean', 'Clean', [
			rule('never', [atom('never', 'equals', true)], atom('never', 'equals', true)),
		])
		const denied = createProgram(
			{ ...programWithRuling('restriction'), authority: cleanAuthority },
			engine,
		).rate(createRatingSubject({ flag: true }))
		const submitted = createProgram(
			{ ...programWithRuling('referral'), authority: cleanAuthority },
			engine,
		).rate(createRatingSubject({ flag: true }))
		expect(denied.eligibility).toBe('ineligible')
		expect(denied.decision).toBe('denied')
		expect(submitted.eligibility).toBe('referral')
		expect(submitted.decision).toBe('submitted')
		engine.destroy()
	})

	it('per-program total overrides and no handler leaves total undefined', () => {
		const engine = createEngine()
		const noTotal = createProgram(createPropertyProgramDefinition(), engine).rate(
			createRatingSubject(),
		)
		const programTotal = createProgram(createPropertyProgramDefinition(), engine, {
			total: () => 999,
		}).rate(createRatingSubject())
		expect(noTotal.total).toBeUndefined()
		expect(programTotal.total).toBe(999)
		engine.destroy()
	})
})

describe('Program — safety and determinism', () => {
	it('rejects reserved direct subject keys with MISMATCH', () => {
		const engine = createEngine()
		const program = createProgram(createPropertyProgramDefinition(), engine)
		const aggregate = captureError(() => program.rate({ aggregate: {} }))
		const outcome = captureError(() => program.rate({ outcome: {} }))
		if (!isRaterError(aggregate)) throw new Error('expected a RaterError')
		if (!isRaterError(outcome)) throw new Error('expected a RaterError')
		expect(aggregate.code).toBe('MISMATCH')
		expect(outcome.code).toBe('MISMATCH')
		engine.destroy()
	})

	it('throws MISMATCH for a non-record subject', () => {
		const engine = createEngine()
		const program = createProgram(createPropertyProgramDefinition(), engine)
		const error = captureError(() => invokeRaw(program, program.rate, ['nope']))
		if (!isRaterError(error)) throw new Error('expected a RaterError')
		expect(error.code).toBe('MISMATCH')
		engine.destroy()
	})

	it('throws MISSING at construction for an unknown line reference', () => {
		const engine = createEngine()
		const error = captureError(() =>
			createProgram(
				programDefinition(
					'bad-lines',
					'Bad lines',
					[lineDefinition('known', 'Known', createRatingDefinition())],
					{
						rulings: { r1: rulingDefinition('referral', 'missing') },
					},
				),
				engine,
			),
		)
		if (!isRaterError(error)) throw new Error('expected a RaterError')
		expect(error.code).toBe('MISSING')
		expect(error.context).toEqual({ program: 'bad-lines' })
		engine.destroy()
	})

	it('throws DEFINITION for a malformed definition and never reaches the engine', () => {
		const engine = createEngine()
		const bad: unknown = { ...programDefinition('bad', 'Bad', []), metadata: (): number => 1 }
		const error = captureError(() => invokeRaw(undefined, createProgram, [bad, engine]))
		if (!isRaterError(error)) throw new Error('expected a RaterError')
		expect(error.code).toBe('DEFINITION')
		engine.destroy()
	})

	it('is deterministic and leaves the caller subject unmutated', () => {
		const engine = createEngine()
		const program = createProgram(createPropertyProgramDefinition(), engine, { total: sumAmounts })
		const subject = Object.freeze(createRatingSubject({ coastal: true }))
		const first = program.rate(subject)
		const second = program.rate(subject)
		expect(first).toEqual(second)
		expect(subject).toEqual(createRatingSubject({ coastal: true }))
		engine.destroy()
	})

	it('never owns or destroys the injected engine — it keeps working after rating', () => {
		const engine = createEngine()
		const program = createProgram(createPropertyProgramDefinition(), engine)
		program.rate(createRatingSubject())
		const direct = engine.reason(createRatingSubject(), createRatingDefinition())
		expect(direct.reasoning).toBe('quantitative')
		engine.destroy()
	})
})

describe('Program — duplicate line ids', () => {
	it('keeps duplicate line results and applies last-wins in the outcome projection', () => {
		const engine = createEngine()
		const program = createProgram(
			programDefinition('dup', 'Dup', [
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
			]),
			engine,
		)
		const result = program.rate(createRatingSubject())
		expect(result.lines.map((line) => [line.id, line.amount])).toEqual([
			['dup', 10],
			['dup', 20],
		])
		expect(outcomeProjection(result).lines).toEqual({ dup: 20 })
		engine.destroy()
	})
})

describe('Program — empty collections', () => {
	it('treats an empty-line program as eligible with an undefined total', () => {
		const engine = createEngine()
		const result = createProgram(programDefinition('empty', 'Empty', []), engine).rate(
			createRatingSubject(),
		)
		expect(result.lines).toEqual([])
		expect(result.eligibility).toBe('eligible')
		expect(result.status).toBe('eligible')
		expect(result.total).toBeUndefined()
		expect(result.success).toBe(true)
		engine.destroy()
	})

	it('rates a program with no passes, rulings, notices, or authority', () => {
		const engine = createEngine()
		const result = createProgram(
			programDefinition('bare', 'Bare', [lineDefinition('line', 'Line', createRatingDefinition())]),
			engine,
		).rate(createRatingSubject())
		expect(result.lines[0]?.amount).toBe(110)
		expect(result.determinations).toEqual([])
		expect(result.derivations).toEqual([])
		expect(result.decision).toBeUndefined()
		expect(result.status).toBe('eligible')
		engine.destroy()
	})
})

describe('Program — prototype safety', () => {
	it('never pollutes Object.prototype through a proto-targeted conclusion', () => {
		const engine = createEngine()
		const gate = logicalDefinition('proto', 'Proto', [
			rule(
				'pollute',
				[atom('coastal', 'equals', true)],
				compound('and', [
					atom('__proto__', 'equals', { polluted: true }),
					atom(['constructor', 'prototype', 'polluted'], 'equals', true),
				]),
			),
		])
		const program = createProgram(
			programDefinition(
				'proto',
				'Proto',
				[lineDefinition('line', 'Line', createRatingDefinition())],
				{
					passes: [passDefinition(gate, 'line')],
					rulings: { pollute: rulingDefinition('notice', 'line') },
				},
			),
			engine,
		)
		program.rate(createRatingSubject({ coastal: true }))
		const probe: Record<string, unknown> = {}
		expect(probe.polluted).toBeUndefined()
		expect(Object.hasOwn(Object.prototype, 'polluted')).toBe(false)
		engine.destroy()
	})
})

function programWithRuling(effect: 'restriction' | 'referral' | 'condition' | 'notice') {
	const gate = logicalDefinition('gate', 'Gate', [
		rule('flag', [atom('flag', 'equals', true)], atom('flagged', 'equals', true)),
	])
	return programDefinition(
		'program-' + effect,
		'Program ' + effect,
		[lineDefinition('line', 'Line', createRatingDefinition())],
		{
			passes: [passDefinition(gate, 'line')],
			rulings: { flag: rulingDefinition(effect, 'line') },
		},
	)
}
