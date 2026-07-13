import type { FieldPath } from '@orkestrel/contract'
import type {
	Check,
	CheckResult,
	EvaluatorInterface,
	Expression,
	Factor,
	FactorResult,
	GroupResult,
	LogicalDefinition,
	LogicalResult,
	QuantitativeDefinition,
	QuantitativeResult,
	Rule,
	Subject,
} from '@orkestrel/reason'
import type {
	AggregateGroup,
	Decision,
	Determination,
	Eligibility,
	LineDefinition,
	LineResult,
	Notice,
	Premise,
	ProgramDefinition,
	ProgramResult,
	Ruling,
	Stage,
	Status,
	Step,
	Tally,
	Worksheet,
	WorksheetFactor,
	WorksheetGroup,
} from './types.js'
import { isFiniteNumber, isRecord, resolveField } from '@orkestrel/contract'
import { extractAtoms, formatField } from '@orkestrel/reason'
import { RaterError } from './errors.js'
import {
	AGGREGATE_KEY,
	EFFECT_ELIGIBILITIES,
	ELIGIBILITY_DECISIONS,
	ELIGIBILITY_PRECEDENCE,
	OUTCOME_KEY,
	STATUS_PRECEDENCE,
} from './constants.js'

const MESSAGE_TOKEN = /\{\{\s*([^}]+?)\s*\}\}/g

/**
 * Interpolate `{{dotted.path}}` tokens in a message template against a record.
 *
 * @remarks
 * Each token is split on `.` into a {@link FieldPath} array and resolved with
 * the contracts {@link resolveField} (a plain string field is ONE key, never
 * dot-split — the split here is the token-to-path bridge). A finite number
 * renders with `en-US` thousand grouping (`5010` → `5,010`); any other resolved
 * value String-coerces. An UNRESOLVED path (the resolved value is `undefined`)
 * renders as the empty string — the deterministic "nothing to show" rule.
 *
 * @param template - The message template carrying `{{dotted.path}}` tokens
 * @param record - The record tokens resolve against
 * @returns The template with every token replaced
 *
 * @example
 * ```ts
 * import { interpolateMessage } from '@orkestrel/rater'
 *
 * interpolateMessage('Limit is {{limit}}', { limit: 5010 }) // 'Limit is 5,010'
 * interpolateMessage('Missing {{gone}}', {})                // 'Missing '
 * ```
 */
export function interpolateMessage(
	template: string,
	record: Readonly<Record<string, unknown>>,
): string {
	return template.replace(MESSAGE_TOKEN, (_match, path: string) => {
		const value = resolveField(record, path.split('.'))
		if (value === undefined) return ''
		if (isFiniteNumber(value)) return value.toLocaleString('en-US')
		return String(value)
	})
}

/**
 * Describe a {@link Premise} comparison as a display-neutral verb phrase.
 *
 * @param comparison - The comparison to describe
 * @returns A display-neutral phrase
 *
 * @example
 * ```ts
 * import { describeComparison } from '@orkestrel/rater'
 *
 * describeComparison('above') // 'is more than'
 * ```
 */
export function describeComparison(comparison: NonNullable<Premise['comparison']>): string {
	switch (comparison) {
		case 'equals':
			return 'is'
		case 'not':
			return 'is not'
		case 'above':
			return 'is more than'
		case 'below':
			return 'is less than'
		case 'from':
			return 'is at least'
		case 'to':
			return 'is at most'
		case 'any':
			return 'is any of'
		case 'none':
			return 'is none of'
		case 'between':
			return 'is between'
		case 'outside':
			return 'is outside'
	}
}

/**
 * Render one {@link Premise} into a display-neutral sentence.
 *
 * @param entry - The premise to render
 * @param labels - Optional field-to-label overrides, keyed by dot-joined field
 * @returns A display-neutral sentence
 *
 * @example
 * ```ts
 * import { describePremise } from '@orkestrel/rater'
 *
 * describePremise({ field: 'age', comparison: 'above', expected: 18, actual: 25, met: true })
 * // 'age is more than 18 ? met'
 * ```
 */
