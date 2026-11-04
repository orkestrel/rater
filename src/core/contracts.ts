import type { ContractInterface } from '@orkestrel/contract'
import { createContract } from '@orkestrel/contract'
import { ratingDefinitionShape, ratingResultShape } from './shapers.js'

/**
 * Publishes a `RatingDefinition` as a contract. Cross it on `is`, never `parse`.
 *
 * @remarks
 * `is` reads a nested `shape` as any JSON value and the guard reads it as a shape, so a definition
 * crossing a boundary goes through `isRatingDefinition` as well.
 */
export const ratingDefinitionContract: ContractInterface<unknown> =
	createContract(ratingDefinitionShape)

/** Publishes a `RatingResult`'s JSON projection as a contract, read through `projectRatingResult`. */
export const ratingResultContract: ContractInterface<unknown> = createContract(ratingResultShape)
