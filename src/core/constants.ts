import type { Decision, Effect, Eligibility, Status } from './types.js'

/** Default definition validation policy for `ProgramManager.add`. */
export const DEFAULT_RATER_VALIDATE = true

/** Eligibility severity order, most severe first — the {@link combineEligibilities} scan order. */
export const ELIGIBILITY_PRECEDENCE: readonly Eligibility[] = Object.freeze([
	'ineligible',
	'referral',
	'eligible',
])

/** Status tally precedence order — least to most resolved. */
export const STATUS_PRECEDENCE: readonly Status[] = Object.freeze([
	'ineligible',
	'referral',
	'conditional',
	'unrated',
	'eligible',
])

/** The deterministic authority decision for each eligibility. */
export const ELIGIBILITY_DECISIONS: Readonly<Record<Eligibility, Decision>> = Object.freeze({
	eligible: 'approved',
	ineligible: 'denied',
	referral: 'submitted',
})

/** The direct eligibility impact of an applied determination, by its effect. */
export const EFFECT_ELIGIBILITIES: Readonly<Record<Effect, Eligibility | undefined>> =
	Object.freeze({
		restriction: 'ineligible',
		referral: 'referral',
		condition: undefined,
		notice: undefined,
		limit: undefined,
	})

/** The reserved working-subject key a batch's aggregate projection is written under. */
export const AGGREGATE_KEY = 'aggregate'

/** The reserved working-subject key an authority's outcome projection is written under. */
export const OUTCOME_KEY = 'outcome'