export function describePremise(entry: Premise, labels?: Readonly<Record<string, string>>): string {
	const status = entry.met === undefined ? 'unknown' : entry.met ? 'met' : 'not met'
	if (entry.field === undefined || entry.comparison === undefined) {
		return `${entry.description ?? 'Premise'} ? ${status}`
	}
	const field = formatField(entry.field)
	const label = labels?.[field] ?? entry.label ?? field
	const expected = entry.expected === undefined ? '' : ` ${String(entry.expected)}`
	return `${label} ${describeComparison(entry.comparison)}${expected} ? ${status}`
}

/**
 * Build a {@link Premise} from an evaluated {@link Check}.
 *
 * @param check - The authored check
 * @param actual - The resolved subject value
 * @param met - Whether the check was met (absent when not yet evaluated)
 * @param labels - Optional field-to-label overrides, keyed by dot-joined field
 * @returns A fresh premise
 */
export function premiseCheck(
	check: Check,
	actual: unknown,
	met: boolean | undefined,
	labels?: Readonly<Record<string, string>>,
): Premise {
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
 * Build premises from a quantitative factor's authored checks and evaluated
 * check results.
 *
 * @param checks - The factor's authored checks
 * @param results - The corresponding {@link CheckResult}s, in the same order
 * @param labels - Optional field-to-label overrides, keyed by dot-joined field
 * @returns A fresh list of premises, one per authored check
 */
export function checkPremises(
	checks: readonly Check[] | undefined,
	results: readonly CheckResult[] | undefined,
	labels?: Readonly<Record<string, string>>,
): readonly Premise[] {
	return (checks ?? []).map((check, index) => {
		const result = results?.[index]
		return premiseCheck(check, result?.actual, result?.met, labels)
	})
}

/**
 * Describe a logical {@link Expression} tree without atom-specific evidence.
 *
 * @param expression - The expression to describe
 * @param labels - Optional field-to-label overrides, keyed by dot-joined field
 * @returns A display-neutral description
 */
export function describeExpression(
	expression: Expression,
	labels?: Readonly<Record<string, string>>,
): string {
	if (expression.form === 'atom') {
		return describePremise(premiseCheck(expression.check, undefined, undefined, labels), labels)
	}
	const descriptions = expression.operands.map((operand) => describeExpression(operand, labels))
	return `${expression.operator} (${descriptions.join(', ')})`
}

/**
 * Build rich premises for one fired {@link Rule} by walking its premise atoms
 * and re-evaluating each against the working subject.
 *
 * @remarks
 * A reason {@link RuleResult} carries only booleans, so this is rater's own
 * premise-audit projection: each authored premise expression is flattened to
 * its atom leaves via {@link extractAtoms}, and each leaf's {@link Check} is
 * re-evaluated through the injected `evaluator`. A membership check (`any` /
 * `none`) over an EMPTY array value is content-free — a tautology or
 * contradiction that reads as "is none of —" in every surface — and is skipped.
 *
 * @param rule - The authored rule
 * @param working - The working subject to evaluate against
 * @param evaluator - The shared reason check evaluator
 * @param labels - Optional field-to-label overrides, keyed by dot-joined field
 * @returns A fresh, ordered list of rich premises
 */
export function logicalPremises(
	rule: Rule,
	working: Subject,
	evaluator: EvaluatorInterface,
	labels?: Readonly<Record<string, string>>,
): readonly Premise[] {
	const output: Premise[] = []
	for (const premise of rule.premises) {
		for (const atom of extractAtoms(premise)) {
			const { check } = atom
			if (
				(check.operator === 'any' || check.operator === 'none') &&
				Array.isArray(check.value) &&
				check.value.length === 0
			) {
				continue
			}
			const result = evaluator.evaluate(check, working)
			output.push(premiseCheck(check, result.actual, result.met, labels))
		}
	}
	return output
}

/**
 * Locate an authored {@link Rule} by id.
 *
 * @param definition - The logical definition to search
 * @param id - The rule id
 * @returns The matching rule, or `undefined`
 */
export function findRule(definition: LogicalDefinition, id: string): Rule | undefined {
	return definition.rules.find((rule) => rule.id === id)
}

/**
 * Join one authored quantitative factor to its evaluated {@link FactorResult}.
 *
 * @param definition - The authored factor
 * @param results - The group's factor results
 * @param labels - Optional field-to-label overrides, keyed by dot-joined field
 * @returns A fresh worksheet factor
 */
export function worksheetFactor(
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
		premises: checkPremises(definition.checks, result?.checks, labels),
	}
}

