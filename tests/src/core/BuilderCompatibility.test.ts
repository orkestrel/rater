import type { Rule } from '@src/core'
import {
	atom,
	bounds,
	createDefinitionBuilder,
	createProgram,
	createRuleManager,
	createSubjectBuilder,
	factorGroup,
	fieldFactor,
	lineDefinition,
	logicalDefinition,
	lookupFactor,
	passDefinition,
	programDefinition,
	quantitativeDefinition,
	rangeFactor,
	rule,
} from '@src/core'
import { describe, expect, it } from 'vitest'

// Class-builder <-> function-builder compatibility proof: `DefinitionBuilder`
// and `SubjectBuilder` (both id-optional per this branch) must produce
// STRUCTURALLY IDENTICAL data to the function-builder equivalents, and that
// data must flow through the raters function-builders (`lineDefinition` /
// `passDefinition` / `programDefinition`) into `createProgram` -> rating with
// identical outcomes.

// A small quantitative definition authored both ways: a group with a static
// factor, a field factor, and a range factor with bands.
function quantitativeViaFunctions() {
	return quantitativeDefinition('quote', 'Quote', [
		factorGroup('charge', 'sum', [
			fieldFactor('base', 'base'),
			lookupFactor('state-score', 'state', { CA: 5, NY: 8 }),
			rangeFactor('age-band', 'age', [{ bounds: bounds(undefined, 24), value: 30 }]),
		]),
	])
}

function quantitativeViaBuilder() {
	const definition = createDefinitionBuilder(quantitativeDefinition('quote', 'Quote', []))
	definition.groups.append(factorGroup('charge', 'sum', []))
	definition.factors.append('charge', fieldFactor('base', 'base'))
	definition.factors.append('charge', lookupFactor('state-score', 'state', { CA: 5, NY: 8 }))
	definition.factors.append(
		'charge',
		rangeFactor('age-band', 'age', [{ bounds: bounds(undefined, 24), value: 30 }]),
	)
	const built = definition.build()
	definition.destroy()
	return built
}

// A small logical definition authored both ways, with a targeted insert
// (`append`/`prepend` against an anchor) mirroring `spliceNoticeRules`
// before/after semantics.
function logicalViaFunctions() {
	return logicalDefinition('eligibility', 'Eligibility', [
		rule('adult', [atom('age', 'from', 18)], atom('adult', 'equals', true)),
		rule('review', [atom('adult', 'equals', true)], atom('review', 'equals', true)),
		rule('coastal', [atom('coastal', 'equals', true)], atom('coastal', 'equals', true)),
	])
}

function logicalViaBuilder() {
	const rules = createRuleManager()
	const definition = createDefinitionBuilder(logicalDefinition('eligibility', 'Eligibility', []), {
		rules,
	})
	definition.rules.append(rule('adult', [atom('age', 'from', 18)], atom('adult', 'equals', true)))
	definition.rules.append(
		rule('coastal', [atom('coastal', 'equals', true)], atom('coastal', 'equals', true)),
	)
	// insert 'review' immediately AFTER 'adult' (append with anchor target)
	definition.rules.append(
		rule('review', [atom('adult', 'equals', true)], atom('review', 'equals', true)),
		'adult',
	)
	const built = definition.build()
	definition.destroy()
	rules.destroy()
	return built
}

