// The consumer-side guides-parity drop-in: runs `@orkestrel/guide`'s checks against
// this repo's own `guides/README.md` manifest. The constants that follow are this
// package's own, and are the only part a sibling package changes.

import { describe, expect, it } from 'vitest'
import {
	computeSymbolKey,
	createGuide,
	createSource,
	createSourceManager,
	extractFenceImports,
	findMissing,
	findMissingSymbols,
	findUnexampled,
	findUnlisted,
	isExternalLink,
	parseManifest,
	resolveLink,
} from '@orkestrel/guide'
import { readFileSync } from 'node:fs'
import { captureError, requireValue } from '@orkestrel/test'
import { readInventory } from '@orkestrel/test/server'
import {
	buildEvidence,
	buildLineDefinition,
	buildRatingDefinition,
	buildWorksheetGroup,
	buildWorksheetSteps,
	createRater,
	isLineDefinition,
	isRaterError,
	isRatingDefinition,
	isStage,
	RaterError,
	sumAmounts,
} from '@src/core'
import {
	createCheck,
	createFactorGroup,
	createFieldFactor,
	createQuantitativeDefinition,
	createQuantitativeReasoner,
	createReason,
	createStaticFactor,
} from '@orkestrel/reason'

/** Every fence language this package's guides are allowed to use. */
const FENCE_LANGUAGES = Object.freeze(['ts'])
/** The fence language whose blocks count as worked examples. */
const EXAMPLE_LANGUAGE = 'ts'
/** Each import specifier this package's own guides may resolve against. */
const MODULES = Object.freeze({ '@orkestrel/rater': 'src/core', '@src/core': 'src/core' })
/**
 * Declarations deliberately kept out of the barrel, as `computeSymbolKey` strings.
 *
 * A class that one-class-per-file evicted from its single consumer cannot become a
 * local, so it stays exported without being public. Naming it here is what makes that
 * intentional rather than forgotten — and the `names no symbol internal that the barrel
 * already exports` assertion fails when a name here stops being stranded, so the list
 * cannot rot.
 */
const INTERNAL: readonly string[] = Object.freeze([])

/** Root-level files this package's guides link to. `readInventory` walks directories only. */
const ROOT_FILES = Object.freeze(['AGENTS.md'])

const root = new URL('../', import.meta.url)
const files: Record<string, string> = {
	...readInventory(root, ['src', 'guides', 'tests'], { extensions: ['.ts', '.md'] }),
}
for (const name of ROOT_FILES) files[name] = readFileSync(new URL(name, root), 'utf8')
const manifest = parseManifest(
	requireValue(files['guides/README.md'], 'Missing file: guides/README.md'),
	'guides',
)
const sources = createSourceManager({ files, modules: MODULES })

it('manifest lists at least one guide', () => {
	expect(manifest.length).toBeGreaterThan(0)
})

for (const entry of manifest) {
	const guide = createGuide(requireValue(files[entry.spec], `Missing file: ${entry.spec}`))
	const source = createSource({ files, module: entry.source })

	describe(`${entry.concept}`, () => {
		it('uses only listed fence languages', () => {
			expect(findUnlisted(guide.fences(), FENCE_LANGUAGES)).toEqual([])
		})

		it('extracts a non-empty documented surface', () => {
			expect(guide.surface().length).toBeGreaterThan(0)
		})
		it('re-exports every direct declaration that is not named internal', () => {
			const stranded = findMissingSymbols(source.exports(), source.surface())
			expect(stranded.filter((key) => !INTERNAL.includes(key))).toEqual([])
		})
		it('names no symbol internal that the barrel already exports', () => {
			const stranded = findMissingSymbols(source.exports(), source.surface())
			expect(INTERNAL.filter((key) => !stranded.includes(key))).toEqual([])
		})
		it('re-exports only direct declarations', () => {
			expect(findMissingSymbols(source.surface(), source.exports())).toEqual([])
		})
		it('documents every barrel export', () => {
			expect(findMissingSymbols(source.surface(), guide.surface())).toEqual([])
		})
		it('documents only barrel exports', () => {
			expect(findMissingSymbols(guide.surface(), source.surface())).toEqual([])
		})

		it('exposes no hidden module-scope declarations', () => {
			expect(source.hidden().map(computeSymbolKey)).toEqual([])
		})

		for (const group of guide.methods()) {
			const members = source.methods(group.interface)
			const entity = group.interface.replace(/Interface$/, '')
			describe(`${group.interface}`, () => {
				it('documents at least one method', () => {
					expect(group.methods.length).toBeGreaterThan(0)
				})
				it('documents every interface method', () => {
					expect(findMissing(members, group.methods)).toEqual([])
				})
				it('documents no phantom method', () => {
					expect(findMissing(group.methods, members)).toEqual([])
				})
				it(`${entity} exposes no undocumented method`, () => {
					const extra =
						entity === group.interface ? [] : findMissing(source.methods(entity), group.methods)
					expect(extra).toEqual([])
				})
			})
		}

		it('documents an example for every Surface function', () => {
			const fences = guide
				.fences()
				.filter((fence) => fence.language === EXAMPLE_LANGUAGE)
				.map((fence) => fence.code)
			const names = guide
				.surface()
				.filter((symbol) => symbol.kind === 'function')
				.map((symbol) => symbol.name)
			expect(findUnexampled(names, fences, source.examples())).toEqual([])
		})

		for (const group of guide.methods()) {
			const entity = group.interface.replace(/Interface$/, '')
			describe(`${group.interface} examples`, () => {
				it('documents an example for every method', () => {
					const fences = guide
						.fences()
						.filter((fence) => fence.language === EXAMPLE_LANGUAGE)
						.map((fence) => fence.code)
					const examples =
						entity === group.interface
							? source.examples(group.interface)
							: source.examples(group.interface).concat(source.examples(entity))
					expect(findUnexampled(group.methods, fences, examples)).toEqual([])
				})
			})
		}

		it('imports only real exports in every ```ts fence', () => {
			const fences = guide.fences().filter((fence) => fence.language === EXAMPLE_LANGUAGE)
			for (const fence of fences) {
				for (const { specifier, names } of extractFenceImports(fence.code)) {
					const imported = sources.source(specifier)
					if (imported === undefined) continue
					const surface = imported.surface().map((symbol) => symbol.name)
					expect(findMissing(names, surface)).toEqual([])
				}
			}
		})

		it('resolves every relative link', () => {
			const broken = guide
				.links()
				.filter((href) => !isExternalLink(href))
				.map((href) => resolveLink(entry.spec, href))
				.filter((path) => !source.exists(path))
			expect(broken).toEqual([])
		})
		it('links only to test files that exist', () => {
			const missing = guide
				.tests()
				.map((href) => resolveLink(entry.spec, href))
				.filter((path) => !source.exists(path))
			expect(missing).toEqual([])
		})
	})
}

