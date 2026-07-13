import type {
	ProgramDefinition,
	ProgramInterface,
	ProgramOptions,
	RaterInterface,
	RaterOptions,
} from './types.js'
import { Rater } from './Rater.js'
import { Program } from './programs/Program.js'
import { RaterError } from './errors.js'
import { isProgramDefinition } from './validators.js'

/** Create a rater orchestrator. */
export function createRater(options?: RaterOptions): RaterInterface {
	return new Rater(options)
}

/** Create and validate one compiled program. */
export function createProgram(
	definition: ProgramDefinition,
	options?: ProgramOptions,
): ProgramInterface {
	if (!isProgramDefinition(definition)) {
		throw new RaterError('DEFINITION', 'Program definition failed validation')
	}
	return new Program(definition, options)
}