describe('BuilderCompatibility — class builders vs function builders', () => {
	it('produces a deep-equal QuantitativeDefinition from DefinitionBuilder and function-builders', () => {
		const viaBuilder = quantitativeViaBuilder()
		const viaFunctions = quantitativeViaFunctions()
		expect(viaBuilder).toEqual(viaFunctions)
	})

	it('produces a deep-equal LogicalDefinition, honoring append(item, target) as immediately-after', () => {
		const viaBuilder = logicalViaBuilder()
		const viaFunctions = logicalViaFunctions()
		expect(viaBuilder).toEqual(viaFunctions)
		if (viaBuilder.reasoning !== 'logical') throw new Error('expected a logical definition')
		expect(viaBuilder.rules.map((entry: Rule) => entry.id)).toEqual(['adult', 'review', 'coastal'])
	})

	it('honors prepend(item, target) as immediately-before the anchor', () => {
		const rules = createRuleManager()
		const definition = createDefinitionBuilder(
			logicalDefinition('eligibility', 'Eligibility', []),
			{ rules },
		)
		definition.rules.append(rule('adult', [atom('age', 'from', 18)], atom('adult', 'equals', true)))
		definition.rules.append(
			rule('coastal', [atom('coastal', 'equals', true)], atom('coastal', 'equals', true)),
		)
		definition.rules.prepend(
			rule('review', [atom('adult', 'equals', true)], atom('review', 'equals', true)),
			'coastal',
		)
		const built = definition.build()
		definition.destroy()
		rules.destroy()

		if (built.reasoning !== 'logical') throw new Error('expected a logical definition')
		expect(built.rules.map((entry: Rule) => entry.id)).toEqual(['adult', 'review', 'coastal'])
	})
})

describe('BuilderCompatibility — round-trip rating through the raters pipeline', () => {
	it('rates a SubjectBuilder-built subject through a class-builder-authored program identically to the function-built equivalent', () => {
		const quantitative = quantitativeViaBuilder()
		const logical = logicalViaBuilder()
		if (quantitative.reasoning !== 'quantitative')
			throw new Error('expected a quantitative definition')
		if (logical.reasoning !== 'logical') throw new Error('expected a logical definition')

		const programViaBuilder = createProgram(
			programDefinition('program', 'Program', {
				passes: [passDefinition(logical, 'quote')],
				lines: [lineDefinition('quote', 'Quote', quantitative)],
			}),
		)
		const programViaFunctions = createProgram(
			programDefinition('program', 'Program', {
				passes: [passDefinition(logicalViaFunctions(), 'quote')],
				lines: [lineDefinition('quote', 'Quote', quantitativeViaFunctions())],
			}),
		)

		const subject = createSubjectBuilder({
			id: 's1',
			base: 100,
			state: 'CA',
			age: 20,
			coastal: true,
		})
		const builtSubject = subject.build()
		subject.destroy()

		const literalSubject = { id: 's1', base: 100, state: 'CA', age: 20, coastal: true }

		const resultViaBuilder = programViaBuilder.rate(builtSubject)
		const resultViaFunctions = programViaFunctions.rate(literalSubject)

		expect(resultViaBuilder.total).toBe(resultViaFunctions.total)
		expect(resultViaBuilder.eligibility).toBe(resultViaFunctions.eligibility)
		expect(resultViaBuilder.lines).toEqual(resultViaFunctions.lines)
		expect(resultViaBuilder.derivations).toEqual(resultViaFunctions.derivations)
	})
})

describe('BuilderCompatibility — anonymous vs id-ful subjects', () => {
	it('an anonymous SubjectBuilder omits the id key and rates identically to an id-ful equivalent', () => {
		const quantitative = quantitativeViaFunctions()
		const program = createProgram(
			programDefinition('program', 'Program', {
				lines: [lineDefinition('quote', 'Quote', quantitative)],
			}),
		)

		const anonymous = createSubjectBuilder({ base: 100, state: 'CA', age: 20 })
		const idful = createSubjectBuilder({ id: 's1', base: 100, state: 'CA', age: 20 })
		const anonymousBuilt = anonymous.build()
		const idfulBuilt = idful.build()
		anonymous.destroy()
		idful.destroy()

		expect('id' in anonymousBuilt).toBe(false)
		expect(anonymous.id).toBeUndefined()
		expect(idful.id).toBe('s1')

		const anonymousResult = program.rate(anonymousBuilt)
		const idfulResult = program.rate(idfulBuilt)

		expect(anonymousResult.total).toBe(idfulResult.total)
		expect(anonymousResult.eligibility).toBe(idfulResult.eligibility)
		expect(anonymousResult.lines).toEqual(idfulResult.lines)
	})
})
