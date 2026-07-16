import type { ReasonEventMap } from '@orkestrel/reason'
import type { RaterEventMap } from '@src/core'
import { check, factorGroup, quantitativeDefinition, staticFactor } from '@orkestrel/reason'
import * as core from '@src/core'
import { createRater, isRaterError, lineDefinition, ratingDefinition } from '@src/core'
import { describe, expect, it } from 'vitest'
import {
	captureError,
	createCheckFailureLine,
	createEngine,
	createLine,
	createLookupFailureLine,
	createRecorder,
	createSubject,
	createTotalRecorder,
	deepFreeze,
	invokeRaw,
} from '../../setup.js'

describe('Rater — line selection', () => {
	it('evaluates only the supplied lines, exactly once per line', () => {
		const engine = createEngine()
		const recorder = createRecorder<ReasonEventMap['reason']>()
		engine.emitter.on('reason', recorder.handler)
		const rater = createRater({ engine })
		const a = createLine('a', 10)
		const b = createLine('b', 20)
		const result = rater.rate([a, b], createSubject())
		expect(result.lines.map((line) => line.id)).toEqual(['a', 'b'])
		expect(recorder.count).toBe(2)
		expect(
			recorder.calls.map((call) =>
				call[0].reasoning === 'quantitative' ? call[0].value : undefined,
			),
		).toEqual([10, 20])
		rater.destroy()
		engine.destroy()
	})

	it('never evaluates an omitted line, even one authored alongside the rated ones', () => {
		const engine = createEngine()
		const recorder = createRecorder<ReasonEventMap['reason']>()
		engine.emitter.on('reason', recorder.handler)
		const rater = createRater({ engine })
		const rated = createLine('rated', 10)
		const omitted = createLine('omitted', 999)
		const catalog = ratingDefinition('catalog', 'Catalog', [rated, omitted])
		const result = rater.rate([rated], createSubject())
		expect(catalog.lines.map((line) => line.id)).toEqual(['rated', 'omitted'])
		expect(result.lines.map((line) => line.id)).toEqual(['rated'])
		expect(recorder.count).toBe(1)
		expect(
			recorder.calls.some((call) => call[0].reasoning === 'quantitative' && call[0].value === 999),
		).toBe(false)
		rater.destroy()
		engine.destroy()
	})
})

describe('Rater — result shape', () => {
	it('LineResult carries exactly id, name, worksheet, success — amount only on success', () => {
		const rater = createRater()
		const result = rater.rate(
			[createLine('ok', 10), createLookupFailureLine('bad')],
			createSubject({ region: 'north' }),
		)
		const ok = result.lines.find((line) => line.id === 'ok')
		const bad = result.lines.find((line) => line.id === 'bad')
		if (ok === undefined || bad === undefined) throw new Error('expected both line results')
		expect(Object.keys(ok)).toEqual(['id', 'name', 'amount', 'worksheet', 'success'])
		expect(Object.keys(bad)).toEqual(['id', 'name', 'worksheet', 'success'])
		rater.destroy()
	})

	it('RatingResult carries exactly lines and success — total only when defined', () => {
		const rater = createRater()
		const withTotal = rater.rate([createLine('a', 10)], createSubject())
		const withoutTotal = rater.rate(
			[createLookupFailureLine('bad')],
			createSubject({ region: 'north' }),
		)
		expect(Object.keys(withTotal)).toEqual(['lines', 'total', 'success'])
		expect(Object.keys(withoutTotal)).toEqual(['lines', 'success'])
		rater.destroy()
	})

	it('the barrel exposes none of the removed program-era symbols', () => {
		const removed = [
			'combineEligibilities',
			'isEligibility',
			'deriveStatus',
			'decideEligibility',
			'aggregateSums',
			'tallySubject',
			'passDefinition',
			'noticeDefinition',
			'aggregateDefinition',
			'interpolateMessage',
			'rulingDefinition',
			'isRuling',
			'isNotice',
			'isPassDefinition',
			'isAggregateDefinition',
			'isRulings',
			'isDecision',
			'isStatus',
			'isEffect',
			'isProgramDefinition',
			'describeComparison',
			'describeValue',
			'describePremise',
			'describeExpression',
			'logicalPremises',
			'findRule',
			'rulesToDeterminations',
			'authorityToDeterminations',
			'noticesToDeterminations',
			'filterLineDeterminations',
			'filterProgramDeterminations',
			'deriveDeterminationEligibility',
			'hasReservedKey',
			'assertSubject',
			'aggregateGroups',
			'aggregateProjection',
			'aggregateRecord',
			'emptySums',
			'emptyTallies',
			'completeTallies',
			'Program',
			'ProgramManager',
		]
		for (const name of removed) {
			expect(Object.hasOwn(core, name)).toBe(false)
		}
	})
})

