# Mutation testing

`pnpm quality` runs Stryker on changed handwritten runtime lines and the critical
runtime modules listed in `scripts/mutation-scope.mjs`. Stryker accepts file and
line selectors but does not derive them from a Git base, so the small selector
script supplies those patterns in a clean CI checkout. A weekly audit runs every
handwritten runtime module and preserves its full report.

The required PR gate uses Stryker's native 100% threshold. Stryker counts a
`Timeout` as detected and excludes `RuntimeError`, `Ignored`, and incomplete
results from its score, so 100% alone cannot prove that tests killed every valid
mutant. `scripts/check-mutation-report.mjs` requires `Killed` for every valid
mutant, permits `CompileError` for invalid mutants, and fails empty or partial
reports. The weekly audit records historical outcomes without failing on them,
but still fails if its report is empty or incomplete. The 60-second per-mutant
allowance accommodates slower CI runners; a timeout still fails the PR gate.
[Stryker's state and score
definitions](https://stryker-mutator.io/docs/mutation-testing-elements/mutant-states-and-metrics/)
explain this tool limitation.
