import type { RaterEventMap } from '@src/core'
import {
	atom,
	createProgram,
	createRater,
	isRaterError,
	lineDefinition,
	logicalDefinition,
	passDefinition,
	programDefinition,
	rule,
	rulingDefinition,
	sumAmounts,
} from '@src/core'
import { describe, expect, it } from 'vitest'
import {
	captureError,
	createErrorRecorder,
	createPropertyProgramDefinition,
	createRatingDefinition,
	createRatingSubject,
	createRecorder,
	invokeRaw,
	recordEmitterEvents,
	sequence,
} from '../../../setup.js'

const RATER_EVENTS: readonly (keyof RaterEventMap)[] = ['rate', 'aggregate', 'determine', 'decide']

describe('createRater — options', () => {
	it('creates an empty working rater with no options', () => {
		const rater = createRater()
		expect(rater.programs.size).toBe(0)
		expect(rater.rate(createRatingSubject())).toEqual({
			subject: createRatingSubject(),
			programs: [],
		})
	})

	it('seeds programs and applies rater-wide total and labels', () => {
		const rater = createRater({
			total: sumAmounts,
			labels: { value: 'Insured value' },
			programs: [createPropertyProgramDefinition()],
		})
		const result = rater.rate(createRatingSubject({ coastal: true }))
		const program = result.programs[0]
		const line = program?.lines[0]
		expect(program?.total).toBe(110)
		expect(line?.determinations[0]?.message).toBe('Coastal risk at north')
		expect(line?.worksheet?.groups[0]?.factors[1]?.premises).toEqual([])
	})

	it('wires construction hooks and listener error isolation', () => {
		const rate = createRecorder<RaterEventMap['rate']>()
		const error = createErrorRecorder()
		const rater = createRater({
			programs: [createPropertyProgramDefinition()],
			on: {
				rate: rate.handler,
				determine: () => {
					throw new Error('listener failed')
				},
			},
			error: error.handler,
		})
		const events = recordEmitterEvents(rater.emitter, RATER_EVENTS)
		rater.rate(createRatingSubject({ coastal: true }))
		expect(rate.count).toBe(1)
		expect(events.determine.count).toBe(2)
		expect(error.count).toBe(2)
		expect(error.calls[0]?.[1]).toBe('determine')
	})

	it('honors validate false for trusted extra-key definitions at construction', () => {
		const malformed = {
			id: 'trusted',
			name: 'Trusted',
			lines: [lineDefinition('line', 'Line', createRatingDefinition())],
			extra: true,
		}
		const rater = createRater({ validate: false, programs: [malformed] })
		expect(rater.programs.has('trusted')).toBe(true)
	})
})

describe('createProgram — validation and compilation', () => {
	it('creates a working program from a valid definition', () => {
		const program = createProgram(createPropertyProgramDefinition(), { total: sumAmounts })
		const result = program.rate(createRatingSubject())
		expect(program.id).toBe('property')
		expect(program.name).toBe('Property')
		expect(result.total).toBe(110)
	})

	it('invalid definitions throw RaterError DEFINITION', () => {
		const bad: unknown = { ...programDefinition('bad', 'Bad', {}), metadata: () => 1 }
		const error = captureError(() => invokeRaw(undefined, createProgram, [bad]))
		if (!isRaterError(error)) throw new Error('expected a RaterError')
		expect(error.name).toBe('RaterError')
		expect(error.code).toBe('DEFINITION')
		expect(error.context).toBeUndefined()
	})

	it('unknown line references throw RaterError MISSING with program context', () => {
		const error = captureError(() =>
			createProgram(
				programDefinition('bad-lines', 'Bad lines', {
					lines: [lineDefinition('known', 'Known', createRatingDefinition())],
					rulings: { r1: rulingDefinition('referral', 'missing') },
				}),
			),
		)
		if (!isRaterError(error)) throw new Error('expected a RaterError')
		expect(error.code).toBe('MISSING')
		expect(error.context).toEqual({ program: 'bad-lines' })
	})

	it('deeply freezes the compiled program definition', () => {
		const program = createProgram(createPropertyProgramDefinition())
		expect(Object.isFrozen(program.definition)).toBe(true)
		expect(Object.isFrozen(program.definition.lines)).toBe(true)
		expect(Object.isFrozen(program.definition.lines[0])).toBe(true)
	})
})