describe('Rater — quantitative-only dispatch', () => {
	it('dispatches only quantitative definitions when the injected engine also carries a logical reasoner', () => {
		const engine = createEngine({ logical: true })
		const recorder = createRecorder<ReasonEventMap['reason']>()
		engine.emitter.on('reason', recorder.handler)
		const rater = createRater({ engine })
		rater.rate([createLine('a', 10), createLine('b', 20)], createSubject())
		expect(recorder.count).toBe(2)
		expect(recorder.calls.every((call) => call[0].reasoning === 'quantitative')).toBe(true)
		rater.destroy()
		engine.destroy()
	})

	it('a self-owned rater rates correctly though no logical reasoner exists anywhere in the process', () => {
		const rater = createRater()
		const result = rater.rate([createLine('a', 10)], createSubject())
		expect(result.success).toBe(true)
		expect(result.total).toBe(10)
		rater.destroy()
	})
})

describe('Rater — rating failures', () => {
	it('a missing lookup key with no fallback on a required factor fails the line and the rating', () => {
		const rater = createRater()
		const result = rater.rate([createLookupFailureLine('line')], createSubject({ region: 'north' }))
		const line = result.lines[0]
		if (line === undefined) throw new Error('expected a line result')
		expect(line.success).toBe(false)
		expect(line.amount).toBeUndefined()
		expect(line.worksheet.errors.length).toBeGreaterThan(0)
		expect(result.success).toBe(false)
		rater.destroy()
	})

	it('a failed required check factor fails the line and the rating', () => {
		const rater = createRater()
		const result = rater.rate([createCheckFailureLine('line')], createSubject({ age: 25 }))
		const line = result.lines[0]
		if (line === undefined) throw new Error('expected a line result')
		expect(line.success).toBe(false)
		expect(line.amount).toBeUndefined()
		expect(line.worksheet.errors.length).toBeGreaterThan(0)
		expect(result.success).toBe(false)
		rater.destroy()
	})
})

describe('Rater — totals', () => {
	it('sums only the successful lines when some fail', () => {
		const rater = createRater()
		const result = rater.rate(
			[createLine('good', 10), createLookupFailureLine('bad')],
			createSubject({ region: 'north' }),
		)
		expect(result.total).toBe(10)
		expect(result.success).toBe(false)
		rater.destroy()
	})

	it('total is undefined when every line fails', () => {
		const rater = createRater()
		const result = rater.rate(
			[createLookupFailureLine('bad1'), createCheckFailureLine('bad2')],
			createSubject({ region: 'north', age: 25 }),
		)
		expect(result.total).toBeUndefined()
		expect(result.success).toBe(false)
		rater.destroy()
	})

	it('a custom total handler overrides the default and receives the rated lines', () => {
		const recorder = createTotalRecorder(999)
		const rater = createRater({ total: recorder.handler })
		const result = rater.rate([createLine('a', 10)], createSubject())
		expect(result.total).toBe(999)
		expect(recorder.count).toBe(1)
		expect(recorder.calls[0]).toBe(result.lines)
		rater.destroy()
	})

	it('an empty line list rates successfully with an undefined total', () => {
		const rater = createRater()
		const result = rater.rate([], createSubject())
		expect(result).toEqual({ lines: [], success: true })
		rater.destroy()
	})
})

describe('Rater — immutability', () => {
	it('never mutates a frozen subject, frozen line definitions, or a frozen rating definition', () => {
		const subject = deepFreeze(createSubject({ region: 'north' }))
		const line = deepFreeze(createLookupFailureLine('line'))
		const rating = deepFreeze(ratingDefinition('r', 'R', [line]))
		const beforeSubject = structuredClone(subject)
		const beforeRating = structuredClone(rating)
		const rater = createRater()
		expect(() => rater.rate(rating, subject)).not.toThrow()
		expect(subject).toEqual(beforeSubject)
		expect(rating).toEqual(beforeRating)
		rater.destroy()
	})
})

