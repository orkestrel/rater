import type { FieldPath } from '../types.js'
import type {
	Check,
	CheckResult,
	Expression,
	Factor,
	FactorResult,
	GroupResult,
	LogicalDefinition,
	LogicalResult,
	QuantitativeDefinition,
	QuantitativeResult,
	Rule,
	RuleResult,
	Subject,
} from '../reasons/index.js'
import type {
	AggregateDefinition,
	AggregateGroup,
	Decision,
	Determination,
	Effect,
	Eligibility,
	LineDefinition,
	LineResult,
	Notice,
	PassDefinition,
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
import { isFiniteNumber, isRecord } from '../contracts/index.js'
import { extractAtoms } from '../reasons/index.js'
import {
	cloneValue,
	formatField,
	freezeValue,
	interpolateMessage,
	omitUndefined,
	resolveField,
	setField,
} from '../helpers.js'
import { RaterError } from './errors.js'
import { isProgramDefinition } from './validators.js'
import {
	AGGREGATE_KEY,
	EFFECT_ELIGIBILITIES,
	ELIGIBILITY_DECISIONS,
	ELIGIBILITY_PRECEDENCE,
	OUTCOME_KEY,
	STATUS_PRECEDENCE,
} from './constants.js'

/** Build a program definition. */
export function programDefinition(
	id: string,
	name: string,
	options?: Partial<Omit<ProgramDefinition, 'id' | 'name'>>,
): ProgramDefinition {
	return { id, name, lines: options?.lines ?? [], ...omitUndefined(options) }
}

/** Build a line definition. */
export function lineDefinition(
	id: string,
	name: string,
	rate: QuantitativeDefinition,
	options?: Partial<Omit<LineDefinition, 'id' | 'name' | 'rate'>>,
): LineDefinition {
	return { id, name, rate, ...omitUndefined(options) }
}

/** Build a pass definition. */
export function passDefinition(
	definition: LogicalDefinition | QuantitativeDefinition,
	lineId?: string,
): PassDefinition {
	return lineId === undefined ? { definition } : { definition, line: lineId }
}

/** Build a ruling. */
export function rulingDefinition(effect: Effect, lineId?: string, message?: string): Ruling {
	return {
		effect,
		...(lineId === undefined ? {} : { line: lineId }),
		...(message === undefined ? {} : { message }),
	}
}

/** Build a notice. */
export function noticeDefinition(id: string, message: string, lineId?: string): Notice {
	return lineId === undefined ? { id, message } : { id, message, line: lineId }
}

/** Build an aggregate definition. */
export function aggregateDefinition(
	fields: readonly FieldPath[],
	by?: FieldPath,
	gates?: LogicalDefinition,
): AggregateDefinition {
	return { fields, ...(by === undefined ? {} : { by }), ...(gates === undefined ? {} : { gates }) }
}

/** Convert eligibility to authority decision. */
export function decideEligibility(eligibility: Eligibility): Decision {
	return ELIGIBILITY_DECISIONS[eligibility]
}

/** Return the most severe eligibility in a list. */
export function combineEligibilities(eligibilities: readonly Eligibility[]): Eligibility {
	for (const eligibility of ELIGIBILITY_PRECEDENCE) {
		if (eligibilities.includes(eligibility)) return eligibility
	}
	return 'eligible'
}

/** Sum defined line amounts, returning undefined when no line has an amount. */
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

/** Derive final status from eligibility, determinations, and unrated evidence. */
export function deriveStatus(
	eligibility: Eligibility,
	determinations: readonly Determination[],
	lines: readonly LineResult[],
): Status {
	if (eligibility === 'ineligible') return 'ineligible'
	if (eligibility === 'referral') return 'referral'
	if (determinations.some((entry) => entry.applied && entry.effect === 'condition'))
		return 'conditional'
	if (lines.some((entry) => !entry.worksheet?.success || entry.amount === undefined))
		return 'unrated'
	return 'eligible'
}

/** Describe a comparison with display-neutral words. */
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

/** Render one premise into a display-neutral sentence. */
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
 * Clone and deep-freeze a valid program definition.
 *
 * @remarks
 * Valid definitions are cloned with strict-core {@link cloneValue}, revalidated,
 * and then frozen so callers keep ownership of their original definition. A
 * malformed definition that fails its own guard is frozen in place rather than
 * cloned; this preserves the no-assertion type contract for `validate: false`
 * callers without using a host cloning global.
 *
 * @param definition - The program definition to prepare for runtime use
 * @returns A deeply frozen program definition
 *
 * @example
 * ```ts
 * const definition = freezeProgramDefinition(programDefinition('p1', 'Program'))
 * Object.isFrozen(definition.lines) // true
 * ```
 */
export function freezeProgramDefinition(definition: ProgramDefinition): ProgramDefinition {
	const cloned = cloneValue(definition)
	return isProgramDefinition(cloned) ? freezeValue(cloned) : freezeValue(definition)
}

/** Determine whether a subject contains reserved rater keys. */
export function hasReservedKey(subject: Readonly<Record<string, unknown>>): boolean {
	return Object.hasOwn(subject, AGGREGATE_KEY) || Object.hasOwn(subject, OUTCOME_KEY)
}

/**
 * Assert a value is a valid rater {@link Subject}, narrowing it in place.
 *
 * @param subject - The candidate subject to validate
 * @throws A `MISMATCH` {@link RaterError} when the value is not a record, or when
 * it already carries a reserved rater working-record key
 */
export function assertSubject(subject: unknown): asserts subject is Subject {
	if (!isRecord(subject)) throw new RaterError('MISMATCH', 'Subject must be a record')
	if (hasReservedKey(subject)) throw new RaterError('MISMATCH', 'Subject uses a reserved rater key')
}

/**
 * Build the empty, failed {@link LogicalResult} shell.
 *
 * @param message - An optional error message; when present it becomes the result's
 * sole `errors` entry, when absent `errors` stays empty
 * @returns A fresh failed logical result
 */
export function logicalFailure(message?: string): LogicalResult {
	return {
		reasoning: 'logical',
		conclusion: false,
		rules: [],
		count: 0,
		success: false,
		trace: [],
		errors: message === undefined ? [] : [message],
	}
}

/**
 * Build the empty, failed {@link QuantitativeResult} shell.
 *
 * @param message - An optional error message; when present it becomes the result's
 * sole `errors` entry, when absent `errors` stays empty
 * @returns A fresh failed quantitative result
 */
export function quantitativeFailure(message?: string): QuantitativeResult {
	return {
		reasoning: 'quantitative',
		value: 0,
		groups: [],
		count: 0,
		success: false,
		trace: [],
		errors: message === undefined ? [] : [message],
	}
}

/** Merge equals-conclusion atoms into a working record. */
export function mergeConclusion(record: Record<string, unknown>, rule: Rule): void {
	for (const entry of extractAtoms(rule.conclusion)) {
		if (entry.check.operator === 'equals') setField(record, entry.check.field, entry.check.value)
	}
}

/** Locate a rule definition by id. */
export function findRule(definition: LogicalDefinition, id: string): Rule | undefined {
	return definition.rules.find((rule) => rule.id === id)
}

/** Build premises from authored checks and check results. */
export function checkPremises(
	checks: readonly Check[] | undefined,
	results: readonly CheckResult[] | undefined,
	labels?: Readonly<Record<string, string>>,
): readonly Premise[] {
	return (Array.isArray(checks) ? checks : []).map((check, index) => {
		const result = results?.[index]
		return premiseCheck(check, result?.actual, result?.met, labels)
	})
}

/** Build premises from one logical rule result. */
export function logicalPremises(
	rule: Rule,
	result: RuleResult,
	record: Readonly<Record<string, unknown>>,
	labels?: Readonly<Record<string, string>>,
): readonly Premise[] {
	const output: Premise[] = []
	for (let index = 0; index < rule.premises.length; index += 1) {
		const expression = rule.premises[index]
		const met = result.premises[index]
		if (expression === undefined) continue
		if (expression.form === 'atom') {
			// A membership check (`any` / `none`) over an EMPTY array value is
			// content-free — a tautology / contradiction that reads as "is none
			// of —" in every surface. Skip it rather than render a vacuous premise.
			const { check } = expression
			if (
				(check.operator === 'any' || check.operator === 'none') &&
				Array.isArray(check.value) &&
				check.value.length === 0
			) {
				continue
			}
			output.push(premiseCheck(check, resolveField(record, check.field), met, labels))
			continue
		}
		output.push({
			description: describeExpression(expression, labels),
			...(met === undefined ? {} : { met }),
		})
	}
	return output
}

/** Describe a compound logical expression without atom-specific evidence. */
export function describeExpression(
	expression: Expression,
	labels?: Readonly<Record<string, string>>,
): string {
	if (expression.form === 'atom')
		return describePremise(premiseCheck(expression.check, undefined, undefined, labels), labels)
	const descriptions = expression.operands.map((operand) => describeExpression(operand, labels))
	return `${expression.operator} (${descriptions.join(', ')})`
}

/** Build a premise from a check. */
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

/** Join a quantitative definition and result into a worksheet. */
export function resultsWorksheet(
	definition: QuantitativeDefinition,
	result: QuantitativeResult,
	labels?: Readonly<Record<string, string>>,
): Worksheet {
	const authored = Array.isArray(definition.groups) ? definition.groups : []
	const groups = authored.map((group) => worksheetGroup(group, result.groups, labels))
	const steps = worksheetSteps(definition, result, groups)
	return {
		id: definition.id,
		name: definition.name,
		aggregation: definition.aggregation,
		...(definition.precision === undefined ? {} : { precision: definition.precision }),
		value: result.value,
		groups,
		steps,
		trace: [...result.trace],
		errors: [...result.errors],
		success: result.success,
	}
}

/** Join one group definition to its result. */
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
		factors: (Array.isArray(definition.factors) ? definition.factors : []).map((factor) =>
			worksheetFactor(factor, result?.factors ?? [], labels),
		),
	}
}

