import type { ProgramManagerEventMap } from '@src/core'
import {
	isRaterError,
	lineDefinition,
	ProgramManager,
	programDefinition,
	rulingDefinition,
	sumAmounts,
} from '@src/core'
import { describe, expect, it } from 'vitest'
import {
	captureError,
	createEngine,
	createPropertyProgramDefinition,
	createRatingDefinition,
	createRecorder,
	invokeRaw,
	recordEmitterEvents,
	sequence,
	TRICKY_KEYS,
} from '../../setup.js'

describe('ProgramManager — accessors', () => {
	it('reports size, membership, lookup, insertion order, and a fresh array copy', () => {
		const engine = createEngine()
		const manager = new ProgramManager(engine, { total: sumAmounts })
		const first = manager.add(createPropertyProgramDefinition('first'))
		const second = manager.add(createPropertyProgramDefinition('second'))
		const programs = manager.programs()
		invokeRaw<number>(programs, Array.prototype.push, [first])
		expect(manager.size).toBe(2)
		expect(manager.has('first')).toBe(true)
		expect(manager.has('missing')).toBe(false)
		expect(manager.program('first')).toBe(first)
		expect(manager.program('missing')).toBeUndefined()
		expect(programs.map((program) => program.id)).toEqual(['first', 'second', 'first'])
		expect(manager.programs().map((program) => program.id)).toEqual(['first', 'second'])
		expect(second.rate({ id: 's', seats: 0, coastal: false }).total).toBe(100)
		engine.destroy()
	})
})

describe('ProgramManager — add', () => {
	it('throws DUPLICATE with context for repeated ids', () => {
		const engine = createEngine()
		const manager = new ProgramManager(engine)
		manager.add(createPropertyProgramDefinition())
		const error = captureError(() => manager.add(createPropertyProgramDefinition()))
		if (!isRaterError(error)) throw new Error('expected a RaterError')
		expect(error.name).toBe('RaterError')
		expect(error.code).toBe('DUPLICATE')
		expect(error.context).toEqual({ program: 'property' })
		engine.destroy()
	})

	it('throws DEFINITION when validation is enabled (default) and shape fails', () => {
		const engine = createEngine()
		const manager = new ProgramManager(engine)
		const bad: unknown = { ...programDefinition('bad', 'Bad', []), metadata: (): number => 1 }
		const error = captureError(() => invokeRaw(manager, manager.add, [bad]))
		if (!isRaterError(error)) throw new Error('expected a RaterError')
		expect(error.code).toBe('DEFINITION')
		expect(error.context).toEqual({ program: 'bad' })
		engine.destroy()
	})

	it('validate false skips shape validation for a definition carrying an extra key', () => {
		const engine = createEngine()
		const manager = new ProgramManager(engine, { validate: false })
		const raw = {
			id: 'trusted',
			name: 'Trusted',
			lines: [lineDefinition('line', 'Line', createRatingDefinition())],
			extra: true,
		}
		const program = invokeRaw<ReturnType<ProgramManager['add']>>(manager, manager.add, [raw])
		expect(program.id).toBe('trusted')
		engine.destroy()
	})

	it('validate false still throws MISSING for an unknown line reference', () => {
		const engine = createEngine()
		const manager = new ProgramManager(engine, { validate: false })
		const error = captureError(() =>
			manager.add(
				programDefinition(
					'bad-lines',
					'Bad lines',
					[lineDefinition('known', 'Known', createRatingDefinition())],
					{
						rulings: { r1: rulingDefinition('referral', 'missing') },
					},
				),
			),
		)
		if (!isRaterError(error)) throw new Error('expected a RaterError')
		expect(error.code).toBe('MISSING')
		expect(error.context).toEqual({ program: 'bad-lines' })
		engine.destroy()
	})

	it('emits add with the new program id', () => {
		const engine = createEngine()
		const manager = new ProgramManager(engine)
		const events = recordEmitterEvents(manager.emitter, {
			add: createRecorder<ProgramManagerEventMap['add']>(),
		})
		manager.add(createPropertyProgramDefinition('first'))
		expect(events.add.calls).toEqual([['first']])
		engine.destroy()
	})
})

