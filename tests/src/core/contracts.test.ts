import {
	isRecord,
	numberShape,
	objectShape,
	optionalShape,
	seededRandom,
	stringShape,
} from '@orkestrel/contract'
import {
	buildRatingDefinition,
	createRater,
	isRatingResult,
	projectRatingResult,
	ratingResultContract,
} from '@src/core'
import { describe, expect, it } from 'vitest'
import {
	buildRaterContractCases,
	createCheckFailureLine,
	createLine,
	createLookupFailureLine,
} from '../../setup.js'

describe('standing guard contract table', () => {
	const table = buildRaterContractCases()

	it.each(table.definitions)('$name: canonical positive and negative control', (row) => {
		expect(row.direction).toBe('is implies guard')
		expect(row.project).toBeUndefined()
		expect(row.wire.is(row.positive)).toBe(true)
		expect(row.guard(row.positive)).toBe(true)
		expect(row.wire.is(row.negative)).toBe(false)
		expect(row.guard(row.negative)).toBe(false)
	})

	it.each(table.definitions)('$name: generated admissions imply guard without discards', (row) => {
		const admissions = Array.from({ length: 100 }, (_, seed) => {
			const value = row.wire.generate(seededRandom(seed))
			return { seed, admitted: row.wire.is(value), guarded: row.guard(value) }
		})
		expect(admissions.filter((entry) => !entry.admitted)).toEqual([])
		expect(admissions.filter((entry) => !entry.guarded)).toEqual([])
	})

	it.each(table.results)('$name: projection and open foreign guard', (row) => {
		expect(row.direction).toBe('producer implies wire after projection')
		expect(row.guard(row.positive)).toBe(true)
		expect(row.wire.is(row.project(row.positive))).toBe(true)
		expect(row.guard({ ...row.positive, foreign: true })).toBe(true)
		expect(row.guard(row.negative)).toBe(false)
		expect(row.wire.is(row.negative)).toBe(false)
	})

	it('every rating outcome crosses its published projection', () => {
		const rater = createRater()
		try {
			for (const lines of [
				[],
				[createLine('ok', 5)],
				[createLookupFailureLine('lookup')],
				[createCheckFailureLine('check')],
			]) {
				const result = rater.rate(lines, {})
				expect(isRatingResult(result)).toBe(true)
				expect(ratingResultContract.is(projectRatingResult(result))).toBe(true)
			}
			const definition = buildRatingDefinition('door', 'Door', [createLine('ok', 5)], {
				shape: objectShape({
					x: numberShape(),
					note: optionalShape(stringShape(), { default: 'none' }),
				}),
			})
			for (const x of [1, '1', 'invalid']) {
				const result = rater.rate(definition, { x })
				expect(result.success).toBe(x !== 'invalid')
				expect(ratingResultContract.is(projectRatingResult(result))).toBe(true)
			}
		} finally {
			rater.destroy()
		}
	})

	it('fault schemas admit contract faults and reject malformed faults', () => {
		const row = table.results.find((entry) => entry.name === 'worksheet')
		if (row === undefined) throw new Error('Worksheet row missing')
		const projected = row.project(row.positive)
		if (!isRecord(projected)) throw new Error('Worksheet projection missing')
		expect(
			row.wire.is({
				...projected,
				faults: [{ reason: 'missing', path: ['x'], expected: 'number' }],
			}),
		).toBe(true)
		expect(row.wire.is({ ...projected, faults: [{ reason: 'invalid', path: [] }] })).toBe(false)
	})
})