/** Join one factor definition to its result. */
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
		...(result === undefined ? {} : { value: result.value }),
		premises: checkPremises(definition.checks, result?.checks, labels),
	}
}

/** Build worksheet step rows. */
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

/** Build one worksheet step. */
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

/** Convert logical rule results into determinations. */
export function rulesToDeterminations(
	definition: LogicalDefinition,
	result: LogicalResult,
	rulings: Readonly<Record<string, Ruling>> | undefined,
	record: Readonly<Record<string, unknown>>,
	lineId: string | undefined,
	labels?: Readonly<Record<string, string>>,
): readonly Determination[] {
	const output: Determination[] = []
	for (const entry of result.rules) {
		const authored = findRule(definition, entry.id)
		if (authored === undefined) continue
		const routed = rulings?.[entry.id]
		if (!entry.applied && routed === undefined) continue
		const resolved = routed?.line ?? lineId
		output.push({
			id: entry.id,
			effect: routed?.effect ?? 'restriction',
			applied: entry.applied,
			...(resolved === undefined ? {} : { line: resolved }),
			...(routed?.message === undefined
				? {}
				: { message: interpolateMessage(routed.message, record) }),
			premises: logicalPremises(authored, entry, record, labels),
		})
	}
	return output
}

/** Convert authority results into limit determinations. */
export function authorityToDeterminations(
	definition: LogicalDefinition,
	result: LogicalResult,
	rulings: Readonly<Record<string, Ruling>> | undefined,
	record: Readonly<Record<string, unknown>>,
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
				: { message: interpolateMessage(routed.message, record) }),
			premises: logicalPremises(authored, entry, record, labels),
		})
	}
	return output
}

