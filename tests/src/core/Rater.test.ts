import type { FieldPath } from '@orkestrel/contract'
import {
	factorGroup,
	isReasonError,
	quantitativeDefinition,
	staticFactor,
	symbolicDefinition,
} from '@orkestrel/reason'
import type { ProgramDefinition, ProgramInterface, RaterEventMap } from '@src/core'
import {
	aggregateDefinition,
	createRater,
	isRaterError,
	lineDefinition,
	programDefinition,
	sumAmounts,
} from '@src/core'
import { describe, expect, it } from 'vitest'
import {
	EXTREME_NUMBERS,
	TRICKY_KEYS,
	captureError,
	createAggregateProgramDefinition,
	createAuthorityProgramDefinition,
	createErrorRecorder,
	createPropertyProgramDefinition,
	createRatingSubject,
	createRecorder,
	invokeRaw,
	recordEmitterEvents,
	sequence,
} from '../../setup.js'

// A minimal aggregate program: an `amount`-summing aggregate (optionally partitioned
// by `by`) over a line that always rates to a finite `0` — so status is deterministically
// `eligible` and the only variable under test is the aggregation itself.
function sumsProgram(fields: readonly FieldPath[] = ['amount'], by?: FieldPath): ProgramDefinition {
	return programDefinition(
		'sums',
		'Sums',
		[
			lineDefinition(
				'line',
				'Line',
				quantitativeDefinition('quote', 'Quote', [
					factorGroup('base', 'sum', [staticFactor('base', 0)]),
				]),
			),
		],
		{ aggregate: aggregateDefinition(fields, by) },
	)
}

describe('Rater — rate overloads', () => {
	it('rates a single subject to a SubjectResult in manager insertion order', () => {
		const rater = createRater({ total: sumAmounts })
		rater.programs.add(createPropertyProgramDefinition('first'))
		rater.programs.add(createPropertyProgramDefinition('second'))
		const result = rater.rate(createRatingSubject())
		expect(result.subject).toEqual(createRatingSubject())
		expect(result.programs.map((program) => program.id)).toEqual(['first', 'second'])
		expect(result.programs[0]?.total).toBe(110)
		rater.destroy()
	})

	it('rates an array to an AggregateResult and handles an empty batch', () => {
		const rater = createRater({ programs: [createAggregateProgramDefinition()] })
		const result = rater.rate([
			createRatingSubject({ value: 10 }),
			createRatingSubject({ value: 20 }),
		])
		const emptyRater = createRater()
		const empty = emptyRater.rate([])
		expect(result.count).toBe(2)
		expect(result.subjects).toHaveLength(2)
		expect(result.sums).toEqual({ value: 30 })
		expect(empty).toEqual({
			subjects: [],
			determinations: [],
			groups: [],
			tallies: {},
			count: 0,
			sums: {},
		})
		rater.destroy()
		emptyRater.destroy()
	})
})

describe('Rater — batch aggregates', () => {
	it('computes raw aggregate sums, groups by location, and gates whole-batch plus per-group determinations', () => {
		const rater = createRater({ total: sumAmounts, programs: [createAggregateProgramDefinition()] })
		const result = rater.rate([
			createRatingSubject({ id: 'a', value: 90, location: 'north' }),
			createRatingSubject({ id: 'b', value: 60, location: 'north' }),
			createRatingSubject({ id: 'c', value: 5, location: undefined }),
		])
		expect(result.sums).toEqual({ value: 155 })
		expect(result.groups).toEqual([
			{ key: 'north', count: 2, sums: { value: 150 } },
			{ key: '', count: 1, sums: { value: 5 } },
		])
		expect(result.determinations.map((entry) => [entry.id, entry.applied])).toEqual([
			['over-limit', true],
			['over-limit', true],
			['over-limit', false],
		])
		expect(result.subjects[0]?.programs[0]?.determinations).toEqual([])
		rater.destroy()
	})

	it('completes tallies for every status, keyed by program id', () => {
		const rater = createRater({ total: sumAmounts, programs: [createAggregateProgramDefinition()] })
		const result = rater.rate([
			createRatingSubject({ value: 10 }),
			createRatingSubject({ value: 20 }),
		])
		const tally = result.tallies.portfolio
		expect(Object.keys(tally)).toEqual([
			'ineligible',
			'referral',
			'conditional',
			'unrated',
			'eligible',
		])
		expect(tally.eligible.count).toBe(2)
		expect(tally.eligible.sums).toEqual({ value: 30 })
		expect(tally.ineligible.count).toBe(0)
		rater.destroy()
	})
})

