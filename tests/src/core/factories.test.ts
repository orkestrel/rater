import { createRater, lineDefinition, RaterError } from '@src/core'
import { describe, expect, it } from 'vitest'
import { createRecorder } from '@orkestrel/test'
import { createEngine, createLine, createQuoteRate, createSubject } from '../../setup.js'

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
		const rated = result.lines[0]
		if (rated === undefined) throw new Error('Expected one rated line')
		const group = rated.worksheet.groups[0]
		if (group === undefined) throw new Error('Expected one worksheet group')
		const evidence = group.factors
			.flatMap((factor) => factor.evidence)
			.find((entry) => entry.field === 'seats')
		expect(evidence?.label).toBe('Seat Count')
		expect(recorder.count).toBe(1)
		const call = recorder.calls[0]
		if (call === undefined) throw new Error('Expected one recorded call')
		expect(call[1]).toBe(result)

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
