import {
	createRater,
	isLineDefinition,
	isRatingDefinition,
	lineDefinition,
	ratingDefinition,
	RaterError,
} from '@src/core'
import { describe, expect, it } from 'vitest'
import {
	createEngine,
	createLine,
	createQuoteRate,
	createRecorder,
	createSubject,
} from '../../setup.js'

describe('factories — createRater', () => {
	it('creates a self-owned rater usable immediately', () => {
		const rater = createRater()
		const result = rater.rate([], createSubject())
		expect(result.success).toBe(true)
		rater.destroy()
	})

	it('creates a rater over an injected engine that survives its destroy', () => {
		const engine = createEngine()
		const rater = createRater({ engine })
		const result = rater.rate([createLine('a', 10)], createSubject())
		expect(result.total).toBe(10)
		rater.destroy()
		const stillWorks = engine.reason(createSubject(), createLine('a', 10).rate)
		expect(stillWorks.success).toBe(true)
		engine.destroy()
	})

	it('threads an injected engine, a total override, labels, and an on.rate hook together', () => {
		const engine = createEngine()
		const recorder = createRecorder<[subject: ReturnType<typeof createSubject>, result: unknown]>()
		const rater = createRater({
			engine,
			total: () => 999,
			labels: { seats: 'Seat Count' },
			on: { rate: recorder.handler },
		})
		const line = lineDefinition('quote', 'Quote', createQuoteRate())
		const result = rater.rate([line], createSubject())

		expect(result.total).toBe(999)
		const premise = result.lines[0].worksheet.groups[0].factors
			.flatMap((factor) => factor.premises)
			.find((entry) => entry.field === 'seats')
		expect(premise?.label).toBe('Seat Count')
		expect(recorder.count).toBe(1)
		expect(recorder.calls[0][1]).toBe(result)

		rater.destroy()
		const stillWorks = engine.reason(createSubject(), createLine('a', 10).rate)
		expect(stillWorks.success).toBe(true)
		engine.destroy()
	})
})

describe('factories — createRater destroy semantics', () => {
	it('an owned engine is torn down on destroy — rate() afterwards throws DESTROYED', () => {
		const rater = createRater()
		rater.destroy()
		let thrown: unknown
		try {
			rater.rate([], createSubject())
		} catch (error) {
			thrown = error
		}
		expect(thrown).toBeInstanceOf(RaterError)
		expect(thrown instanceof RaterError ? thrown.code : undefined).toBe('DESTROYED')
	})

	it('an injected engine is not torn down on destroy — it keeps working directly', () => {
		const engine = createEngine()
		const rater = createRater({ engine })
		rater.destroy()
		const stillWorks = engine.reason(createSubject(), createLine('a', 10).rate)
		expect(stillWorks.success).toBe(true)
		engine.destroy()
	})
})

describe('factories — lineDefinition', () => {
	it('merges overrides over the required id, name, and rate', () => {
		const rate = createLine('line', 10).rate
		const definition = lineDefinition('line', 'Line', rate, {
			description: 'd',
			metadata: { a: 1 },
		})
		expect(definition).toEqual({
			id: 'line',
			name: 'Line',
			rate,
			description: 'd',
			metadata: { a: 1 },
		})
	})

	it('omits optional fields when overrides are absent', () => {
		const rate = createLine('line', 10).rate
		const definition = lineDefinition('line', 'Line', rate)
		expect(definition).toEqual({ id: 'line', name: 'Line', rate })
	})
})

describe('factories — ratingDefinition', () => {
	it('merges overrides over the required id, name, and lines', () => {
		const line = lineDefinition('line', 'Line', createLine('line', 10).rate)
		const definition = ratingDefinition('r', 'R', [line], { description: 'd', metadata: { a: 1 } })
		expect(definition).toEqual({
			id: 'r',
			name: 'R',
			lines: [line],
			description: 'd',
			metadata: { a: 1 },
		})
	})

	it('omits optional fields when overrides are absent', () => {
		const line = lineDefinition('line', 'Line', createLine('line', 10).rate)
		const definition = ratingDefinition('r', 'R', [line])
		expect(definition).toEqual({ id: 'r', name: 'R', lines: [line] })
	})
})

describe('factories — validator round-trip', () => {
	it('a built line definition satisfies isLineDefinition', () => {
		const line = lineDefinition('line', 'Line', createLine('line', 10).rate, { description: 'd' })
		expect(isLineDefinition(line)).toBe(true)
	})

	it('a built rating definition satisfies isRatingDefinition', () => {
		const line = lineDefinition('line', 'Line', createLine('line', 10).rate)
		const rating = ratingDefinition('r', 'R', [line], { description: 'd' })
		expect(isRatingDefinition(rating)).toBe(true)
	})
})
