import type {
	Check,
	CheckResult,
	Factor,
	FactorResult,
	GroupResult,
	QuantitativeDefinition,
	QuantitativeResult,
} from '@orkestrel/reason'
import type {
	Evidence,
	LineDefinition,
	LineResult,
	RatingDefinition,
	Stage,
	Step,
	Worksheet,
	WorksheetFactor,
	WorksheetGroup,
} from './types.js'
import { formatField } from '@orkestrel/reason'

/**
 * Builds a {@link LineDefinition}.
 *
 * @param id - The line id
 * @param name - The display name
 * @param rate - The line's quantitative rating definition
 * @param overrides - Optional {@link LineDefinition} fields merged over the defaults
 * @returns A fresh line definition
 *
 * @example
 * ```ts
 * import { createQuantitativeDefinition } from '@orkestrel/reason'
 * import { lineDefinition } from '@orkestrel/rater'
 *
 * lineDefinition('base', 'Base Amount', createQuantitativeDefinition('base', 'Base', []))
 * ```
 */
export function lineDefinition(
	id: string,
	name: string,
	rate: QuantitativeDefinition,
	overrides?: Partial<Omit<LineDefinition, 'id' | 'name' | 'rate'>>,
): LineDefinition {
	return { id, name, rate, ...overrides }
}

/**
 * Builds a {@link RatingDefinition}.
 *
 * @param id - The rating id
 * @param name - The display name
 * @param lines - The rating's ordered lines
 * @param overrides - Optional {@link RatingDefinition} fields merged over the defaults
 * @returns A fresh rating definition
 *
 * @example
 * ```ts
 * import { lineDefinition, ratingDefinition } from '@orkestrel/rater'
 * import { createQuantitativeDefinition } from '@orkestrel/reason'
 *
 * ratingDefinition('r1', 'Rating', [
 * 	lineDefinition('base', 'Base Amount', createQuantitativeDefinition('base', 'Base', [])),
 * ])
 * ```
 */
export function ratingDefinition(
	id: string,
	name: string,
	lines: readonly LineDefinition[],
	overrides?: Partial<Omit<RatingDefinition, 'id' | 'name' | 'lines'>>,
): RatingDefinition {
	return { id, name, lines, ...overrides }
}

/**
 * Builds an {@link Evidence} row from an evaluated {@link Check}.
 *
 * @param check - The authored check
 * @param actual - The resolved subject value
 * @param met - Whether the check was met (absent when not yet evaluated)
 * @param labels - Optional field-to-label overrides, keyed by dot-joined field
 * @returns A fresh evidence row
 *
 * @example
 * ```ts
 * import { createCheck } from '@orkestrel/reason'
 * import { buildEvidence } from '@orkestrel/rater'
 *
 * const entry = createCheck('age', 'above', 18)
 * buildEvidence(entry, 25, true) // { field: 'age', comparison: 'above', expected: 18, actual: 25, met: true }
 * ```
 */
export function buildEvidence(
	check: Check,
	actual: unknown,
	met: boolean | undefined,
	labels?: Readonly<Record<string, string>>,
): Evidence {
	const field = formatField(check.field)
	return {
		field: check.field,
		...(labels?.[field] === undefined ? {} : { label: labels[field] }),
		comparison: check.operator,
		expected: check.value,
		actual,
		...(met === undefined ? {} : { met }),
	}
}

/**
 * Builds one evidence row per authored check of a quantitative factor, joined
 * to that check's evaluated result.
 *
 * @param checks - The factor's authored checks
 * @param results - The corresponding {@link CheckResult}s, in the same order
 * @param labels - Optional field-to-label overrides, keyed by dot-joined field
 * @returns A fresh list of evidence rows, one per authored check
 *
 * @example
 * ```ts
 * import { createCheck } from '@orkestrel/reason'
 * import { buildEvidenceRows } from '@orkestrel/rater'
 *
 * const checks = [createCheck('age', 'above', 18)]
 * buildEvidenceRows(checks, [{ field: 'age', met: true, actual: 25 }])
 * ```
 */
export function buildEvidenceRows(
	checks: readonly Check[] | undefined,
	results: readonly CheckResult[] | undefined,
	labels?: Readonly<Record<string, string>>,
): readonly Evidence[] {
	return (checks ?? []).map((check, index) => {
		const result = results?.[index]
		return buildEvidence(check, result?.actual, result?.met, labels)
	})
}