// Executes each value-claiming fence of `guides/rater.md` and asserts the value its
// comment claims. Parity proves a name resolves; only a run proves the comment true.
describe('flagship fences', () => {
	it('rates the Surface fence line to an amount and a total of 100', () => {
		const rater = createRater()
		const base = buildLineDefinition(
			'base',
			'Base Amount',
			createQuantitativeDefinition('base', 'Base', [
				createFactorGroup('amount', 'sum', [createStaticFactor('flat', 100)]),
			]),
		)
		const result = rater.rate([base], { id: 'subject-1' })
		expect(result.lines[0]?.amount).toBe(100)
		expect(result.total).toBe(100)
		rater.destroy()
	})

	it('narrows the Errors fence throw to a RaterError coded DESTROYED', () => {
		const error = captureError(() => {
			throw new RaterError('DESTROYED', 'Rater has been destroyed')
		})
		expect(isRaterError(error)).toBe(true)
		if (!isRaterError(error)) throw new Error('expected a RaterError')
		expect(error.code).toBe('DESTROYED')
	})

	it('answers every Validators fence guard call with true', () => {
		expect(isStage('group')).toBe(true)
		expect(
			isLineDefinition({
				id: 'base',
				name: 'Base Amount',
				rate: createQuantitativeDefinition('base', 'Base', []),
			}),
		).toBe(true)
		expect(isRatingDefinition({ id: 'r1', name: 'Rating', lines: [] })).toBe(true)
	})

	it('merges the definition fence overrides over the defaults', () => {
		const base = buildLineDefinition(
			'base',
			'Base Amount',
			createQuantitativeDefinition('base', 'Base', []),
		)
		expect(buildRatingDefinition('r1', 'Rating', [base])).toEqual({
			id: 'r1',
			name: 'Rating',
			lines: [base],
		})
		expect(buildRatingDefinition('r1', 'Rating', [base], { description: 'A rating' })).toEqual({
			id: 'r1',
			name: 'Rating',
			lines: [base],
			description: 'A rating',
		})
	})

	it('renders the evidence fence check into the row and label its comments claim', () => {
		const evaluated = createCheck('age', 'above', 18)
		expect(buildEvidence(evaluated, 25, true)).toEqual({
			field: 'age',
			comparison: 'above',
			expected: 18,
			actual: 25,
			met: true,
		})
		expect(buildEvidence(evaluated, 25, true, { age: 'Age' })).toEqual({
			field: 'age',
			label: 'Age',
			comparison: 'above',
			expected: 18,
			actual: 25,
			met: true,
		})
	})

	it('orders the worksheet fence steps as factors, groups, then the total', () => {
		const definition = createQuantitativeDefinition('risk', 'Risk', [
			createFactorGroup('drivers', 'sum', [createFieldFactor('age', 'age')]),
		])
		const engine = createReason({ reasoners: [createQuantitativeReasoner()] })
		const result = engine.reason({ age: 25 }, definition)
		if (result.reasoning !== 'quantitative') throw new Error('expected a quantitative result')
		const steps = buildWorksheetSteps(
			definition,
			result,
			definition.groups.map((entry) => buildWorksheetGroup(entry, result.groups)),
		)
		expect(steps.map((step) => step.stage)).toEqual(['factor', 'group', 'total'])
		engine.destroy()
	})

	it('sums the worksheet fence empty line list to undefined', () => {
		expect(sumAmounts([])).toBeUndefined()
	})

	it('returns equal results from both Methods fence rate overloads', () => {
		const rater = createRater()
		const base = buildLineDefinition(
			'base',
			'Base Amount',
			createQuantitativeDefinition('base', 'Base', []),
		)
		const fromArray = rater.rate([base], { id: 'subject-1' })
		const fromDefinition = rater.rate(
			{ id: 'r1', name: 'Rating', lines: [base] },
			{ id: 'subject-1' },
		)
		expect(fromArray).toEqual(fromDefinition)
		rater.destroy()
	})
})
