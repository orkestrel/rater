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
	createPropertyProgramDefinition,
	createRatingDefinition,
	invokeRaw,
	sequence,
	TRICKY_KEYS,
} from '../../../setup.js'

describe('ProgramManager — accessors', () => {
	it('reports size, membership, lookup, insertion order, and a fresh array copy', () => {
		const manager = new ProgramManager(sumAmounts)
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
		expect(second.rate({ value: 1 }).total).toBe(11)
	})
})

describe('ProgramManager — add', () => {
	it('throws DUPLICATE with context for repeated ids', () => {
		const manager = new ProgramManager()
		manager.add(createPropertyProgramDefinition())
		const error = captureError(() => manager.add(createPropertyProgramDefinition()))
		if (!isRaterError(error)) throw new Error('expected a RaterError')
		expect(error.name).toBe('RaterError')
		expect(error.code).toBe('DUPLICATE')
		expect(error.context).toEqual({ program: 'property' })
	})

	it('throws DEFINITION when validation is enabled and shape fails', () => {
		const manager = new ProgramManager()
		const bad: unknown = { ...programDefinition('bad', 'Bad', {}), metadata: () => 1 }
		const error = captureError(() => invokeRaw(manager, manager.add, [bad]))
		if (!isRaterError(error)) throw new Error('expected a RaterError')
		expect(error.code).toBe('DEFINITION')
		expect(error.context).toBeUndefined()
	})

	it('validate false skips shape validation for extra keys', () => {
		const manager = new ProgramManager(undefined, undefined, false)
		const raw = {
			id: 'trusted',
			name: 'Trusted',
			lines: [lineDefinition('line', 'Line', createRatingDefinition())],
			extra: true,
		}
		const program = invokeRaw(manager, manager.add, [raw])
		expect(program.id).toBe('trusted')
	})

	it('validate false still throws MISSING for unknown line references', () => {
		const manager = new ProgramManager(undefined, undefined, false)
		const error = captureError(() =>
			manager.add(
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
})

describe('ProgramManager — remove and destroy', () => {
	it('remove() clears all programs', () => {
		const manager = new ProgramManager()
		manager.add(createPropertyProgramDefinition('first'))
		manager.add(createPropertyProgramDefinition('second'))
		manager.remove()
		expect(manager.size).toBe(0)
		expect(manager.programs()).toEqual([])
	})

	it('remove(id) returns whether a program was removed', () => {
		const manager = new ProgramManager()
		manager.add(createPropertyProgramDefinition('first'))
		expect(manager.remove('first')).toBe(true)
		expect(manager.remove('first')).toBe(false)
	})

	it('remove(ids[]) succeeds only when every id is removed', () => {
		const manager = new ProgramManager()
		manager.add(createPropertyProgramDefinition('first'))
		manager.add(createPropertyProgramDefinition('second'))
		expect(manager.remove(['first', 'second'])).toBe(true)
		manager.add(createPropertyProgramDefinition('third'))
		expect(manager.remove(['third', 'missing'])).toBe(false)
		expect(manager.size).toBe(0)
	})

	it('destroy clears programs and every public method throws MISSING after destroy', () => {
		const manager = new ProgramManager()
		manager.add(createPropertyProgramDefinition())
		manager.destroy()
		manager.destroy()
		const error = captureError(() => manager.size)
		if (!isRaterError(error)) throw new Error('expected a RaterError')
		expect(error.code).toBe('MISSING')
		expect(captureError(() => manager.programs())).toBeInstanceOf(Error)
	})
})

describe('ProgramManager — scale', () => {
	it('holds hundreds of programs with stable size, lookup, and insertion order', () => {
		const manager = new ProgramManager(sumAmounts)
		const ids = sequence(250).map((index) => `program-${index}`)
		for (const id of ids) manager.add(createPropertyProgramDefinition(id))
		expect(manager.size).toBe(250)
		expect(manager.has('program-0')).toBe(true)
		expect(manager.has('program-249')).toBe(true)
		expect(manager.has('program-250')).toBe(false)
		expect(manager.program('program-125')?.id).toBe('program-125')
		expect(manager.program('program-250')).toBeUndefined()
		expect(manager.programs().map((program) => program.id)).toEqual(ids)
	})

	it('returns a fresh independent array at scale so mutating it never touches internal state', () => {
		const manager = new ProgramManager()
		const ids = sequence(200).map((index) => `program-${index}`)
		for (const id of ids) manager.add(createPropertyProgramDefinition(id))
		const snapshot = manager.programs()
		invokeRaw<number>(snapshot, Array.prototype.push, [snapshot[0]])
		invokeRaw<unknown>(snapshot, Array.prototype.splice, [0, 10])
		expect(snapshot.length).toBe(191)
		expect(manager.size).toBe(200)
		expect(manager.programs().map((program) => program.id)).toEqual(ids)
	})
})

describe('ProgramManager — adversarial keys', () => {
	it('treats adversarial and unicode ids as ordinary distinct keys', () => {
		const manager = new ProgramManager()
		for (const key of TRICKY_KEYS) manager.add(createPropertyProgramDefinition(key))
		expect(manager.size).toBe(TRICKY_KEYS.length)
		for (const key of TRICKY_KEYS) {
			expect(manager.has(key)).toBe(true)
			expect(manager.program(key)?.id).toBe(key)
		}
		expect(manager.programs().map((program) => program.id)).toEqual([...TRICKY_KEYS])
		for (const key of TRICKY_KEYS) expect(manager.remove(key)).toBe(true)
		expect(manager.size).toBe(0)
	})

	it('treats __proto__ as a real key that does not leak to Map/Object prototype names', () => {
		const manager = new ProgramManager()
		const program = manager.add(createPropertyProgramDefinition('__proto__'))
		expect(manager.has('__proto__')).toBe(true)
		expect(manager.program('__proto__')).toBe(program)
		expect(manager.has('toString')).toBe(false)
		expect(manager.has('constructor')).toBe(false)
		expect(manager.program('hasOwnProperty')).toBeUndefined()
		expect(manager.size).toBe(1)
	})

	it('throws DUPLICATE with context when an adversarial id is re-added', () => {
		const manager = new ProgramManager()
		manager.add(createPropertyProgramDefinition('__proto__'))
		const error = captureError(() => manager.add(createPropertyProgramDefinition('__proto__')))
		if (!isRaterError(error)) throw new Error('expected a RaterError')
		expect(error.code).toBe('DUPLICATE')
		expect(error.context).toEqual({ program: '__proto__' })
	})

	it('throws DUPLICATE with context when a unicode id is re-added', () => {
		const manager = new ProgramManager()
		manager.add(createPropertyProgramDefinition('\u{1F600}'))
		const error = captureError(() => manager.add(createPropertyProgramDefinition('\u{1F600}')))
		if (!isRaterError(error)) throw new Error('expected a RaterError')
		expect(error.code).toBe('DUPLICATE')
		expect(error.context).toEqual({ program: '\u{1F600}' })
	})

	it('keeps NFC-labile ids distinct rather than collapsing them into a duplicate', () => {
		const manager = new ProgramManager()
		const angstrom = manager.add(createPropertyProgramDefinition('\u212B'))
		const composed = manager.add(createPropertyProgramDefinition('\u00C5'))
		expect(manager.size).toBe(2)
		expect(manager.program('\u212B')).toBe(angstrom)
		expect(manager.program('\u00C5')).toBe(composed)
		expect(manager.programs().map((program) => program.id)).toEqual(['\u212B', '\u00C5'])
	})
})

describe('ProgramManager — remove semantics', () => {
	it('remove([]) succeeds vacuously and removes nothing', () => {
		const manager = new ProgramManager()
		manager.add(createPropertyProgramDefinition('first'))
		expect(manager.remove([])).toBe(true)
		expect(manager.size).toBe(1)
		expect(manager.has('first')).toBe(true)
	})

	it('remove([present, absent]) returns false yet still deletes the present ids', () => {
		const manager = new ProgramManager()
		manager.add(createPropertyProgramDefinition('present'))
		manager.add(createPropertyProgramDefinition('other'))
		expect(manager.remove(['present', 'absent'])).toBe(false)
		expect(manager.has('present')).toBe(false)
		expect(manager.has('other')).toBe(true)
		expect(manager.size).toBe(1)
	})

	it('removes an all-present subset (true) leaving the rest, then the remainder', () => {
		const manager = new ProgramManager()
		manager.add(createPropertyProgramDefinition('a'))
		manager.add(createPropertyProgramDefinition('b'))
		manager.add(createPropertyProgramDefinition('c'))
		expect(manager.remove(['a', 'b'])).toBe(true)
		expect(manager.size).toBe(1)
		expect(manager.has('c')).toBe(true)
		expect(manager.remove(['c'])).toBe(true)
		expect(manager.size).toBe(0)
	})

	it('remove(id) twice returns false the second time', () => {
		const manager = new ProgramManager()
		manager.add(createPropertyProgramDefinition('x'))
		expect(manager.remove('x')).toBe(true)
		expect(manager.remove('x')).toBe(false)
	})
})

describe('ProgramManager — destroy', () => {
	it('makes every public method throw MISSING while destroy stays idempotent', () => {
		const manager = new ProgramManager()
		manager.add(createPropertyProgramDefinition('kept'))
		manager.destroy()
		expect(() => manager.destroy()).not.toThrow()
		const expectMissing = (thunk: () => unknown): void => {
			const error = captureError(thunk)
			if (!isRaterError(error)) throw new Error('expected a RaterError')
			expect(error.code).toBe('MISSING')
		}
		expectMissing(() => manager.size)
		expectMissing(() => manager.has('kept'))
		expectMissing(() => manager.program('kept'))
		expectMissing(() => manager.programs())
		expectMissing(() => manager.add(createPropertyProgramDefinition('new')))
		expectMissing(() => manager.remove('kept'))
		expectMissing(() => manager.remove(['kept']))
		expectMissing(() => manager.remove())
	})
})