describe('ProgramManager — remove and destroy', () => {
	it('remove() clears all programs and emits remove per id', () => {
		const engine = createEngine()
		const manager = new ProgramManager(engine)
		manager.add(createPropertyProgramDefinition('first'))
		manager.add(createPropertyProgramDefinition('second'))
		const events = recordEmitterEvents(manager.emitter, {
			remove: createRecorder<ProgramManagerEventMap['remove']>(),
		})
		manager.remove()
		expect(manager.size).toBe(0)
		expect(manager.programs()).toEqual([])
		expect(events.remove.calls).toEqual([['first'], ['second']])
		engine.destroy()
	})

	it('remove(id) returns whether a program was removed', () => {
		const engine = createEngine()
		const manager = new ProgramManager(engine)
		manager.add(createPropertyProgramDefinition('first'))
		expect(manager.remove('first')).toBe(true)
		expect(manager.remove('first')).toBe(false)
		engine.destroy()
	})

	it('remove(ids[]) succeeds only when every id is removed', () => {
		const engine = createEngine()
		const manager = new ProgramManager(engine)
		manager.add(createPropertyProgramDefinition('first'))
		manager.add(createPropertyProgramDefinition('second'))
		expect(manager.remove(['first', 'second'])).toBe(true)
		manager.add(createPropertyProgramDefinition('third'))
		expect(manager.remove(['third', 'missing'])).toBe(false)
		expect(manager.size).toBe(0)
		engine.destroy()
	})

	it('remove([]) succeeds vacuously and removes nothing', () => {
		const engine = createEngine()
		const manager = new ProgramManager(engine)
		manager.add(createPropertyProgramDefinition('first'))
		expect(manager.remove([])).toBe(true)
		expect(manager.size).toBe(1)
		engine.destroy()
	})

	it('destroy clears programs, emits destroy once, and every public method throws DESTROYED after', () => {
		const engine = createEngine()
		const manager = new ProgramManager(engine)
		manager.add(createPropertyProgramDefinition())
		const events = recordEmitterEvents(manager.emitter, {
			destroy: createRecorder<ProgramManagerEventMap['destroy']>(),
		})
		manager.destroy()
		manager.destroy()
		expect(events.destroy.count).toBe(1)
		const expectDestroyed = (thunk: () => unknown): void => {
			const error = captureError(thunk)
			if (!isRaterError(error)) throw new Error('expected a RaterError')
			expect(error.code).toBe('DESTROYED')
		}
		expectDestroyed(() => manager.size)
		expectDestroyed(() => manager.has('kept'))
		expectDestroyed(() => manager.program('kept'))
		expectDestroyed(() => manager.programs())
		expectDestroyed(() => manager.add(createPropertyProgramDefinition('new')))
		expectDestroyed(() => manager.remove('kept'))
		expectDestroyed(() => manager.remove(['kept']))
		expectDestroyed(() => manager.remove())
		engine.destroy()
	})
})

describe('ProgramManager — scale', () => {
	it('holds hundreds of programs with stable size, lookup, and insertion order', () => {
		const engine = createEngine()
		const manager = new ProgramManager(engine)
		const ids = sequence(250).map((index) => `program-${index}`)
		for (const id of ids) manager.add(createPropertyProgramDefinition(id))
		expect(manager.size).toBe(250)
		expect(manager.has('program-0')).toBe(true)
		expect(manager.has('program-249')).toBe(true)
		expect(manager.has('program-250')).toBe(false)
		expect(manager.program('program-125')?.id).toBe('program-125')
		expect(manager.programs().map((program) => program.id)).toEqual(ids)
		engine.destroy()
	})

	it('returns a fresh independent array at scale so mutating it never touches internal state', () => {
		const engine = createEngine()
		const manager = new ProgramManager(engine)
		const ids = sequence(200).map((index) => `program-${index}`)
		for (const id of ids) manager.add(createPropertyProgramDefinition(id))
		const snapshot = manager.programs()
		invokeRaw<number>(snapshot, Array.prototype.push, [snapshot[0]])
		invokeRaw<unknown>(snapshot, Array.prototype.splice, [0, 10])
		expect(snapshot.length).toBe(191)
		expect(manager.size).toBe(200)
		expect(manager.programs().map((program) => program.id)).toEqual(ids)
		engine.destroy()
	})
})

describe('ProgramManager — adversarial keys', () => {
	it('treats adversarial and unicode ids as ordinary distinct keys', () => {
		const engine = createEngine()
		const manager = new ProgramManager(engine)
		for (const key of TRICKY_KEYS) manager.add(createPropertyProgramDefinition(key))
		expect(manager.size).toBe(TRICKY_KEYS.length)
		for (const key of TRICKY_KEYS) {
			expect(manager.has(key)).toBe(true)
			expect(manager.program(key)?.id).toBe(key)
		}
		expect(manager.programs().map((program) => program.id)).toEqual([...TRICKY_KEYS])
		for (const key of TRICKY_KEYS) expect(manager.remove(key)).toBe(true)
		expect(manager.size).toBe(0)
		engine.destroy()
	})

	it('treats __proto__ as a real key that does not leak to Map/Object prototype names', () => {
		const engine = createEngine()
		const manager = new ProgramManager(engine)
		const program = manager.add(createPropertyProgramDefinition('__proto__'))
		expect(manager.has('__proto__')).toBe(true)
		expect(manager.program('__proto__')).toBe(program)
		expect(manager.has('toString')).toBe(false)
		expect(manager.has('constructor')).toBe(false)
		expect(manager.program('hasOwnProperty')).toBeUndefined()
		expect(manager.size).toBe(1)
		engine.destroy()
	})

	it('throws DUPLICATE with context when a unicode id is re-added', () => {
		const engine = createEngine()
		const manager = new ProgramManager(engine)
		manager.add(createPropertyProgramDefinition('\u{1F600}'))
		const error = captureError(() => manager.add(createPropertyProgramDefinition('\u{1F600}')))
		if (!isRaterError(error)) throw new Error('expected a RaterError')
		expect(error.code).toBe('DUPLICATE')
		expect(error.context).toEqual({ program: '\u{1F600}' })
		engine.destroy()
	})

	it('keeps NFC-labile ids distinct rather than collapsing them into a duplicate', () => {
		const engine = createEngine()
		const manager = new ProgramManager(engine)
		const angstrom = manager.add(createPropertyProgramDefinition('\u212B'))
		const composed = manager.add(createPropertyProgramDefinition('\u00C5'))
		expect(manager.size).toBe(2)
		expect(manager.program('\u212B')).toBe(angstrom)
		expect(manager.program('\u00C5')).toBe(composed)
		engine.destroy()
	})
})