/**
 * Joins one authored quantitative factor to its evaluated {@link FactorResult}.
 *
 * @param definition - The authored factor
 * @param results - The group's factor results
 * @param labels - Optional field-to-label overrides, keyed by dot-joined field
 * @returns A fresh worksheet factor
 *
 * @example
 * ```ts
 * import { createFieldFactor } from '@orkestrel/reason'
 * import { buildWorksheetFactor } from '@orkestrel/rater'
 *
 * const factor = createFieldFactor('seats', 'seats')
 * buildWorksheetFactor(factor, [{ id: 'seats', applied: true, value: 10 }])
 * ```
 */
export function buildWorksheetFactor(
	definition: Factor,
	results: readonly FactorResult[],
	labels?: Readonly<Record<string, string>>,
): WorksheetFactor {
	const result = results.find((entry) => entry.id === definition.id)
	return {
		id: definition.id,
		name: definition.name,
		...(definition.description === undefined ? {} : { description: definition.description }),
		applied: result?.applied ?? false,
		...(result?.value === undefined ? {} : { value: result.value }),
		evidence: buildEvidenceRows(definition.checks, result?.checks, labels),
	}
}

/**
 * Joins one authored quantitative group to its evaluated {@link GroupResult}.
 *
 * @param definition - The authored group
 * @param results - The definition's group results
 * @param labels - Optional field-to-label overrides, keyed by dot-joined field
 * @returns A fresh worksheet group
 *
 * @example
 * ```ts
 * import { createFactorGroup, createStaticFactor } from '@orkestrel/reason'
 * import { buildWorksheetGroup } from '@orkestrel/rater'
 *
 * const group = createFactorGroup('charge', 'sum', [createStaticFactor('base', 100)])
 * buildWorksheetGroup(group, [{ id: 'charge', applied: true, value: 100, factors: [] }])
 * ```
 */
export function buildWorksheetGroup(
	definition: QuantitativeDefinition['groups'][number],
	results: readonly GroupResult[],
	labels?: Readonly<Record<string, string>>,
): WorksheetGroup {
	const result = results.find((entry) => entry.id === definition.id)
	return {
		id: definition.id,
		name: definition.name,
		...(definition.description === undefined ? {} : { description: definition.description }),
		applied: result?.applied ?? false,
		value: result?.value ?? 0,
		factors: definition.factors.map((factor) =>
			buildWorksheetFactor(factor, result?.factors ?? [], labels),
		),
	}
}

/**
 * Builds one display-neutral {@link Step} row.
 *
 * @param stage - The step's stage
 * @param id - The stage's authored id, when it has one
 * @param name - The stage's authored name, when it has one
 * @param value - The stage's resolved value
 * @param expression - A display-neutral expression string
 * @returns A fresh step
 *
 * @example
 * ```ts
 * import { worksheetStep } from '@orkestrel/rater'
 *
 * worksheetStep('total', 'quote', 'Quote', 110, 'sum = 110')
 * // { stage: 'total', id: 'quote', name: 'Quote', value: 110, expression: 'sum = 110' }
 * ```
 */
export function worksheetStep(
	stage: Stage,
	id: string | undefined,
	name: string | undefined,
	value: number,
	expression: string,
): Step {
	return {
		stage,
		...(id === undefined ? {} : { id }),
		...(name === undefined ? {} : { name }),
		value,
		expression,
	}
}

/**
 * Builds the ordered {@link Step} rows for a resolved {@link Worksheet}.
 *
 * @param definition - The authored quantitative definition
 * @param result - The evaluated quantitative result
 * @param groups - The definition's already-joined worksheet groups
 * @returns A fresh, ordered list of steps: applied factors, then groups, then the total
 *
 * @example
 * ```ts
 * import { createFactorGroup, createQuantitativeDefinition, createQuantitativeReasoner, createReason, createStaticFactor } from '@orkestrel/reason'
 * import { buildWorksheetGroup, worksheetSteps } from '@orkestrel/rater'
 *
 * const definition = createQuantitativeDefinition('base', 'Base', [createFactorGroup('g', 'sum', [createStaticFactor('flat', 100)])])
 * const result = createReason({ reasoners: [createQuantitativeReasoner()] }).reason({}, definition)
 * if (result.reasoning === 'quantitative') {
 * 	worksheetSteps(definition, result, definition.groups.map((group) => buildWorksheetGroup(group, result.groups)))
 * }
 * ```
 */