describe('Rater — events', () => {
	it('fires post-hoc subject, determination, decision, and aggregate events in order', () => {
		const rater = createRater({
			total: sumAmounts,
			programs: [createPropertyProgramDefinition(), createAuthorityProgramDefinition()],
		})
		const events = recordEmitterEvents(rater.emitter, {
			rate: createRecorder<RaterEventMap['rate']>(),
			aggregate: createRecorder<RaterEventMap['aggregate']>(),
			determine: createRecorder<RaterEventMap['determine']>(),
			decide: createRecorder<RaterEventMap['decide']>(),
		})
		rater.rate([
			createRatingSubject({ coastal: true, seats: 10 }),
			createRatingSubject({ coastal: false, seats: 10 }),
		])
		expect(events.rate.count).toBe(2)
		expect(events.aggregate.count).toBe(1)
		expect(events.determine.calls.map((call) => call[0].id)).toEqual([
			'flag-coastal',
			'rated',
			'rated',
		])
		expect(events.decide.count).toBe(2)
		expect(events.aggregate.calls[0]?.[0].count).toBe(2)
		rater.destroy()
	})

	it('construction hooks receive events and a throwing listener is isolated via the error handler', () => {
		const rate = createRecorder<RaterEventMap['rate']>()
		const error = createErrorRecorder()
		const rater = createRater({
			programs: [createPropertyProgramDefinition()],
			on: {
				rate: rate.handler,
				determine: () => {
					throw new Error('determine failed')
				},
			},
			error: error.handler,
		})
		const result = rater.rate(createRatingSubject({ coastal: true }))
		expect(result.programs).toHaveLength(1)
		expect(rate.count).toBe(1)
		expect(error.count).toBe(2)
		expect(error.calls[0]?.[1]).toBe('determine')
		rater.destroy()
	})
})

describe('Rater — errors and destroy', () => {
	it('throws MISMATCH for non-record or reserved-key subjects', () => {
		const rater = createRater()
		const nonRecord = captureError(() => invokeRaw(rater, rater.rate, ['bad']))
		const reserved = captureError(() => rater.rate({ aggregate: {} }))
		if (!isRaterError(nonRecord)) throw new Error('expected a RaterError')
		if (!isRaterError(reserved)) throw new Error('expected a RaterError')
		expect(nonRecord.code).toBe('MISMATCH')
		expect(reserved.code).toBe('MISMATCH')
		rater.destroy()
	})

	it('destroy is idempotent and gates rate plus held manager references with DESTROYED', () => {
		const rater = createRater({ programs: [createPropertyProgramDefinition()] })
		const programs = rater.programs
		rater.destroy()
		rater.destroy()
		const rate = captureError(() => rater.rate(createRatingSubject()))
		const add = captureError(() => programs.add(createPropertyProgramDefinition('next')))
		const list = captureError(() => programs.programs())
		if (!isRaterError(rate)) throw new Error('expected a RaterError')
		if (!isRaterError(add)) throw new Error('expected a RaterError')
		if (!isRaterError(list)) throw new Error('expected a RaterError')
		expect(rate.code).toBe('DESTROYED')
		expect(add.code).toBe('DESTROYED')
		expect(list.code).toBe('DESTROYED')
	})
})

