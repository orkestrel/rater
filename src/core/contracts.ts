import type { ContractInterface } from '@orkestrel/contract'
import { createContract } from '@orkestrel/contract'
import { ratingDefinitionShape, ratingResultShape } from './shapers.js'

/**
 * Publishes a `RatingDefinition` as a contract. Cross it on `is`, never `parse`.
 */
export const ratingDefinitionContract: ContractInterface<unknown> =
	createContract(ratingDefinitionShape)

/** Publishes a `RatingResult`'s JSON projection as a contract, read through `projectRatingResult`. */
export const ratingResultContract: ContractInterface<unknown> = createContract(ratingResultShape)