export function worksheetSteps(
	definition: QuantitativeDefinition,
	result: QuantitativeResult,
	groups: readonly WorksheetGroup[],
): readonly Step[] {
	const output: Step[] = []
	for (const group of groups) {
		for (const factor of group.factors) {
			if (factor.applied && factor.value !== undefined) {
				output.push(
					worksheetStep(
						'factor',
						factor.id,
						factor.name,
						factor.value,
						`${factor.id} = ${factor.value}`,
					),
				)
			}
		}
		output.push(
			worksheetStep('group', group.id, group.name, group.value, `${group.id} = ${group.value}`),
		)
	}
	output.push(
		worksheetStep(
			'total',
			definition.id,
			definition.name,
			result.value,
			`${definition.aggregation} = ${result.value}`,
		),
	)
	return output
}

/**
 * Joins a {@link QuantitativeDefinition} and its {@link QuantitativeResult} into
 * a {@link Worksheet} — the rating audit trail.
 *
 * @param definition - The authored quantitative definition
 * @param result - The evaluated quantitative result
 * @param labels - Optional field-to-label overrides, keyed by dot-joined field
 * @returns A fresh worksheet
 *
 * @example
 * ```ts
 * import { createFactorGroup, createQuantitativeDefinition, createQuantitativeReasoner, createReason, createStaticFactor } from '@orkestrel/reason'
 * import { buildWorksheet } from '@orkestrel/rater'
 *
 * const definition = createQuantitativeDefinition('base', 'Base', [createFactorGroup('g', 'sum', [createStaticFactor('flat', 100)])])
 * const result = createReason({ reasoners: [createQuantitativeReasoner()] }).reason({}, definition)
 * if (result.reasoning === 'quantitative') buildWorksheet(definition, result) // the full audit trail
 * ```
 */
export function buildWorksheet(
	definition: QuantitativeDefinition,
	result: QuantitativeResult,
	labels?: Readonly<Record<string, string>>,
): Worksheet {
	const groups = definition.groups.map((group) => buildWorksheetGroup(group, result.groups, labels))
	return {
		id: definition.id,
		name: definition.name,
		aggregation: definition.aggregation,
		...(definition.precision === undefined ? {} : { precision: definition.precision }),
		value: result.value,
		groups,
		steps: worksheetSteps(definition, result, groups),
		trace: result.trace,
		errors: result.errors,
		success: result.success,
	}
}

/**
 * Builds a rated {@link LineResult} from a line's evaluated
 * {@link QuantitativeResult}.
 *
 * @param definition - The authored line definition
 * @param result - The evaluated quantitative result
 * @param labels - Optional field-to-label overrides, keyed by dot-joined field
 * @returns A fresh line result
 *
 * @example
 * ```ts
 * import { createQuantitativeDefinition, createQuantitativeReasoner, createReason } from '@orkestrel/reason'
 * import { buildLineResult, lineDefinition } from '@orkestrel/rater'
 *
 * const line = lineDefinition('base', 'Base', createQuantitativeDefinition('base', 'Base', []))
 * const result = createReason({ reasoners: [createQuantitativeReasoner()] }).reason({}, line.rate)
 * if (result.reasoning === 'quantitative') buildLineResult(line, result) // amount present only on a successful worksheet
 * ```
 */
export function buildLineResult(
	definition: LineDefinition,
	result: QuantitativeResult,
	labels?: Readonly<Record<string, string>>,
): LineResult {
	return {
		id: definition.id,
		name: definition.name,
		...(result.success ? { amount: result.value } : {}),
		worksheet: buildWorksheet(definition.rate, result, labels),
	}
}

/**
 * Sums defined line amounts.
 *
 * @param lines - The rated lines
 * @returns The sum of every line's `amount`, or `undefined` when no line has one
 *
 * @example
 * ```ts
 * import { createFactorGroup, createQuantitativeDefinition, createQuantitativeReasoner, createReason, createStaticFactor } from '@orkestrel/reason'
 * import { buildLineResult, lineDefinition, sumAmounts } from '@orkestrel/rater'
 *
 * const rate = createQuantitativeDefinition('base', 'Base', [createFactorGroup('g', 'sum', [createStaticFactor('flat', 100)])])
 * const line = lineDefinition('base', 'Base', rate)
 * const result = createReason({ reasoners: [createQuantitativeReasoner()] }).reason({}, rate)
 * if (result.reasoning === 'quantitative') sumAmounts([buildLineResult(line, result)]) // 100
 * ```
 */
export function sumAmounts(lines: readonly LineResult[]): number | undefined {
	let total = 0
	let count = 0
	for (const rated of lines) {
		if (rated.amount !== undefined) {
			total += rated.amount
			count += 1
		}
	}
	return count === 0 ? undefined : total
}
