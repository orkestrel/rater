import { createLogicalDefinition } from '@orkestrel/reason'
import { createHostileValues } from '@orkestrel/test'
import {
	buildLineDefinition,
	buildRatingDefinition,
	createRater,
	isEvidence,
	isLineDefinition,
	isLineResult,
	isRatingDefinition,
	isRatingResult,
	isStage,
	isStep,
	isWorksheet,
	isWorksheetFactor,
	isWorksheetGroup,
} from '@src/core'
import { describe, expect, it } from 'vitest'
import { createLine, createQuoteRate } from '../../setup.js'

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

	it('is exact-literal strict — near-miss casing and whitespace are rejected', () => {
		for (const input of ['Factor', 'GROUP', ' group ']) {
			expect(() => isStage(input)).not.toThrow()
			expect(isStage(input)).toBe(false)
		}
	})
})

describe('validators — isLineDefinition', () => {
	const rate = createLine('line', 10).rate

	it('accepts a minimal and a fully-populated line definition', () => {
		expect(isLineDefinition(buildLineDefinition('line', 'Line', rate))).toBe(true)
		expect(
			isLineDefinition(
				buildLineDefinition('line', 'Line', rate, { description: 'd', metadata: { a: 1 } }),
			),
		).toBe(true)
	})

	it('accepts a null-prototype record satisfying the exact shape', () => {
		const nullProto: Record<string, unknown> = Object.create(null)
		Object.assign(nullProto, buildLineDefinition('line', 'Line', rate))
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
			isLineDefinition({ id: 'line', name: 'Line', rate: createLogicalDefinition('l', 'L', []) }),
		).toBe(false)
		expect(isLineDefinition({ id: 'line', name: 'Line', rate, description: 5 })).toBe(false)
	})

	it('rejects an extra key on an otherwise valid record', () => {
		expect(isLineDefinition({ id: 'line', name: 'Line', rate, bogus: true })).toBe(false)
	})

	it('rejects a rate that is object-shaped but not a valid quantitative definition', () => {
		const badRate = { reasoning: 'quantitative', id: 'x', name: 'x', groups: 'nope' }
		expect(isLineDefinition({ id: 'x', name: 'X', rate: badRate })).toBe(false)
	})

	it('rejects cyclic metadata without throwing', () => {
		const cyclic: Record<string, unknown> = {}
		cyclic.self = cyclic
		const candidate = { ...buildLineDefinition('line', 'Line', rate), metadata: cyclic }
		expect(() => isLineDefinition(candidate)).not.toThrow()
		expect(isLineDefinition(candidate)).toBe(false)
	})

	it('walks deeply nested metadata without throwing, rejecting a non-finite leaf', () => {
		let deep: unknown = Number.NaN
		for (let index = 0; index < 500; index += 1) deep = [deep]
		const candidate = { ...buildLineDefinition('line', 'Line', rate), metadata: deep }
		expect(() => isLineDefinition(candidate)).not.toThrow()
		expect(isLineDefinition(candidate)).toBe(false)
	})

	it('walks deeply nested metadata without throwing, accepting a valid leaf', () => {
		let deep: unknown = 1
		for (let index = 0; index < 500; index += 1) deep = [deep]
		const candidate = { ...buildLineDefinition('line', 'Line', rate), metadata: deep }
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
	const line = buildLineDefinition('line', 'Line', createLine('line', 10).rate)

	it('accepts a minimal and a fully-populated rating definition', () => {
		expect(isRatingDefinition(buildRatingDefinition('r', 'R', [line]))).toBe(true)
		expect(
			isRatingDefinition(
				buildRatingDefinition('r', 'R', [line], { description: 'd', metadata: { a: 1 } }),
			),
		).toBe(true)
	})

	it('accepts an empty lines array', () => {
		expect(isRatingDefinition(buildRatingDefinition('r', 'R', []))).toBe(true)
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

	it('accepts duplicate line ids', () => {
		const duplicate = buildLineDefinition('line', 'Line 2', createLine('line', 20).rate)
		expect(isRatingDefinition(buildRatingDefinition('r', 'R', [line, duplicate]))).toBe(true)
	})

	it('rejects adversarial inputs without throwing', () => {
		for (const input of ADVERSARIAL_INPUTS) {
			expect(() => isRatingDefinition(input)).not.toThrow()
			expect(isRatingDefinition(input)).toBe(false)
		}
	})
})

describe('validators — isEvidence', () => {
	it('admits unknown members and prototypes while checking every typed member', () => {
		const candidate = Object.assign(Object.create(null), {
			field: ['account', 'age'],
			label: '',
			comparison: 'between',
			expected: 18,
			actual: { nested: true },
			met: false,
			extra: 'retained',
		})
		expect(isEvidence(candidate)).toBe(true)
	})

	it('accepts a real class instance with prototype accessors', () => {
		const candidate = new (class {
			get field(): readonly string[] {
				return ['account', 'age']
			}

			get label(): string {
				return 'Age'
			}

			get comparison(): string {
				return 'between'
			}

			get expected(): unknown {
				return 18
			}

			get actual(): unknown {
				return 25
			}

			get met(): boolean {
				return true
			}
		})()
		expect(isEvidence(candidate)).toBe(true)
	})

	it('does not read unknown-typed expected or actual members, and admits their absence', () => {
		expect(isEvidence({})).toBe(true)
		expect(isEvidence({ expected: undefined, actual: undefined })).toBe(true)
		expect(
			isEvidence({
				get expected(): never {
					throw new Error('expected must stay unread')
				},
				get actual(): never {
					throw new Error('actual must stay unread')
				},
			}),
		).toBe(true)
	})

	it('accepts undefined optional members and rejects each wrong typed member', () => {
		expect(
			isEvidence({ field: undefined, label: undefined, comparison: undefined, met: undefined }),
		).toBe(true)
		expect(isEvidence({ field: [1] })).toBe(false)
		expect(isEvidence({ label: 1 })).toBe(false)
		expect(isEvidence({ comparison: 'near' })).toBe(false)
		expect(isEvidence({ met: 'yes' })).toBe(false)
	})

	it('returns the explicit result for every hostile value without throwing', () => {
		for (const [index, input] of createHostileValues().entries()) {
			let accepted: boolean | undefined
			expect(() => {
				accepted = isEvidence(input)
			}, `hostile value ${index}`).not.toThrow()
			expect(accepted, `hostile value ${index}`).toBe(
				[true, false, false, true, true, true, false, false, false, true, true][index],
			)
		}
	})
})

describe('validators — isWorksheetFactor', () => {
	const factor = { id: 'base', applied: true, evidence: [] }

	it('admits unknown members and prototypes and keeps values as plain numbers', () => {
		const candidate = Object.assign(Object.create(null), factor, {
			value: Number.NaN,
			extra: true,
		})
		expect(isWorksheetFactor(candidate)).toBe(true)
	})

	it('accepts a real class instance with prototype accessors', () => {
		const candidate = new (class {
			get id(): string {
				return 'base'
			}

			get name(): string {
				return 'Base'
			}

			get description(): string {
				return 'Base amount'
			}

			get applied(): boolean {
				return true
			}

			get value(): number {
				return 100
			}

			get evidence(): readonly unknown[] {
				return []
			}
		})()
		expect(isWorksheetFactor(candidate)).toBe(true)
	})

	it('accepts absent and undefined optional members', () => {
		expect(isWorksheetFactor(factor)).toBe(true)
		expect(
			isWorksheetFactor({
				...factor,
				name: undefined,
				description: undefined,
				value: undefined,
			}),
		).toBe(true)
	})

	it('rejects every wrong typed member', () => {
		expect(isWorksheetFactor({ ...factor, id: 1 })).toBe(false)
		expect(isWorksheetFactor({ ...factor, name: 1 })).toBe(false)
		expect(isWorksheetFactor({ ...factor, description: 1 })).toBe(false)
		expect(isWorksheetFactor({ ...factor, applied: 'yes' })).toBe(false)
		expect(isWorksheetFactor({ ...factor, value: '1' })).toBe(false)
		expect(isWorksheetFactor({ ...factor, evidence: [{}, { met: 'yes' }] })).toBe(false)
	})

	it('refuses every hostile value without throwing', () => {
		for (const [index, input] of createHostileValues().entries()) {
			let accepted: boolean | undefined
			expect(() => {
				accepted = isWorksheetFactor(input)
			}, `hostile value ${index}`).not.toThrow()
			expect(accepted, `hostile value ${index}`).toBe(false)
		}
	})
})

describe('validators — isWorksheetGroup', () => {
	const group = { id: 'charges', applied: true, value: 100, factors: [] }

	it('admits unknown members and prototypes and keeps values as plain numbers', () => {
		const candidate = Object.assign(Object.create(null), group, {
			value: Number.POSITIVE_INFINITY,
			extra: true,
		})
		expect(isWorksheetGroup(candidate)).toBe(true)
	})

	it('accepts a real class instance with prototype accessors', () => {
		const candidate = new (class {
			get id(): string {
				return 'charges'
			}

			get name(): string {
				return 'Charges'
			}

			get description(): string {
				return 'Rated charges'
			}

			get applied(): boolean {
				return true
			}

			get value(): number {
				return 100
			}

			get factors(): readonly unknown[] {
				return []
			}
		})()
		expect(isWorksheetGroup(candidate)).toBe(true)
	})

	it('accepts absent and undefined optional members', () => {
		expect(isWorksheetGroup(group)).toBe(true)
		expect(isWorksheetGroup({ ...group, name: undefined, description: undefined })).toBe(true)
	})

	it('rejects every wrong typed member', () => {
		expect(isWorksheetGroup({ ...group, id: 1 })).toBe(false)
		expect(isWorksheetGroup({ ...group, name: 1 })).toBe(false)
		expect(isWorksheetGroup({ ...group, description: 1 })).toBe(false)
		expect(isWorksheetGroup({ ...group, applied: 'yes' })).toBe(false)
		expect(isWorksheetGroup({ ...group, value: '100' })).toBe(false)
		expect(isWorksheetGroup({ ...group, factors: [{}] })).toBe(false)
	})

	it('refuses every hostile value without throwing', () => {
		for (const [index, input] of createHostileValues().entries()) {
			let accepted: boolean | undefined
			expect(() => {
				accepted = isWorksheetGroup(input)
			}, `hostile value ${index}`).not.toThrow()
			expect(accepted, `hostile value ${index}`).toBe(false)
		}
	})
})

describe('validators — isStep', () => {
	const step = { stage: 'total', value: 100 }

	it('admits unknown members and prototypes and keeps values as plain numbers', () => {
		const candidate = Object.assign(Object.create(null), step, {
			value: Number.NEGATIVE_INFINITY,
			extra: true,
		})
		expect(isStep(candidate)).toBe(true)
	})

	it('accepts a real class instance with prototype accessors', () => {
		const candidate = new (class {
			get stage(): string {
				return 'total'
			}

			get id(): string {
				return 'quote'
			}

			get name(): string {
				return 'Quote'
			}

			get value(): number {
				return 100
			}

			get expression(): string {
				return 'sum = 100'
			}
		})()
		expect(isStep(candidate)).toBe(true)
	})

	it('accepts absent and undefined optional members', () => {
		expect(isStep(step)).toBe(true)
		expect(isStep({ ...step, id: undefined, name: undefined, expression: undefined })).toBe(true)
	})

	it('rejects every wrong typed member', () => {
		expect(isStep({ ...step, stage: 'subtotal' })).toBe(false)
		expect(isStep({ ...step, id: 1 })).toBe(false)
		expect(isStep({ ...step, name: 1 })).toBe(false)
		expect(isStep({ ...step, value: '100' })).toBe(false)
		expect(isStep({ ...step, expression: 1 })).toBe(false)
	})

	it('refuses every hostile value without throwing', () => {
		for (const [index, input] of createHostileValues().entries()) {
			let accepted: boolean | undefined
			expect(() => {
				accepted = isStep(input)
			}, `hostile value ${index}`).not.toThrow()
			expect(accepted, `hostile value ${index}`).toBe(false)
		}
	})
})

describe('validators — isWorksheet', () => {
	const worksheet = {
		id: 'quote',
		name: 'Quote',
		aggregation: 'sum',
		value: 110,
		groups: [],
		steps: [],
		trace: [],
		errors: [],
		success: true,
	}

	it('admits unknown members and prototypes and keeps values as plain numbers', () => {
		const candidate = Object.assign(Object.create(null), worksheet, {
			value: Number.NaN,
			precision: Number.POSITIVE_INFINITY,
			extra: true,
		})
		expect(isWorksheet(candidate)).toBe(true)
	})

	it('accepts a real class instance with prototype accessors', () => {
		const candidate = new (class {
			get id(): string {
				return 'quote'
			}

			get name(): string {
				return 'Quote'
			}

			get aggregation(): string {
				return 'sum'
			}

			get precision(): number {
				return 2
			}

			get value(): number {
				return 110
			}

			get groups(): readonly unknown[] {
				return []
			}

			get steps(): readonly unknown[] {
				return []
			}

			get trace(): readonly string[] {
				return []
			}

			get errors(): readonly string[] {
				return []
			}

			get success(): boolean {
				return true
			}
		})()
		expect(isWorksheet(candidate)).toBe(true)
	})

	it('accepts absent and undefined precision', () => {
		expect(isWorksheet(worksheet)).toBe(true)
		expect(isWorksheet({ ...worksheet, precision: undefined })).toBe(true)
	})

	it('rejects every wrong typed member', () => {
		expect(isWorksheet({ ...worksheet, id: 1 })).toBe(false)
		expect(isWorksheet({ ...worksheet, name: 1 })).toBe(false)
		expect(isWorksheet({ ...worksheet, aggregation: 'median' })).toBe(false)
		expect(isWorksheet({ ...worksheet, precision: '2' })).toBe(false)
		expect(isWorksheet({ ...worksheet, value: '110' })).toBe(false)
		expect(isWorksheet({ ...worksheet, groups: [{}] })).toBe(false)
		expect(isWorksheet({ ...worksheet, steps: [{}] })).toBe(false)
		expect(isWorksheet({ ...worksheet, trace: [1] })).toBe(false)
		expect(isWorksheet({ ...worksheet, errors: [1] })).toBe(false)
		expect(isWorksheet({ ...worksheet, success: 'yes' })).toBe(false)
	})

	it('refuses every hostile value without throwing', () => {
		for (const [index, input] of createHostileValues().entries()) {
			let accepted: boolean | undefined
			expect(() => {
				accepted = isWorksheet(input)
			}, `hostile value ${index}`).not.toThrow()
			expect(accepted, `hostile value ${index}`).toBe(false)
		}
	})
})

describe('validators — isLineResult', () => {
	const worksheet = {
		id: 'quote',
		name: 'Quote',
		aggregation: 'sum',
		value: 110,
		groups: [],
		steps: [],
		trace: [],
		errors: [],
		success: true,
	}
	const line = { id: 'quote', name: 'Quote', worksheet }

	it('admits unknown members and prototypes and keeps amount as a plain number', () => {
		const candidate = Object.assign(Object.create(null), line, {
			amount: Number.NaN,
			extra: true,
		})
		expect(isLineResult(candidate)).toBe(true)
	})

	it('accepts a real class instance with prototype accessors', () => {
		const candidate = new (class {
			get id(): string {
				return 'quote'
			}

			get name(): string {
				return 'Quote'
			}

			get amount(): number {
				return 110
			}

			get worksheet(): unknown {
				return worksheet
			}
		})()
		expect(isLineResult(candidate)).toBe(true)
	})

	it('accepts absent and undefined amount', () => {
		expect(isLineResult(line)).toBe(true)
		expect(isLineResult({ ...line, amount: undefined })).toBe(true)
	})

	it('rejects every wrong typed member', () => {
		expect(isLineResult({ ...line, id: 1 })).toBe(false)
		expect(isLineResult({ ...line, name: 1 })).toBe(false)
		expect(isLineResult({ ...line, amount: '110' })).toBe(false)
		expect(isLineResult({ ...line, worksheet: {} })).toBe(false)
	})

	it('refuses every hostile value without throwing', () => {
		for (const [index, input] of createHostileValues().entries()) {
			let accepted: boolean | undefined
			expect(() => {
				accepted = isLineResult(input)
			}, `hostile value ${index}`).not.toThrow()
			expect(accepted, `hostile value ${index}`).toBe(false)
		}
	})
})

describe('validators — isRatingResult closure', () => {
	const result = { lines: [], success: true }

	it('admits unknown members, a real class instance, and prototype accessors', () => {
		const candidate = new (class {
			get lines(): readonly unknown[] {
				return [
					new (class {
						get id(): string {
							return 'quote'
						}

						get name(): string {
							return 'Quote'
						}

						get amount(): number {
							return 110
						}

						get worksheet(): unknown {
							return {
								id: 'quote',
								name: 'Quote',
								aggregation: 'sum',
								value: 110,
								groups: [],
								steps: [],
								trace: [],
								errors: [],
								success: true,
							}
						}
					})(),
				]
			}

			get total(): number {
				return Number.POSITIVE_INFINITY
			}

			get success(): boolean {
				return true
			}

			get extra(): string {
				return 'retained'
			}
		})()
		expect(isRatingResult(candidate)).toBe(true)
	})

	it('accepts absent and undefined total', () => {
		expect(isRatingResult(result)).toBe(true)
		expect(isRatingResult({ ...result, total: undefined })).toBe(true)
	})

	it('rejects every wrong typed member', () => {
		expect(isRatingResult({ ...result, lines: [{}] })).toBe(false)
		expect(isRatingResult({ ...result, total: '110' })).toBe(false)
		expect(isRatingResult({ ...result, success: 'yes' })).toBe(false)
	})

	it('refuses every hostile value without throwing', () => {
		for (const [index, input] of createHostileValues().entries()) {
			let accepted: boolean | undefined
			expect(() => {
				accepted = isRatingResult(input)
			}, `hostile value ${index}`).not.toThrow()
			expect(accepted, `hostile value ${index}`).toBe(false)
		}
	})

	it('requires LineResult members and boolean success, rejecting a RatingDefinition control', () => {
		const definition = buildRatingDefinition('rating', 'Rating', [createLine('line', 10)])
		expect(isRatingResult(definition)).toBe(false)
	})

	it('accepts the real engine result and narrows a populated worksheet path', () => {
		const rater = createRater()
		try {
			const rated: unknown = rater.rate(
				[buildLineDefinition('quote', 'Quote', createQuoteRate())],
				{
					seats: 10,
				},
			)
			expect(isRatingResult(rated)).toBe(true)
			if (!isRatingResult(rated)) throw new Error('real result did not narrow')
			expect(rated.lines[0]?.worksheet.groups.length).toBeGreaterThan(0)
		} finally {
			rater.destroy()
		}
	})
})
