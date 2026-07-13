import type { Decision, Effect, Eligibility, Status } from './types.js'

/** Default definition validation policy for manager adds. */
export const DEFAULT_RATER_VALIDATE = true

/** Eligibility severity order, most severe first. */
export const ELIGIBILITY_PRECEDENCE: readonly Eligibility[] = Object.freeze([
	'ineligible',
	'referral',
	'eligible',
])

/** Status tally order. */
export const STATUS_PRECEDENCE: readonly Status[] = Object.freeze([
	'ineligible',
	'referral',
	'conditional',
	'unrated',
	'eligible',
])

/** Deterministic decisions by eligibility. */
export const ELIGIBILITY_DECISIONS: Readonly<Record<Eligibility, Decision>> = Object.freeze({
	eligible: 'approved',
	ineligible: 'denied',
	referral: 'submitted',
})

/** Direct eligibility impact by determination effect. */
export const EFFECT_ELIGIBILITIES: Readonly<Record<Effect, Eligibility | undefined>> =
	Object.freeze({
		restriction: 'ineligible',
		referral: 'referral',
		condition: undefined,
		notice: undefined,
		limit: undefined,
	})

/** Reserved working-record key for batch projections. */
export const AGGREGATE_KEY = 'aggregate'

/** Reserved working-record key for authority outcome projections. */
export const OUTCOME_KEY = 'outcome'
