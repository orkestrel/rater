import type { FieldPath, ProgramDefinition, RaterEventMap } from '@src/core'
import {
	aggregateDefinition,
	createRater,
	factorGroup,
	isRaterError,
	lineDefinition,
	programDefinition,
	quantitativeDefinition,
	staticFactor,
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
	repeatValue,
	sequence,
} from '../../../setup.js'

const RATER_EVENTS: readonly (keyof RaterEventMap)[] = ['rate', 'aggregate', 'determine', 'decide']

describe('Rater — rate overloads', () => {
	it('rates a single subject to a SubjectResult in manager insertion order', () => {
		const rater = createRater({ total: sumAmounts })
		rater.programs.add(createPropertyProgramDefinition('first'))
		rater.programs.add(createPropertyProgramDefinition('second'))
		const result = rater.rate(createRatingSubject())
		expect(result.subject).toEqual(createRatingSubject())
		expect(result.programs.map((program) => program.id)).toEqual(['first', 'second'])
		expect(result.programs[0]?.total).toBe(110)
	})

	it('rates an array to an AggregateResult and handles an empty batch', () => {
		const rater = createRater({ programs: [createAggregateProgramDefinition()] })
		const result = rater.rate([
			createRatingSubject({ value: 10 }),
			createRatingSubject({ value: 20 }),
		])
		const empty = createRater().rate([])
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
	})
})

describe('Rater — batch aggregates', () => {
	it('computes raw aggregate sums, groups missing keys under blank, and projects aggregates into subject rating', () => {
		const rater = createRater({ total: sumAmounts, programs: [createAggregateProgramDefinition()] })
		const result = rater.rate([
			createRatingSubject({ id: 'a', value: 100, location: 'north' }),
			createRatingSubject({ id: 'b', value: 60, location: 'north' }),
			createRatingSubject({ id: 'c', value: 5, location: undefined }),
		])
		expect(result.sums).toEqual({ value: 165 })
		expect(result.groups).toEqual([
			{ key: 'north', count: 2, sums: { value: 160 } },
			{ key: '', count: 1, sums: { value: 5 } },
		])
		expect(result.determinations.map((entry) => [entry.id, entry.effect, entry.applied])).toEqual([
			['portfolio', 'referral', true],
			['group', 'condition', false],
			['portfolio', 'referral', true],
			['group', 'condition', true],
			['portfolio', 'referral', false],
			['group', 'condition', false],
		])
		expect(result.subjects[0]?.programs[0]?.determinations).toEqual([])
	})

	it('completes tallies for every status for every program id', () => {
		const rater = createRater({ total: sumAmounts, programs: [createAggregateProgramDefinition()] })
		const result = rater.rate([
			createRatingSubject({ value: 10 }),
			createRatingSubject({ value: 20 }),
		])
		const tally = result.tallies.aggregate
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
	})
})

describe('Rater — events', () => {
	it('fires post-hoc subject, determination, decision, and aggregate events in order', () => {
		const rater = createRater({
			total: sumAmounts,
			programs: [createPropertyProgramDefinition(), createAuthorityProgramDefinition()],
		})
		const events = recordEmitterEvents(rater.emitter, RATER_EVENTS)
		rater.rate([
			createRatingSubject({ coastal: true, value: 1 }),
			createRatingSubject({ coastal: false, value: 1 }),
		])
		expect(events.rate.count).toBe(2)
		expect(events.aggregate.count).toBe(1)
		expect(events.determine.calls.map((call) => call[0].id)).toEqual([
			'coastal',
			'notice',
			'notice',
		])
		expect(events.decide.count).toBe(2)
		expect(events.aggregate.calls[0]?.[0].count).toBe(2)
	})

	it('construction on hooks receive events and throwing listeners are isolated', () => {
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
	})

	it('destroy is idempotent and gates rate plus held manager references with MISSING', () => {
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
		expect(rate.code).toBe('MISSING')
		expect(add.code).toBe('MISSING')
		expect(list.code).toBe('MISSING')
	})
})