/** Convert notices into applied notice determinations. */
export function noticesToDeterminations(
	notices: readonly Notice[] | undefined,
	record: Readonly<Record<string, unknown>>,
): readonly Determination[] {
	return (notices ?? []).map((entry) => ({
		id: entry.id,
		effect: 'notice',
		applied: true,
		...(entry.line === undefined ? {} : { line: entry.line }),
		message: interpolateMessage(entry.message, record),
		premises: [],
	}))
}

/** Keep only line-scoped determinations for a line. */
export function filterLineDeterminations(
	determinations: readonly Determination[],
	id: string,
): readonly Determination[] {
	return determinations.filter((entry) => entry.line === id)
}

/** Keep only program-scoped determinations. */
export function filterProgramDeterminations(
	determinations: readonly Determination[],
): readonly Determination[] {
	return determinations.filter((entry) => entry.line === undefined)
}

/** Derive eligibility impact from determinations. */
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

/** Build an unrated line shell. */
export function unratedLine(
	definition: LineDefinition,
	determinations: readonly Determination[],
): LineResult {
	return {
		id: definition.id,
		name: definition.name,
		eligibility: deriveDeterminationEligibility(determinations),
		determinations,
	}
}

/** Build a rated line result. */
export function ratedLine(
	definition: LineDefinition,
	result: QuantitativeResult,
	determinations: readonly Determination[],
	labels?: Readonly<Record<string, string>>,
): LineResult {
	const joined = resultsWorksheet(definition.rate, result, labels)
	return {
		id: definition.id,
		name: definition.name,
		eligibility: deriveDeterminationEligibility(determinations),
		...(result.success ? { amount: result.value } : {}),
		worksheet: joined,
		determinations,
	}
}

