import { logicalDefinition } from '@orkestrel/reason'
import {
	aggregateDefinition,
	createProgram,
	createRater,
	isRaterError,
	lineDefinition,
	noticeDefinition,
	passDefinition,
	programDefinition,
	rulingDefinition,
} from '@src/core'
import { describe, expect, it } from 'vitest'
import {
	captureError,
	createEngine,
	createRatingDefinition,
	createRatingSubject,
	invokeRaw,
} from '../../setup.js'

describe('factories — createRater', () => {
	it('builds a rater with no programs and seeds programs from options', () => {
		const empty = createRater()
		expect(empty.programs.size).toBe(0)
		empty.destroy()

		const rate = createRatingDefinition()
		const seeded = createRater({
			programs: [programDefinition('seed', 'Seed', [lineDefinition('line', 'Line', rate)])],
		})
		expect(seeded.programs.size).toBe(1)
		expect(seeded.programs.has('seed')).toBe(true)
		seeded.destroy()
	})
})

describe('factories — createProgram', () => {
	it('compiles a valid program definition over an injected engine', () => {
		const engine = createEngine()
		const rate = createRatingDefinition()
		const program = createProgram(
			programDefinition('p1', 'P1', [lineDefinition('line', 'Line', rate)]),
			engine,
		)
		expect(program.id).toBe('p1')
		expect(program.rate(createRatingSubject()).lines[0]?.amount).toBe(110)
		engine.destroy()
	})

	it('throws DEFINITION with the program id in context for a malformed definition', () => {
		const engine = createEngine()
		const bad: unknown = { id: 'bad', name: 'Bad', metadata: (): number => 1, lines: [] }
		const error = captureError(() => invokeRaw(undefined, createProgram, [bad, engine]))
		if (!isRaterError(error)) throw new Error('expected a RaterError')
		expect(error.code).toBe('DEFINITION')
		expect(error.context).toEqual({ program: 'bad' })
		engine.destroy()
	})

	it('throws DEFINITION with an undefined program context when the id itself is missing', () => {
		const engine = createEngine()
		const error = captureError(() =>
			invokeRaw(undefined, createProgram, [{ name: 'No id' }, engine]),
		)
		if (!isRaterError(error)) throw new Error('expected a RaterError')
		expect(error.code).toBe('DEFINITION')
		expect(error.context).toEqual({ program: undefined })
		engine.destroy()
	})
})

describe('factories — definition builders', () => {
	it('programDefinition merges overrides over the required id/name/lines', () => {
		const definition = programDefinition('p1', 'P1', [], { description: 'd', metadata: { a: 1 } })
		expect(definition).toEqual({
			id: 'p1',
			name: 'P1',
			lines: [],
			description: 'd',
			metadata: { a: 1 },
		})
	})

	it('lineDefinition merges overrides over the required id/name/rate', () => {
		const rate = createRatingDefinition()
		const definition = lineDefinition('line', 'Line', rate, { description: 'd' })
		expect(definition).toEqual({ id: 'line', name: 'Line', rate, description: 'd' })
	})

	it('passDefinition omits line when absent and includes it when present', () => {
		const definition = logicalDefinition('l', 'L', [])
		expect(passDefinition(definition)).toEqual({ definition })
		expect(passDefinition(definition, 'line')).toEqual({ definition, line: 'line' })
	})

	it('rulingDefinition omits line/message when absent and includes them when present', () => {
		expect(rulingDefinition('restriction')).toEqual({ effect: 'restriction' })
		expect(rulingDefinition('referral', 'line', 'Message')).toEqual({
			effect: 'referral',
			line: 'line',
			message: 'Message',
		})
	})

	it('noticeDefinition omits line when absent and includes it when present', () => {
		expect(noticeDefinition('n1', 'Message')).toEqual({ id: 'n1', message: 'Message' })
		expect(noticeDefinition('n1', 'Message', 'line')).toEqual({
			id: 'n1',
			message: 'Message',
			line: 'line',
		})
	})

	it('aggregateDefinition omits by/gates when absent and includes them when present', () => {
		expect(aggregateDefinition(['amount'])).toEqual({ fields: ['amount'] })
		const gates = logicalDefinition('g', 'G', [])
		expect(aggregateDefinition(['amount'], 'location', gates)).toEqual({
			fields: ['amount'],
			by: 'location',
			gates,
		})
	})
})