describe('Rater — numeric quirks', () => {
	it('sums only finite field values, skipping Infinity, -Infinity, and NaN', () => {
		const rater = createRater({ programs: [sumsProgram()] })
		const result = rater.rate([
			{ id: 'a', amount: 10 },
			{ id: 'b', amount: Number.POSITIVE_INFINITY },
			{ id: 'c', amount: 20 },
			{ id: 'd', amount: Number.NEGATIVE_INFINITY },
			{ id: 'e', amount: Number.NaN },
			{ id: 'f', amount: 5 },
		])
		expect(result.sums.amount).toBe(35)
		rater.destroy()
	})

	it('accumulates -0 field values as positive zero', () => {
		const rater = createRater({ programs: [sumsProgram()] })
		const result = rater.rate([
			{ id: 'a', amount: -0 },
			{ id: 'b', amount: -0 },
		])
		expect(Object.is(result.sums.amount, 0)).toBe(true)
		expect(Object.is(result.sums.amount, -0)).toBe(false)
		rater.destroy()
	})

	it('overflows finite EXTREME_NUMBERS to Infinity and leaves an unmapped field at zero', () => {
		const rater = createRater({ programs: [sumsProgram(['amount', 'missing'])] })
		const subjects = EXTREME_NUMBERS.map((amount, index) => ({ id: `s${index}`, amount }))
		const result = rater.rate(subjects)
		expect(result.sums.amount).toBe(Number.POSITIVE_INFINITY)
		expect(Object.is(result.sums.missing, 0)).toBe(true)
		rater.destroy()
	})
})

describe('Rater — scale', () => {
	it('rates hundreds of subjects preserving order, count, and exact representable sums', () => {
		const rater = createRater({ programs: [sumsProgram()] })
		const subjects = sequence(500, 1).map((amount) => ({ id: `s${amount}`, amount }))
		const result = rater.rate(subjects)
		expect(result.count).toBe(500)
		expect(result.subjects).toHaveLength(500)
		expect(result.sums.amount).toBe((500 * 501) / 2)
		expect(result.subjects[0]?.subject).toBe(subjects[0])
		expect(result.subjects[499]?.subject).toBe(subjects[499])
		rater.destroy()
	})
})

describe('Rater — group key coercion', () => {
	it('collapses numeric and string group keys through String coercion and merges -0 with 0', () => {
		const rater = createRater({ programs: [sumsProgram(['amount'], 'g')] })
		const result = rater.rate([
			{ id: 'a', g: 7, amount: 1 },
			{ id: 'b', g: '7', amount: 2 },
			{ id: 'c', g: -0, amount: 4 },
			{ id: 'd', g: 0, amount: 16 },
			{ id: 'e', g: true, amount: 8 },
		])
		expect(result.groups).toEqual([
			{ key: '7', count: 2, sums: { amount: 3 } },
			{ key: '0', count: 2, sums: { amount: 20 } },
			{ key: 'true', count: 1, sums: { amount: 8 } },
		])
		rater.destroy()
	})

	it('groups missing and explicit undefined partition keys under the blank string', () => {
		const rater = createRater({ programs: [sumsProgram(['amount'], 'g')] })
		const result = rater.rate([
			{ id: 'a', amount: 1 },
			{ id: 'b', g: undefined, amount: 2 },
			{ id: 'c', g: 'x', amount: 4 },
		])
		expect(result.groups).toEqual([
			{ key: '', count: 2, sums: { amount: 3 } },
			{ key: 'x', count: 1, sums: { amount: 4 } },
		])
		rater.destroy()
	})

	it('keys adversarial group values verbatim in first-seen order', () => {
		const rater = createRater({ programs: [sumsProgram(['amount'], 'g')] })
		const subjects = TRICKY_KEYS.map((g, index) => ({ id: `s${index}`, g, amount: index }))
		const result = rater.rate(subjects)
		expect(result.groups.map((group) => group.key)).toEqual([...TRICKY_KEYS])
		expect(result.groups).toHaveLength(TRICKY_KEYS.length)
		expect(result.groups.every((group) => group.count === 1)).toBe(true)
		rater.destroy()
	})
})