/**
 * Join one authored quantitative group to its evaluated {@link GroupResult}.
 *
 * @param definition - The authored group
 * @param results - The definition's group results
 * @param labels - Optional field-to-label overrides, keyed by dot-joined field
 * @returns A fresh worksheet group
 */
export function worksheetGroup(
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
			worksheetFactor(factor, result?.factors ?? [], labels),
		),
	}
}

/**
 * Build one display-neutral {@link Step} row.
 *
 * @param stage - The step's stage
 * @param id - The stage's authored id, when it has one
 * @param name - The stage's authored name, when it has one
 * @param value - The stage's resolved value
 * @param expression - A display-neutral expression string
 * @returns A fresh step
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
 * Build the ordered {@link Step} rows for a resolved {@link Worksheet}.
 *
 * @param definition - The authored quantitative definition
 * @param result - The evaluated quantitative result
 * @param groups - The definition's already-joined worksheet groups
 * @returns A fresh, ordered list of steps: applied factors, then groups, then the total
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
 * Join a {@link QuantitativeDefinition} and its {@link QuantitativeResult} into
 * a {@link Worksheet} — the rating audit trail.
 *
 * @param definition - The authored quantitative definition
 * @param result - The evaluated quantitative result
 * @param labels - Optional field-to-label overrides, keyed by dot-joined field
 * @returns A fresh worksheet
 */
