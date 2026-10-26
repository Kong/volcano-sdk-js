# Mutation testing

`pnpm quality` runs Stryker against every handwritten runtime file under `src/`.
Generated files, declarations, and tests are outside the mutation target. A
local run checks the complete target; CI runs the same command in 32 required
shards on Node 22, and each shard first runs the full nonmutation quality checks
and tests.
`scripts/verify-mutation-shards.mts` compares the shard mutant counts with
Stryker's unfiltered inventory, so a missing range or empty shard fails the
gate.

Stryker selects the mutants and enforces its native 100% threshold. Its score
also treats `Timeout` as detected, so `scripts/check-mutation-report.mts`
checks the JSON report separately: every valid mutant must be `Killed`, while
invalid `CompileError` mutants are accepted. Surviving, uncovered, timed-out,
ignored, crashed, pending, empty, and incomplete results fail.

Stryker runs every test that covers a mutant, one after another, even after the
first failure. A mutant that breaks the shared fetch path (`src/fetch-lifecycle.ts`)
fails about 620 tests, and about 70 of them only after their 2- or 5-second wait
expires: about 160 seconds on a fast machine. The 600-second per-mutant
allowance keeps those slow kills from turning into timeouts on slower CI
runners. Reaching it still fails.
[Stryker's state and score definitions](https://stryker-mutator.io/docs/mutation-testing-elements/mutant-states-and-metrics/)
explain the distinction.

## Runner lifetime

[Stryker's native `maxTestRunnerReuse`](https://stryker-mutator.io/docs/stryker-js/configuration/#maxtestrunnerreuse-number)
restarts a worker after 20 mutants. An unbounded worker retained 5,675
async-local storage instances; its CPU profile was dominated by Node's
`AsyncLocalStorage._propagate` calls from Jest 30.3 Circus. Static mutants timed out
after long runs but were killed in fresh workers. Bounded reuse preserves every
mutant and the existing timeout allowance. CI retains `stryker.log` on failure
to distinguish worker behavior from test assertions.
