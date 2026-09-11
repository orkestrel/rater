// The consumer-side guides-parity drop-in: runs `@orkestrel/guide`'s checks against
// this repo's own `guides/README.md` manifest. The constants that follow are this
// package's own, as is the executed section that closes the file.

import { GuideCommand } from '@orkestrel/guide/server'
import { readInventory } from '@orkestrel/test/server'
import { createVitest } from 'vitest/node'

/** Every fence language this package's guides are allowed to use. */
const FENCE_LANGUAGES = Object.freeze(['ts'])
/** The fence language whose blocks count as worked examples. */
const EXAMPLE_LANGUAGE = 'ts'
/** The package identity that binds its manifest, module map, and README pitch. */
const PACKAGE_NAME = '@orkestrel/rater'
/** The one guide this package sources, whose tagline the README pitch equals. */
const GUIDE_SPEC = 'guides/rater.md'
/** Each import specifier this package's own guides may resolve against. */
const MODULES = Object.freeze({ [PACKAGE_NAME]: 'src/core', '@src/core': 'src/core' })
/**
 * Declarations deliberately kept out of the barrel, as `computeSymbolKey` strings.
 *
 * A class that one-class-per-file evicted from its single consumer cannot become a
 * local, so it stays exported without being public. Naming it here is what makes that
 * intentional rather than forgotten — and the assertion that follows it fails when a name
 * here stops being stranded, so the list cannot rot.
 */
const INTERNAL: readonly string[] = Object.freeze([])

await new GuideCommand({
	root: new URL('../', import.meta.url),
	patterns: ['src/**/*.ts', 'tests/**/*.ts', 'guides/*.md', '*.md', 'package.json'],
	modules: MODULES,
	languages: FENCE_LANGUAGES,
	language: EXAMPLE_LANGUAGE,
	reader: readInventory,
	runner: createVitest,
}).execute(async ({ files, report, rows }) => {
	const { isRecord, parseJSON } = await import('@orkestrel/contract')
	const {
		computeSymbolKey,
		createSourceManager,
		extractFenceImports,
		findMissing,
		findMissingSymbols,
		findUnexampled,
		isExternalLink,
		resolveLink,
	} = await import('@orkestrel/guide')
	const { captureError, requireValue } = await import('@orkestrel/test')
	const {
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
	} = await import('@src/core')
	const {
		createCheck,
		createFactorGroup,
		createFieldFactor,
		createQuantitativeDefinition,
		createQuantitativeReasoner,
		createReason,
		createStaticFactor,
	} = await import('@orkestrel/reason')
	const { describe, expect, it } = await import('vitest')
	const sources = createSourceManager({ files, modules: MODULES })
	const own = requireValue(
		rows.find((row) => row.entry.spec === GUIDE_SPEC),
		`Missing manifest row: ${GUIDE_SPEC}`,
	)
	const manifest = parseJSON(requireValue(files['package.json'], 'Missing inventory: package.json'))
	if (!isRecord(manifest)) throw new Error('Invalid package manifest: package.json')

	it('manifest lists at least one guide', () => {
		expect(report.input).toEqual([])
		expect(rows.length).toBeGreaterThan(0)
		expect(own.entry.spec).toBe(GUIDE_SPEC)
	})

	// The example half of the equality case is silent over an empty population: with no
	// title on both sides `findDrift` compares no pair and the case passes on the summaries
	// alone. This pins the population this repository's own guide contributes, so removing
	// every `@example` title reddens the suite instead of quietly retiring half the gate.
	// The failure names both title sets, because a pin reporting only its own emptiness
	// leaves the reader to work out which side dropped the title.
	it('pairs at least one example title across the guide and the source', () => {
		expect(report.examples.titles.filter((finding) => finding.spec === GUIDE_SPEC)).toEqual([])
	})

	// The README's pitch and the guide's tagline are one text, each read as the blockquote
	// under its file's H1. The native report owns their comparison. The manifest assertion
	// binds that report to this package rather than allowing an unrelated package identity.
	it('opens the README with the guide tagline', () => {
		expect(manifest.name).toBe(PACKAGE_NAME)
		expect(report.pitch).toEqual([])
	})

	for (const { entry, guide, source } of rows) {
		describe(`${entry.concept}`, () => {
			it('uses only listed fence languages', () => {
				expect(report.fences.filter((finding) => finding.spec === entry.spec)).toEqual([])
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
				const members = source.methods(group.interface).map((method) => method.name)
				const documented = group.methods.map((method) => method.name)
				const entity = group.interface.replace(/Interface$/, '')
				describe(`${group.interface}`, () => {
					it('documents at least one method', () => {
						expect(group.methods.length).toBeGreaterThan(0)
					})
					it('documents every interface method', () => {
						expect(findMissing(members, documented)).toEqual([])
					})
					it('documents no phantom method', () => {
						expect(findMissing(documented, members)).toEqual([])
					})
					it(`${entity} exposes no undocumented method`, () => {
						const extra =
							entity === group.interface
								? []
								: findMissing(
										source.methods(entity).map((method) => method.name),
										documented,
									)
						expect(extra).toEqual([])
					})
				})
			}

			// The equality gate: a `Summary` cell against its export's description paragraph, a
			// titled fence against the `@example` of that title. `findDrift` owns the comparison
			// and names both sides; converge the two sides through the native entry, never by
			// weakening this assertion. `findDrift` pairs an example only where a title is
			// present on both sides, so an untitled `@example` block is outside this case. Each
			// collected line is the spec, the key, and each side's text or `absent` — the same
			// worklist the native entry prints, so a failure here is read the way that command's
			// output is.
			it('keeps every compared summary and example equal to its source', () => {
				expect(report.drift.filter((finding) => finding.spec === entry.spec)).toEqual([])
			})

			it('documents an example for every Surface function', () => {
				expect(report.examples.functions.filter((finding) => finding.spec === entry.spec)).toEqual(
					[],
				)
			})

			for (const group of guide.methods()) {
				const entity = group.interface.replace(/Interface$/, '')
				const documented = group.methods.map((method) => method.name)
				const examples =
					entity === group.interface
						? source.examples(group.interface).map((example) => example.name)
						: source
								.examples(group.interface)
								.map((example) => example.name)
								.concat(source.examples(entity).map((example) => example.name))
				describe(`${group.interface} examples`, () => {
					it('documents an example for every method', () => {
						const fences = guide
							.fences()
							.filter((fence) => fence.language === EXAMPLE_LANGUAGE)
							.map((fence) => fence.code)
						expect(findUnexampled(documented, fences, examples)).toEqual([])
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

		it('returns equal results from the array-of-lines and rating-definition `rate` overloads', () => {
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
})