export function resultsWorksheet(
	definition: QuantitativeDefinition,
	result: QuantitativeResult,
	labels?: Readonly<Record<string, string>>,
): Worksheet {
	const groups = definition.groups.map((group) => worksheetGroup(group, result.groups, labels))
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
 * Convert fired logical {@link RuleResult}s into line- or program-scoped
 * {@link Determination}s.
 *
 * @param definition - The authored logical definition
 * @param result - The evaluated logical result
 * @param rulings - Authored consequences, keyed by rule id
 * @param working - The working subject the rules ran against
 * @param line - The line id this pass is scoped to, when it is line-scoped
 * @param evaluator - The shared reason check evaluator
 * @param labels - Optional field-to-label overrides, keyed by dot-joined field
 * @returns A fresh list of determinations
 */
export function rulesToDeterminations(
	definition: LogicalDefinition,
	result: LogicalResult,
	rulings: Readonly<Record<string, Ruling>> | undefined,
	working: Subject,
	line: string | undefined,
	evaluator: EvaluatorInterface,
	labels?: Readonly<Record<string, string>>,
): readonly Determination[] {
	const output: Determination[] = []
	for (const entry of result.rules) {
		const authored = findRule(definition, entry.id)
		if (authored === undefined) continue
		const routed = rulings?.[entry.id]
		if (!entry.applied && routed === undefined) continue
		const resolved = routed?.line ?? line
		output.push({
			id: entry.id,
			effect: routed?.effect ?? 'restriction',
			applied: entry.applied,
			...(resolved === undefined ? {} : { line: resolved }),
			...(routed?.message === undefined
				? {}
				: { message: interpolateMessage(routed.message, working) }),
			premises: logicalPremises(authored, working, evaluator, labels),
		})
	}
	return output
}

/**
 * Convert an authority's fired {@link RuleResult}s into `limit`
 * {@link Determination}s.
 *
 * @param definition - The authority's logical definition
 * @param result - The evaluated logical result
 * @param rulings - Authored consequences, keyed by rule id
 * @param working - The working subject the authority ran against
 * @param evaluator - The shared reason check evaluator
 * @param labels - Optional field-to-label overrides, keyed by dot-joined field
 * @returns A fresh list of `limit` determinations
 */
export function authorityToDeterminations(
	definition: LogicalDefinition,
	result: LogicalResult,
	rulings: Readonly<Record<string, Ruling>> | undefined,
	working: Subject,
	evaluator: EvaluatorInterface,
	labels?: Readonly<Record<string, string>>,
): readonly Determination[] {
	const output: Determination[] = []
	for (const entry of result.rules) {
		if (!entry.applied) continue
		const authored = findRule(definition, entry.id)
		if (authored === undefined) continue
		const routed = rulings?.[entry.id]
		output.push({
			id: entry.id,
			effect: 'limit',
			applied: true,
			...(routed?.line === undefined ? {} : { line: routed.line }),
			...(routed?.message === undefined
				? {}
				: { message: interpolateMessage(routed.message, working) }),
			premises: logicalPremises(authored, working, evaluator, labels),
		})
	}
	return output
}

/**
 * Convert authored {@link Notice}s into unconditionally-applied
 * `notice` {@link Determination}s.
 *
 * @param notices - The authored notices
 * @param working - The working subject to interpolate messages against
 * @returns A fresh list of notice determinations
 */
export function noticesToDeterminations(
	notices: readonly Notice[] | undefined,
	working: Readonly<Record<string, unknown>>,
): readonly Determination[] {
	return (notices ?? []).map((entry) => ({
		id: entry.id,
		effect: 'notice',
		applied: true,
		...(entry.line === undefined ? {} : { line: entry.line }),
		message: interpolateMessage(entry.message, working),
		premises: [],
	}))
}

/**
 * Keep only the determinations scoped to one line.
 *
 * @param determinations - The determinations to filter
 * @param id - The line id to keep
 * @returns The determinations whose `line` matches `id`
 */
export function filterLineDeterminations(
	determinations: readonly Determination[],
	id: string,
): readonly Determination[] {
	return determinations.filter((entry) => entry.line === id)
}

/**
 * Keep only program-scoped (line-unscoped) determinations.
 *
 * @param determinations - The determinations to filter
 * @returns The determinations with no `line`
 */
export function filterProgramDeterminations(
	determinations: readonly Determination[],
): readonly Determination[] {
	return determinations.filter((entry) => entry.line === undefined)
}

/**
 * Derive the eligibility impact of a set of determinations.
 *
 * @param determinations - The determinations to fold
 * @returns The most severe eligibility any APPLIED determination's effect carries
 *
 * @example
 * ```ts
 * import { deriveDeterminationEligibility } from '@orkestrel/rater'
 *
 * deriveDeterminationEligibility([{ id: 'r1', effect: 'restriction', applied: true, premises: [] }])
 * // 'ineligible'
 * ```
 */
export function deriveDeterminationEligibility(
	determinations: readonly Determination[],
): Eligibility {
	const impacts: Eligibility[] = ['eligible']
	for (const entry of determinations) {
		const eligibility = entry.applied ? EFFECT_ELIGIBILITIES[entry.effect] : undefined
		if (eligibility !== undefined) impacts.push(eligibility)
	}
	return combineEligibilities(impacts)
}

/**
 * Return the most severe {@link Eligibility} in a list.
 *
 * @param eligibilities - The eligibilities to combine
 * @returns The most severe eligibility, or `'eligible'` for an empty list
 *
 * @example
 * ```ts
 * import { combineEligibilities } from '@orkestrel/rater'
 *
 * combineEligibilities(['eligible', 'referral']) // 'referral'
 * ```
 */
export function combineEligibilities(eligibilities: readonly Eligibility[]): Eligibility {
	for (const eligibility of ELIGIBILITY_PRECEDENCE) {
		if (eligibilities.includes(eligibility)) return eligibility
	}
	return 'eligible'
}

/**
 * Convert an {@link Eligibility} to its deterministic authority {@link Decision}.
 *
 * @param eligibility - The eligibility to convert
 * @returns The matching decision
 */
export function decideEligibility(eligibility: Eligibility): Decision {
	return ELIGIBILITY_DECISIONS[eligibility]
}

/**
 * Derive the final {@link Status} from eligibility, determinations, and rated
 * line evidence.
 *
 * @param eligibility - The program's combined eligibility
 * @param determinations - Every determination in scope (program and line)
 * @param lines - The program's rated lines
 * @returns The derived status
 */
export function deriveStatus(
	eligibility: Eligibility,
	determinations: readonly Determination[],
	lines: readonly LineResult[],
): Status {
	if (eligibility === 'ineligible') return 'ineligible'
	if (eligibility === 'referral') return 'referral'
	if (determinations.some((entry) => entry.applied && entry.effect === 'condition'))
		return 'conditional'
	if (lines.some((entry) => !(entry.worksheet?.success ?? false) || entry.amount === undefined))
		return 'unrated'
	return 'eligible'
}

/**
 * Build a rated {@link LineResult} from a line's evaluated
 * {@link QuantitativeResult}.
 *
 * @param definition - The authored line definition
 * @param result - The evaluated quantitative result
 * @param determinations - The line-scoped determinations
 * @param labels - Optional field-to-label overrides, keyed by dot-joined field
 * @returns A fresh line result
 */
export function ratedLine(
	definition: LineDefinition,
	result: QuantitativeResult,
	determinations: readonly Determination[],
	labels?: Readonly<Record<string, string>>,
): LineResult {
	return {
		id: definition.id,
		name: definition.name,
		eligibility: deriveDeterminationEligibility(determinations),
		...(result.success ? { amount: result.value } : {}),
		worksheet: resultsWorksheet(definition.rate, result, labels),
		determinations,
	}
}

/**
 * Sum defined line amounts.
 *
 * @param lines - The rated lines
 * @returns The sum of every line's `amount`, or `undefined` when no line has one
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

/**
 * Build an authority outcome projection from an assembled {@link ProgramResult}.
 *
 * @param result - The program result computed before authority runs
 * @returns A record shaped for the authority's `outcome` projection
 */
export function outcomeProjection(result: ProgramResult): Readonly<Record<string, unknown>> {
	const lines: Record<string, unknown> = {}
	for (const rated of result.lines) {
		if (rated.amount !== undefined) lines[rated.id] = rated.amount
	}
	return { eligibility: result.eligibility, status: result.status, total: result.total, lines }
}

/**
 * Assemble a final {@link ProgramResult} from its rated parts.
 *
 * @param definition - The authored program definition
 * @param lines - The program's rated lines
 * @param determinations - The program-scoped determinations
 * @param derivations - The pass-level quantitative worksheets
 * @param total - The program's total amount, when the total handler produced one
 * @param decision - The authority-derived decision, when one was reached
 * @param trace - The accumulated reasoning trace
 * @param errors - The accumulated reasoning errors
 * @returns A fresh program result
 */
export function programResult(
	definition: ProgramDefinition,
	lines: readonly LineResult[],
	determinations: readonly Determination[],
	derivations: readonly Worksheet[],
	total: number | undefined,
	decision: Decision | undefined,
	trace: readonly string[],
	errors: readonly string[],
): ProgramResult {
	const scoped = deriveDeterminationEligibility(determinations)
	const lineEligibilities = lines.map((entry) => entry.eligibility)
	const allIneligible =
		lines.length > 0 && lines.every((entry) => entry.eligibility === 'ineligible')
	const eligibility = allIneligible
		? 'ineligible'
		: combineEligibilities([scoped, ...lineEligibilities])
	const allDeterminations = [...determinations, ...lines.flatMap((entry) => entry.determinations)]
	return {
		id: definition.id,
		name: definition.name,
		eligibility,
		status: deriveStatus(eligibility, allDeterminations, lines),
		...(decision === undefined ? {} : { decision }),
		lines,
		determinations,
		derivations,
		...(total === undefined ? {} : { total }),
		success: errors.length === 0 && lines.every((entry) => entry.worksheet?.success ?? true),
		trace,
		errors,
	}
}

/**
 * Return authored line references (in passes, rulings, or notices) that name
 * no line on the program.
 *
 * @param definition - The program definition to check
 * @returns A fresh, deduped list of missing line ids
 */
export function findMissingLineReferences(definition: ProgramDefinition): readonly string[] {
	const ids = new Set(definition.lines.map((entry) => entry.id))
	const missing = new Set<string>()
	for (const entry of definition.passes ?? []) {
		if (entry.line !== undefined && !ids.has(entry.line)) missing.add(entry.line)
	}
	for (const entry of Object.values(definition.rulings ?? {})) {
		if (entry.line !== undefined && !ids.has(entry.line)) missing.add(entry.line)
	}
	for (const entry of definition.notices ?? []) {
		if (entry.line !== undefined && !ids.has(entry.line)) missing.add(entry.line)
	}
	return [...missing]
}

/** Determine whether a working record already carries a reserved rater key. */
export function hasReservedKey(subject: Readonly<Record<string, unknown>>): boolean {
	return Object.hasOwn(subject, AGGREGATE_KEY) || Object.hasOwn(subject, OUTCOME_KEY)
}

/**
 * Assert a value is a valid rater {@link Subject}, narrowing it in place.
 *
 * @param subject - The candidate subject to validate
 * @throws {@link RaterError} `'MISMATCH'` when the value is not a record, or
 * when it already carries a reserved rater working-subject key
 */
export function assertSubject(subject: unknown): asserts subject is Subject {
	if (!isRecord(subject)) throw new RaterError('MISMATCH', 'Subject must be a record')
	if (hasReservedKey(subject)) throw new RaterError('MISMATCH', 'Subject uses a reserved rater key')
}

/**
 * Sum aggregate fields across a batch of subjects.
 *
 * @param subjects - The batch of subjects
 * @param fields - The fields to sum
 * @returns A fresh record of dot-joined field to summed finite value
 */
export function aggregateSums(
	subjects: readonly Subject[],
	fields: readonly FieldPath[],
): Readonly<Record<string, number>> {
	const sums: Record<string, number> = {}
	for (const field of fields) sums[formatField(field)] = 0
	for (const subject of subjects) {
		for (const field of fields) {
			const key = formatField(field)
			const value = resolveField(subject, field)
			if (isFiniteNumber(value)) sums[key] = (sums[key] ?? 0) + value
		}
	}
	return sums
}

/**
 * Partition a batch of subjects by a field, summing aggregate fields per
 * partition.
 *
 * @param subjects - The batch of subjects
 * @param fields - The fields to sum within each partition
 * @param by - The partition key field; no partition is built when absent
 * @returns A fresh list of aggregate groups, or an empty list when `by` is absent
 */
export function aggregateGroups(
	subjects: readonly Subject[],
	fields: readonly FieldPath[],
	by?: FieldPath,
): readonly AggregateGroup[] {
	if (by === undefined) return []
	const groups = new Map<string, Subject[]>()
	for (const subject of subjects) {
		const key = String(resolveField(subject, by) ?? '')
		const entries = groups.get(key) ?? []
		entries.push(subject)
		groups.set(key, entries)
	}
	return [...groups.entries()].map(([key, entries]) => ({
		key,
		count: entries.length,
		sums: aggregateSums(entries, fields),
	}))
}

/**
 * Build the batch aggregate working projection written under
 * {@link AGGREGATE_KEY}'s value.
 *
 * @param count - The batch (or partition) subject count
 * @param sums - The summed aggregate fields
 * @param group - The subject's own partition, when the aggregate is partitioned
 * @returns A fresh aggregate projection record
 */
export function aggregateProjection(
	count: number,
	sums: Readonly<Record<string, number>>,
	group?: AggregateGroup,
): Readonly<Record<string, unknown>> {
	return { count, sums, ...(group === undefined ? {} : { group }) }
}

/**
 * Build the reserved-key record an aggregate gate definition runs against.
 *
 * @param count - The batch (or partition) subject count
 * @param sums - The summed aggregate fields
 * @param group - The subject's own partition, when the aggregate is partitioned
 * @returns A fresh record carrying the aggregate projection under {@link AGGREGATE_KEY}
 */
export function aggregateRecord(
	count: number,
	sums: Readonly<Record<string, number>>,
	group?: AggregateGroup,
): Readonly<Record<string, unknown>> {
	return { [AGGREGATE_KEY]: aggregateProjection(count, sums, group) }
}

/**
 * Build zero sums for a set of fields.
 *
 * @param fields - The fields to zero
 * @returns A fresh record of dot-joined field to `0`
 */
export function emptySums(fields: readonly FieldPath[]): Readonly<Record<string, number>> {
	const sums: Record<string, number> = {}
	for (const field of fields) sums[formatField(field)] = 0
	return sums
}

/**
 * Complete a partial status tally record with zero entries for every missing
 * {@link Status}.
 *
 * @param entries - The partial tally entries to complete
 * @returns A record with all five statuses present
 */
export function completeTallies(
	entries: Partial<Record<Status, Tally>>,
): Readonly<Record<Status, Tally>> {
	return {
		ineligible: entries.ineligible ?? { count: 0, sums: {} },
		referral: entries.referral ?? { count: 0, sums: {} },
		conditional: entries.conditional ?? { count: 0, sums: {} },
		unrated: entries.unrated ?? { count: 0, sums: {} },
		eligible: entries.eligible ?? { count: 0, sums: {} },
	}
}

/**
 * Build empty status tallies in precedence order.
 *
 * @param fields - The fields each tally's sums are zeroed for
 * @returns A fresh, complete tally record
 */
export function emptyTallies(fields: readonly FieldPath[]): Readonly<Record<Status, Tally>> {
	const entries: Partial<Record<Status, Tally>> = {}
	for (const status of STATUS_PRECEDENCE) entries[status] = { count: 0, sums: emptySums(fields) }
	return completeTallies(entries)
}

/**
 * Add one subject's aggregate contribution to a status tally record.
 *
 * @param tallies - The tallies to update
 * @param status - The subject's derived status
 * @param subject - The subject to fold in
 * @param fields - The fields to sum
 * @returns A fresh, complete tally record with the subject folded in
 */
export function tallySubject(
	tallies: Readonly<Record<Status, Tally>>,
	status: Status,
	subject: Subject,
	fields: readonly FieldPath[],
): Readonly<Record<Status, Tally>> {
	const updated: Partial<Record<Status, Tally>> = { ...tallies }
	const current = tallies[status]
	const sums: Record<string, number> = { ...current.sums }
	for (const field of fields) {
		const key = formatField(field)
		const value = resolveField(subject, field)
		if (isFiniteNumber(value)) sums[key] = (sums[key] ?? 0) + value
	}
	updated[status] = { count: current.count + 1, sums }
	return completeTallies(updated)
}