// A minimal aggregate program: an `amount`-summing aggregate (optionally partitioned
// by `by`) over a line that always rates to a finite `0` — so status is deterministically
// `eligible` and the only variable under test is the aggregation itself.
function sumsProgram(fields: readonly FieldPath[] = ['amount'], by?: FieldPath): ProgramDefinition {
	return programDefinition('sums', 'Sums', {
		aggregate: aggregateDefinition(fields, by),
		lines: [
			lineDefinition(
				'line',
				'Line',
				quantitativeDefinition('quote', 'Quote', [
					factorGroup('base', 'sum', [staticFactor('base', 0)]),
				]),
			),
		],
	})
}

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
	})

	it('accumulates -0 field values as positive zero', () => {
		const rater = createRater({ programs: [sumsProgram()] })
		const result = rater.rate([
			{ id: 'a', amount: -0 },
			{ id: 'b', amount: -0 },
		])
		expect(Object.is(result.sums.amount, 0)).toBe(true)
		expect(Object.is(result.sums.amount, -0)).toBe(false)
	})

	it('preserves IEEE rounding when accumulation crosses 2^53', () => {
		const rater = createRater({ programs: [sumsProgram()] })
		const result = rater.rate([
			{ id: 'a', amount: Number.MAX_SAFE_INTEGER },
			{ id: 'b', amount: 1 },
			{ id: 'c', amount: 1 },
		])
		expect(result.sums.amount).toBe(9007199254740992)
	})

	it('reports the real float accumulation of many 0.1 field values', () => {
		const rater = createRater({ programs: [sumsProgram()] })
		const subjects = repeatValue(10, 0.1).map((amount, index) => ({ id: `s${index}`, amount }))
		const result = rater.rate(subjects)
		expect(result.sums.amount).toBe(0.9999999999999999)
	})

	it('exhibits catastrophic cancellation in subject order', () => {
		const rater = createRater({ programs: [sumsProgram()] })
		const result = rater.rate([
			{ id: 'a', amount: 1e16 },
			{ id: 'b', amount: 1 },
			{ id: 'c', amount: -1e16 },
		])
		expect(result.sums.amount).toBe(0)
	})

	it('overflows finite EXTREME_NUMBERS to Infinity and leaves an unmapped field at zero', () => {
		const rater = createRater({ programs: [sumsProgram(['amount', 'missing'])] })
		const subjects = EXTREME_NUMBERS.map((amount, index) => ({ id: `s${index}`, amount }))
		const result = rater.rate(subjects)
		expect(result.sums.amount).toBe(Number.POSITIVE_INFINITY)
		expect(Object.is(result.sums.missing, 0)).toBe(true)
	})
})

describe('Rater — scale', () => {
	it('rates 1000 subjects preserving order, count, and exact representable sums', () => {
		const rater = createRater({ programs: [sumsProgram()] })
		const subjects = sequence(1000, 1).map((amount) => ({ id: `s${amount}`, amount }))
		const result = rater.rate(subjects)
		expect(result.count).toBe(1000)
		expect(result.subjects).toHaveLength(1000)
		expect(result.sums.amount).toBe(500500)
		expect(result.subjects[0]?.subject).toBe(subjects[0])
		expect(result.subjects[999]?.subject).toBe(subjects[999])
		expect(
			result.subjects
				.map((rated) => rated.subject)
				.every((entry, index) => entry === subjects[index]),
		).toBe(true)
	})

	it('completes every status bucket and fires one rate event per subject at scale', () => {
		const rater = createRater({ programs: [sumsProgram()] })
		const events = recordEmitterEvents(rater.emitter, RATER_EVENTS)
		const subjects = sequence(500, 1).map((amount) => ({ id: `s${amount}`, amount }))
		const result = rater.rate(subjects)
		const tally = result.tallies.sums
		expect(tally.eligible.count).toBe(500)
		expect(tally.eligible.sums.amount).toBe(125250)
		expect(tally.ineligible.count).toBe(0)
		expect(tally.unrated.count).toBe(0)
		expect(events.rate.count).toBe(500)
		expect(events.aggregate.count).toBe(1)
		expect(events.determine.count).toBe(0)
		expect(events.decide.count).toBe(0)
		expect(events.rate.calls[0]?.[0].subject).toBe(subjects[0])
		expect(events.rate.calls[499]?.[0].subject).toBe(subjects[499])
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
	})

	it('keys unicode and adversarial group values verbatim in first-seen order', () => {
		const rater = createRater({ programs: [sumsProgram(['amount'], 'g')] })
		const subjects = TRICKY_KEYS.map((g, index) => ({ id: `s${index}`, g, amount: index }))
		const result = rater.rate(subjects)
		expect(result.groups.map((group) => group.key)).toEqual([...TRICKY_KEYS])
		expect(result.groups).toHaveLength(TRICKY_KEYS.length)
		expect(result.groups.every((group) => group.count === 1)).toBe(true)
	})
})