describe('createRater — labels', () => {
	it('labels a rated premise via a rater label and omits it when the key is absent', () => {
		const labeled = createRater({
			labels: { coastal: 'Coastal exposure' },
			programs: [createPropertyProgramDefinition()],
		})
		const premise = labeled.rate(createRatingSubject({ coastal: true })).programs[0]?.lines[0]
			?.determinations[0]?.premises[0]
		expect(premise?.field).toBe('coastal')
		expect(premise?.label).toBe('Coastal exposure')

		const unlabeled = createRater({
			labels: { value: 'Insured value' },
			programs: [createPropertyProgramDefinition()],
		})
		const fallback = unlabeled.rate(createRatingSubject({ coastal: true })).programs[0]?.lines[0]
			?.determinations[0]?.premises[0]
		expect(fallback?.field).toBe('coastal')
		expect(fallback?.label).toBeUndefined()
	})

	it('labels premises keyed by unicode and dotted field names', () => {
		for (const key of ['é', 'Å', '\u{1F600}', 'a.b']) {
			const gate = logicalDefinition('gate', 'Gate', [
				rule('flag', [atom(key, 'equals', true)], atom('flag', 'equals', true)),
			])
			const rater = createRater({
				labels: { [key]: `Label ${key}` },
				programs: [
					programDefinition('tricky', 'Tricky', {
						passes: [passDefinition(gate, 'building')],
						rulings: { flag: rulingDefinition('referral', 'building', 'flagged') },
						lines: [lineDefinition('building', 'Building', createRatingDefinition())],
					}),
				],
			})
			const premise = rater.rate(createRatingSubject({ [key]: true })).programs[0]?.lines[0]
				?.determinations[0]?.premises[0]
			expect(premise?.field).toBe(key)
			expect(premise?.label).toBe(`Label ${key}`)
		}
	})

	it('treats an own __proto__ label key as ordinary data without polluting the prototype', () => {
		const key = '__proto__'
		const gate = logicalDefinition('gate', 'Gate', [
			rule('flag', [atom(key, 'equals', true)], atom('flag', 'equals', true)),
		])
		const rater = createRater({
			labels: { [key]: 'Proto label' },
			programs: [
				programDefinition('proto', 'Proto', {
					passes: [passDefinition(gate, 'building')],
					rulings: { flag: rulingDefinition('referral', 'building', 'flagged') },
					lines: [lineDefinition('building', 'Building', createRatingDefinition())],
				}),
			],
		})
		const premise = rater.rate(createRatingSubject({ [key]: true })).programs[0]?.lines[0]
			?.determinations[0]?.premises[0]
		expect(premise?.field).toBe('__proto__')
		expect(premise?.label).toBe('Proto label')
		expect(Object.getPrototypeOf({})).toBe(Object.prototype)
	})
})

describe('createRater — scale seeding', () => {
	it('seeds many programs preserving order, size, and rating', () => {
		const ids = sequence(50).map((index) => `program-${index}`)
		const rater = createRater({
			total: sumAmounts,
			programs: ids.map((id) => createPropertyProgramDefinition(id)),
		})
		expect(rater.programs.size).toBe(ids.length)
		expect(rater.programs.programs().map((program) => program.id)).toEqual(ids)
		const result = rater.rate(createRatingSubject())
		expect(result.programs.map((program) => program.id)).toEqual(ids)
		expect(result.programs.every((program) => program.total === 110)).toBe(true)
	})
})

describe('createRater — duplicate seeds', () => {
	it('throws DUPLICATE when seed programs repeat an id', () => {
		const error = captureError(() =>
			createRater({
				programs: [
					createPropertyProgramDefinition('repeat'),
					createPropertyProgramDefinition('repeat'),
				],
			}),
		)
		if (!isRaterError(error)) throw new Error('expected a RaterError')
		expect(error.code).toBe('DUPLICATE')
		expect(error.context).toEqual({ program: 'repeat' })
	})
})

describe('createRater — validation policy', () => {
	it('trusts an extra-key definition under validate false but rejects it under validate true', () => {
		const definition = {
			...programDefinition('extra-key', 'Extra key', {
				lines: [lineDefinition('line', 'Line', createRatingDefinition())],
			}),
			extra: true,
		}
		const trusted = createRater({ validate: false, programs: [definition] })
		expect(trusted.programs.has('extra-key')).toBe(true)
		const error = captureError(() => createRater({ programs: [definition] }))
		if (!isRaterError(error)) throw new Error('expected a RaterError')
		expect(error.code).toBe('DEFINITION')
		expect(error.context).toBeUndefined()
	})
})

describe('createRater — independence', () => {
	it('creates independent raters from one shared options object', () => {
		const options = { programs: [createPropertyProgramDefinition()] }
		const first = createRater(options)
		const second = createRater(options)
		expect(first.programs.remove('property')).toBe(true)
		expect(first.programs.size).toBe(0)
		expect(second.programs.size).toBe(1)
		expect(second.rate(createRatingSubject()).programs[0]?.id).toBe('property')

		const emptyFirst = createRater()
		const emptySecond = createRater()
		emptyFirst.programs.add(createPropertyProgramDefinition('added'))
		expect(emptyFirst.programs.size).toBe(1)
		expect(emptySecond.programs.size).toBe(0)
	})
})
