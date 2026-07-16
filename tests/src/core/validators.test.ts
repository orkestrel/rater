import { logicalDefinition } from '@orkestrel/reason'
import {
	isLineDefinition,
	isRatingDefinition,
	isStage,
	lineDefinition,
	ratingDefinition,
} from '@src/core'
import { describe, expect, it } from 'vitest'
import { createLine } from '../../setup.js'

const ADVERSARIAL_INPUTS: readonly unknown[] = [
	null,
	undefined,
	0,
	'',
	true,
	Number.NaN,
	[],
	[1, 2, 3],
	Object.create(null),
	{ id: 'a' },
]

describe('validators — isStage', () => {
	it('accepts the three stage literals', () => {
		expect(isStage('factor')).toBe(true)
		expect(isStage('group')).toBe(true)
		expect(isStage('total')).toBe(true)
	})

	it('rejects everything else without throwing', () => {
		for (const input of [...ADVERSARIAL_INPUTS, 'step']) {
			expect(() => isStage(input)).not.toThrow()
			expect(isStage(input)).toBe(false)
		}
	})
})

describe('validators — isLineDefinition', () => {
	const rate = createLine('line', 10).rate

	it('accepts a minimal and a fully-populated line definition', () => {
		expect(isLineDefinition(lineDefinition('line', 'Line', rate))).toBe(true)
		expect(
			isLineDefinition(
				lineDefinition('line', 'Line', rate, { description: 'd', metadata: { a: 1 } }),
			),
		).toBe(true)
	})

	it('accepts a null-prototype record satisfying the exact shape', () => {
		const nullProto: Record<string, unknown> = Object.create(null)
		Object.assign(nullProto, lineDefinition('line', 'Line', rate))
		expect(isLineDefinition(nullProto)).toBe(true)
	})

	it('rejects missing required keys', () => {
		expect(isLineDefinition({ id: 'line', name: 'Line' })).toBe(false)
		expect(isLineDefinition({ name: 'Line', rate })).toBe(false)
		expect(isLineDefinition({ id: 'line', rate })).toBe(false)
	})

	it('rejects wrong-typed fields', () => {
		expect(isLineDefinition({ id: 1, name: 'Line', rate })).toBe(false)
		expect(
			isLineDefinition({ id: 'line', name: 'Line', rate: logicalDefinition('l', 'L', []) }),
		).toBe(false)
		expect(isLineDefinition({ id: 'line', name: 'Line', rate, description: 5 })).toBe(false)
	})

	it('rejects an extra key on an otherwise valid record', () => {
		expect(isLineDefinition({ id: 'line', name: 'Line', rate, bogus: true })).toBe(false)
	})

	it('rejects cyclic metadata without throwing', () => {
		const cyclic: Record<string, unknown> = {}
		cyclic.self = cyclic
		const candidate = { ...lineDefinition('line', 'Line', rate), metadata: cyclic }
		expect(() => isLineDefinition(candidate)).not.toThrow()
		expect(isLineDefinition(candidate)).toBe(false)
	})

	it('walks deeply nested metadata without throwing, rejecting a non-finite leaf', () => {
		let deep: unknown = Number.NaN
		for (let index = 0; index < 500; index += 1) deep = [deep]
		const candidate = { ...lineDefinition('line', 'Line', rate), metadata: deep }
		expect(() => isLineDefinition(candidate)).not.toThrow()
		expect(isLineDefinition(candidate)).toBe(false)
	})

	it('walks deeply nested metadata without throwing, accepting a valid leaf', () => {
		let deep: unknown = 1
		for (let index = 0; index < 500; index += 1) deep = [deep]
		const candidate = { ...lineDefinition('line', 'Line', rate), metadata: deep }
		expect(() => isLineDefinition(candidate)).not.toThrow()
		expect(isLineDefinition(candidate)).toBe(true)
	})

	it('rejects adversarial inputs without throwing', () => {
		for (const input of ADVERSARIAL_INPUTS) {
			expect(() => isLineDefinition(input)).not.toThrow()
			expect(isLineDefinition(input)).toBe(false)
		}
	})
})

describe('validators — isRatingDefinition', () => {
	const line = lineDefinition('line', 'Line', createLine('line', 10).rate)

	it('accepts a minimal and a fully-populated rating definition', () => {
		expect(isRatingDefinition(ratingDefinition('r', 'R', [line]))).toBe(true)
		expect(
			isRatingDefinition(
				ratingDefinition('r', 'R', [line], { description: 'd', metadata: { a: 1 } }),
			),
		).toBe(true)
	})

	it('accepts an empty lines array', () => {
		expect(isRatingDefinition(ratingDefinition('r', 'R', []))).toBe(true)
	})

	it('rejects missing required keys', () => {
		expect(isRatingDefinition({ id: 'r', name: 'R' })).toBe(false)
		expect(isRatingDefinition({ name: 'R', lines: [] })).toBe(false)
	})

	it('rejects a non-array lines and a lines array containing one invalid entry', () => {
		expect(isRatingDefinition({ id: 'r', name: 'R', lines: 'nope' })).toBe(false)
		expect(isRatingDefinition({ id: 'r', name: 'R', lines: [line, { id: 'bad' }] })).toBe(false)
	})

	it('rejects an extra key on an otherwise valid record', () => {
		expect(isRatingDefinition({ id: 'r', name: 'R', lines: [line], bogus: true })).toBe(false)
	})

	it('rejects adversarial inputs without throwing', () => {
		for (const input of ADVERSARIAL_INPUTS) {
			expect(() => isRatingDefinition(input)).not.toThrow()
			expect(isRatingDefinition(input)).toBe(false)
		}
	})
})