describe('Rater — batch edge cases', () => {
	it('rates every subject when ids repeat across a batch', () => {
		const rater = createRater({ programs: [sumsProgram()] })
		const result = rater.rate([
			{ id: 'dup', amount: 10 },
			{ id: 'dup', amount: 20 },
		])
		expect(result.count).toBe(2)
		expect(result.subjects).toHaveLength(2)
		expect(result.sums.amount).toBe(30)
		expect(result.tallies.sums.eligible.count).toBe(2)
		expect(result.subjects.map((rated) => rated.subject)).toEqual([
			{ id: 'dup', amount: 10 },
			{ id: 'dup', amount: 20 },
		])
	})

	it('rejects a batch up-front for a reserved-key subject without emitting', () => {
		const rater = createRater({ programs: [sumsProgram()] })
		const events = recordEmitterEvents(rater.emitter, RATER_EVENTS)
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
	})

	it('does not treat a nested reserved key as reserved', () => {
		const rater = createRater({ programs: [sumsProgram()] })
		const subject = { id: 's', data: { aggregate: 1, outcome: 2 }, amount: 5 }
		const result = rater.rate(subject)
		expect(result.subject).toBe(subject)
		expect(result.programs).toHaveLength(1)
	})

	it('throws MISMATCH for a single subject owning the outcome reserved key', () => {
		const rater = createRater()
		const error = captureError(() => rater.rate({ id: 's', outcome: {} }))
		if (!isRaterError(error)) throw new Error('expected a RaterError')
		expect(error.code).toBe('MISMATCH')
	})

	it('surfaces line rating errors in-result while completing the whole batch', () => {
		const program = programDefinition('faulty', 'Faulty', {
			lines: [
				lineDefinition(
					'line',
					'Line',
					quantitativeDefinition('quote', 'Quote', [
						factorGroup('base', 'sum', [staticFactor('boom', Number.POSITIVE_INFINITY)]),
					]),
				),
			],
		})
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
			expect(outcome.errors.length).toBeGreaterThan(0)
			expect(outcome.status).toBe('unrated')
		}
	})

	it('applies aggregate gates per group so some partitions fail over many subjects', () => {
		const rater = createRater({ total: sumAmounts, programs: [createAggregateProgramDefinition()] })
		const north = sequence(10).map((index) =>
			createRatingSubject({ id: `n${index}`, value: 20, location: 'north' }),
		)
		const south = sequence(10).map((index) =>
			createRatingSubject({ id: `s${index}`, value: 5, location: 'south' }),
		)
		const result = rater.rate([...north, ...south])
		expect(result.count).toBe(20)
		expect(result.sums).toEqual({ value: 250 })
		expect(result.groups).toEqual([
			{ key: 'north', count: 10, sums: { value: 200 } },
			{ key: 'south', count: 10, sums: { value: 50 } },
		])
		expect(result.determinations.map((entry) => [entry.id, entry.applied])).toEqual([
			['portfolio', true],
			['group', false],
			['portfolio', true],
			['group', true],
			['portfolio', false],
			['group', false],
		])
	})
})