describe('Rater — engine ownership and destroy', () => {
	it('destroy is idempotent', () => {
		const rater = createRater()
		rater.destroy()
		expect(() => rater.destroy()).not.toThrow()
	})

	it('rate after destroy throws DESTROYED', () => {
		const rater = createRater()
		rater.destroy()
		const error = captureError(() => rater.rate([], createSubject()))
		if (!isRaterError(error)) throw new Error('expected a RaterError')
		expect(error.code).toBe('DESTROYED')
	})

	it('an injected engine survives the rater that used it being destroyed', () => {
		const engine = createEngine()
		const rater = createRater({ engine })
		rater.destroy()
		const result = engine.reason(createSubject(), createLine('a', 10).rate)
		expect(result.success).toBe(true)
		engine.destroy()
	})

	it('a self-owned rater leaves no way to rate once destroyed', () => {
		const rater = createRater()
		rater.destroy()
		const error = captureError(() => rater.rate([createLine('a', 10)], createSubject()))
		if (!isRaterError(error)) throw new Error('expected a RaterError')
		expect(error.code).toBe('DESTROYED')
	})

	it('construction hooks receive the rate event exactly once before destroy tears the emitter down', () => {
		const recorder = createRecorder<RaterEventMap['rate']>()
		const rater = createRater({ on: { rate: recorder.handler } })
		rater.rate([createLine('a', 10)], createSubject())
		expect(recorder.count).toBe(1)
		rater.destroy()
		expect(recorder.count).toBe(1)
	})

	it('the emitter getter remains accessible after destroy, though the underlying emitter is destroyed', () => {
		const rater = createRater()
		rater.destroy()
		const emitter = rater.emitter
		expect(emitter.destroyed).toBe(true)
	})
})

describe('Rater — rate overloads', () => {
	it('the array-of-lines and rating-definition overloads produce equal results for equal lines', () => {
		const lines = [createLine('a', 10), createLine('b', 20)]
		const definition = ratingDefinition('r', 'R', lines)
		const subject = createSubject()
		const rater = createRater()
		const fromArray = rater.rate(lines, subject)
		const fromDefinition = rater.rate(definition, subject)
		expect(fromArray).toEqual(fromDefinition)
		rater.destroy()
	})
})

describe('Rater — errors', () => {
	it('throws DEFINITION for an input that is neither a line array nor a rating definition', () => {
		const rater = createRater()
		const error = captureError(() =>
			invokeRaw(rater, rater.rate, [{ bogus: true }, createSubject()]),
		)
		if (!isRaterError(error)) throw new Error('expected a RaterError')
		expect(error.code).toBe('DEFINITION')
		rater.destroy()
	})

	it('throws MISMATCH for a non-record subject', () => {
		const rater = createRater()
		const error = captureError(() => invokeRaw(rater, rater.rate, [[], 'not-a-record']))
		if (!isRaterError(error)) throw new Error('expected a RaterError')
		expect(error.code).toBe('MISMATCH')
		rater.destroy()
	})
})

describe('Rater — events', () => {
	it('fires the rate event exactly once per rate() call, carrying the subject and the result', () => {
		const rater = createRater()
		const recorder = createRecorder<RaterEventMap['rate']>()
		rater.emitter.on('rate', recorder.handler)
		const subject = createSubject()
		const result = rater.rate([createLine('a', 10)], subject)
		expect(recorder.count).toBe(1)
		expect(recorder.calls[0]).toEqual([subject, result])
		rater.destroy()
	})
})

describe('Rater — labels', () => {
	it('threads the labels option into a resolved Premise.label', () => {
		const line = lineDefinition(
			'line',
			'Line',
			quantitativeDefinition('quote', 'Quote', [
				factorGroup('group', 'sum', [
					staticFactor('flag', 10, { checks: [check('age', 'above', 18)] }),
				]),
			]),
		)
		const rater = createRater({ labels: { age: 'Age' } })
		const result = rater.rate([line], createSubject({ age: 25 }))
		const premise = result.lines[0]?.worksheet.groups[0]?.factors[0]?.premises[0]
		if (premise === undefined) throw new Error('expected a premise')
		expect(premise.label).toBe('Age')
		rater.destroy()
	})
})
