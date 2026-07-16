import {
	createRater,
	isLineDefinition,
	isRatingDefinition,
	lineDefinition,
	ratingDefinition,
} from '@src/core'
import { describe, expect, it } from 'vitest'
import { createEngine, createLine, createSubject } from '../../setup.js'

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