describe('Rater — batch edge cases', () => {
	it('rejects a batch up-front for a reserved-key subject without emitting', () => {
		const rater = createRater({ programs: [sumsProgram()] })
		const events = recordEmitterEvents(rater.emitter, {
			rate: createRecorder<RaterEventMap['rate']>(),
			aggregate: createRecorder<RaterEventMap['aggregate']>(),
		})
		const error = captureError(() =>
			rater.rate([
				{ id: 'ok', amount: 1 },
				{ id: 'bad', outcome: {} },
			]),
		)
		if (!isRaterError(error)) throw new Error('expected a RaterError')
		expect(error.code).toBe('MISMATCH')
		expect(events.rate.count).toBe(0)
		expect(events.aggregate.count).toBe(0)
		rater.destroy()
	})

	it('does not treat a nested reserved key as reserved', () => {
		const rater = createRater({ programs: [sumsProgram()] })
		const subject = { id: 's', data: { aggregate: 1, outcome: 2 }, amount: 5 }
		const result = rater.rate(subject)
		expect(result.subject).toBe(subject)
		expect(result.programs).toHaveLength(1)
		rater.destroy()
	})

	it('surfaces line rating errors in-result while completing the whole batch', () => {
		const program = programDefinition('faulty', 'Faulty', [
			lineDefinition(
				'line',
				'Line',
				quantitativeDefinition('quote', 'Quote', [
					factorGroup('base', 'sum', [staticFactor('boom', Number.POSITIVE_INFINITY)]),
				]),
			),
		])
		const rater = createRater({ validate: false, programs: [program] })
		const result = rater.rate([
			{ id: 'a', amount: 1 },
			{ id: 'b', amount: 2 },
		])
		expect(result.count).toBe(2)
		for (const rated of result.subjects) {
			const outcome = rated.programs[0]
			if (outcome === undefined) throw new Error('expected a program result')
			expect(outcome.success).toBe(false)
			// The program itself ran no passes, so the top-level trace/errors stay
			// empty — the failure surfaces on the line's own worksheet instead.
			expect(outcome.lines[0]?.worksheet?.errors.length).toBeGreaterThan(0)
			expect(outcome.status).toBe('unrated')
		}
		rater.destroy()
	})

	it('validate:false with a pass reasoning the engine has no reasoner for — pins the observed contract', () => {
		const rater = createRater({ validate: false })
		// isProgramDefinition would reject a symbolic pass.definition (PassDefinition
		// only allows logical/quantitative) — validate:false skips that check, and
		// invokeRaw bypasses the statically-typed add() signature to construct it.
		const definition = {
			id: 'unregistered',
			name: 'Unregistered',
			lines: [],
			passes: [{ definition: symbolicDefinition('e', 'E', []) }],
		}
		const program: ProgramInterface = invokeRaw(rater.programs, rater.programs.add, [definition])
		const error = captureError(() => program.rate({ id: 's' }))
		// Observed (this is the locked validate:false contract, not src behavior we
		// changed): the shared engine has no symbolic reasoner registered, and
		// `#engine.reason` throws a raw reason-library `ReasonError('MISSING', …)`
		// synchronously rather than returning a failure result — `program.rate`
		// throws an UNCAUGHT `ReasonError`, it never surfaces as a RaterError or a
		// `success: false` ProgramResult.
		if (!isReasonError(error)) throw new Error('expected a ReasonError')
		expect(error.code).toBe('MISSING')
		expect(error.context).toEqual({ definition: 'e', reasoning: 'symbolic' })
		rater.destroy()
	})
})
