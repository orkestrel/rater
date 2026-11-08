Each item is a chunk that reaches green before the next. An item keeps its number for life: a closed
item leaves this file and its number is never reused, so a commit message citing an item by number
stays true.

- **1.** After the shared standing-proof observation mechanism lands in `@orkestrel/test`, adopt it for `buildRaterContractCases` in `tests/setup.ts` and `tests/src/core/contracts.test.ts`. Keep worksheet production, lookup and check failures, hinted faults, and repair scenarios local.
- **2.** At the next package visit, reconcile exceptional-object construction in `tests/src/core/validators.test.ts` with its existing `createHostileValues` adoption from `@orkestrel/test`. Remove only remaining generic duplication with matching acceptance and identity expectations; retain scalar refusal data and targeted cyclic metadata controls.
