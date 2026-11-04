import type { ContractShape } from '@orkestrel/contract'
import {
	arrayShape,
	booleanShape,
	jsonShape,
	literalShape,
	nullableShape,
	numberShape,
	objectShape,
	optionalShape,
	stringShape,
} from '@orkestrel/contract'
import {
	AGGREGATIONS,
	CHECK_STATES,
	COMPARISONS,
	faultShape,
	fieldPathShape,
	quantitativeDefinitionShape,
} from '@orkestrel/reason'
import { WORKSHEET_STAGES } from './constants.js'

// A rating definition and result as shapes, so they reach an LLM, a tool, and MCP as JSON Schema. A
// result is shaped in its JSON projection, where a non-finite number is `null`.

/** Describes a `LineDefinition`. */
export const lineDefinitionShape: ContractShape = objectShape({
	id: stringShape(),
	name: stringShape(),
	description: optionalShape(stringShape()),
	rate: quantitativeDefinitionShape,
	metadata: optionalShape(jsonShape()),
})

/**
 * Describes a `RatingDefinition`.
 *
 * @remarks
 * `shape` is any JSON value here. A `ContractShape` is recursive, so the guard reads it.
 */
export const ratingDefinitionShape: ContractShape = objectShape({
	id: stringShape(),
	name: stringShape(),
	description: optionalShape(stringShape()),
	lines: arrayShape(lineDefinitionShape),
	metadata: optionalShape(jsonShape()),
	shape: optionalShape(jsonShape()),
})

/** Describes an `Evidence` row in its JSON projection. */
export const evidenceShape: ContractShape = objectShape({
	field: optionalShape(fieldPathShape),
	label: optionalShape(stringShape()),
	comparison: optionalShape(literalShape(COMPARISONS)),
	expected: optionalShape(jsonShape()),
	actual: optionalShape(jsonShape()),
	state: optionalShape(literalShape(CHECK_STATES)),
})

/** Describes a `WorksheetFactor` in its JSON projection. */
export const worksheetFactorShape: ContractShape = objectShape({
	id: stringShape(),
	name: optionalShape(stringShape()),
	description: optionalShape(stringShape()),
	applied: booleanShape(),
	value: optionalShape(nullableShape(numberShape())),
	evidence: arrayShape(evidenceShape),
})

/** Describes a `WorksheetGroup` in its JSON projection. */
export const worksheetGroupShape: ContractShape = objectShape({
	id: stringShape(),
	name: optionalShape(stringShape()),
	description: optionalShape(stringShape()),
	applied: booleanShape(),
	value: nullableShape(numberShape()),
	factors: arrayShape(worksheetFactorShape),
})

/** Describes a `Step` in its JSON projection. */
export const worksheetStepShape: ContractShape = objectShape({
	stage: literalShape(WORKSHEET_STAGES),
	id: optionalShape(stringShape()),
	name: optionalShape(stringShape()),
	value: nullableShape(numberShape()),
	expression: optionalShape(stringShape()),
})

/** Describes a `Worksheet` in its JSON projection. */
export const worksheetShape: ContractShape = objectShape({
	id: stringShape(),
	name: stringShape(),
	aggregation: literalShape(AGGREGATIONS),
	precision: optionalShape(numberShape()),
	value: nullableShape(numberShape()),
	groups: arrayShape(worksheetGroupShape),
	steps: arrayShape(worksheetStepShape),
	trace: arrayShape(stringShape()),
	errors: arrayShape(stringShape()),
	success: booleanShape(),
	faults: arrayShape(faultShape),
	repairs: arrayShape(faultShape),
	defaulted: arrayShape(fieldPathShape),
})

/** Describes a `LineResult` in its JSON projection. */
export const lineResultShape: ContractShape = objectShape({
	id: stringShape(),
	name: stringShape(),
	amount: optionalShape(nullableShape(numberShape())),
	worksheet: worksheetShape,
})

/** Describes a `RatingResult` in its JSON projection. */
export const ratingResultShape: ContractShape = objectShape({
	lines: arrayShape(lineResultShape),
	total: optionalShape(nullableShape(numberShape())),
	success: booleanShape(),
	errors: arrayShape(stringShape()),
	faults: arrayShape(faultShape),
	repairs: arrayShape(faultShape),
	defaulted: arrayShape(fieldPathShape),
})