/** Build an outcome projection for authority. */
export function outcomeProjection(result: ProgramResult): Readonly<Record<string, unknown>> {
	const lines: Record<string, unknown> = {}
	for (const rated of result.lines) {
		if (rated.amount !== undefined) lines[rated.id] = rated.amount
	}
	return { eligibility: result.eligibility, status: result.status, total: result.total, lines }
}

/** Build a final program result from parts. */
export function programResult(
	definition: ProgramDefinition,
	lines: readonly LineResult[],
	determinations: readonly Determination[],
	derivations: readonly Worksheet[],
	total: number | undefined,
	trace: readonly string[],
	errors: readonly string[],
): ProgramResult {
	const lineEligibilities = lines.map((entry) => entry.eligibility)
	const scoped = deriveDeterminationEligibility(determinations)
	const allIneligible =
		lines.length > 0 && lines.every((entry) => entry.eligibility === 'ineligible')
	const eligibility = allIneligible
		? 'ineligible'
		: combineEligibilities([scoped, ...lineEligibilities])
	const allDeterminations = [...determinations, ...lines.flatMap((entry) => entry.determinations)]
	const status = deriveStatus(eligibility, allDeterminations, lines)
	return {
		id: definition.id,
		name: definition.name,
		eligibility,
		status,
		lines,
		determinations,
		derivations,
		...(total === undefined ? {} : { total }),
		success: errors.length === 0 && lines.every((entry) => entry.worksheet?.success ?? true),
		trace,
		errors,
	}
}

/** Build aggregate sums for fields. */
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

/** Build aggregate groups. */
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

/** Build an aggregate working projection. */
export function aggregateProjection(
	count: number,
	sums: Readonly<Record<string, number>>,
	group?: AggregateGroup,
): Readonly<Record<string, unknown>> {
	return { count, sums, ...(group === undefined ? {} : { group }) }
}

/** Build an aggregate gate record. */
export function aggregateRecord(
	count: number,
	sums: Readonly<Record<string, number>>,
	group?: AggregateGroup,
): Readonly<Record<string, unknown>> {
	return { [AGGREGATE_KEY]: aggregateProjection(count, sums, group) }
}

/** Build zero sums for fields. */
export function emptySums(fields: readonly FieldPath[]): Readonly<Record<string, number>> {
	const sums: Record<string, number> = {}
	for (const field of fields) sums[formatField(field)] = 0
	return sums
}

/** Complete a tally record. */
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

/** Build empty status tallies in precedence order. */
export function emptyTallies(fields: readonly FieldPath[]): Readonly<Record<Status, Tally>> {
	const entries: Partial<Record<Status, Tally>> = {}
	for (const status of STATUS_PRECEDENCE) entries[status] = { count: 0, sums: emptySums(fields) }
	return completeTallies(entries)
}

/** Add a subject to status tallies. */
export function tallySubject(
	tallies: Readonly<Record<Status, Tally>>,
	status: Status,
	subject: Subject,
	fields: readonly FieldPath[],
): Readonly<Record<Status, Tally>> {
	const updated: Partial<Record<Status, Tally>> = {}
	for (const entry of STATUS_PRECEDENCE) updated[entry] = tallies[entry]
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

/** Return authored line references that do not match a program line id. */
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
/** Add late determinations to their placement and optionally derive a decision. */
export function appendDeterminations(
	result: ProgramResult,
	determinations: readonly Determination[],
	decision: Decision | undefined,
	trace: readonly string[] = [],
	errors: readonly string[] = [],
): ProgramResult {
	const lines = result.lines.map((rated) => ({
		...rated,
		determinations: [
			...rated.determinations,
			...filterLineDeterminations(determinations, rated.id),
		],
	}))
	const mergedErrors = [...result.errors, ...errors]
	return {
		...result,
		lines,
		determinations: [...result.determinations, ...filterProgramDeterminations(determinations)],
		...(decision === undefined ? {} : { decision }),
		success: result.success && errors.length === 0,
		trace: [...result.trace, ...trace],
		errors: mergedErrors,
	}
}
