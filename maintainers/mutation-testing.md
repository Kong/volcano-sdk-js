# Mutation testing

`pnpm quality` runs Stryker against every handwritten runtime file under `src/`.
Generated files, declarations, and tests are outside the mutation target. A
local run checks the complete target; CI runs the same command in 32 required
shards on Node 22. Node 20 runs the full nonmutation quality checks and tests.
In [Node 20's full mutation run](https://github.com/Kong/volcano-sdk-js/actions/runs/35990154684/job/107602058701),
four malformed part-bound mutants abort the native `Blob.slice` implementation
with `SIGABRT` (`node::Blob::ToSlice`); the [same shard on Node 22](https://github.com/Kong/volcano-sdk-js/actions/runs/35990154684/job/107602058808)
kills all mutants. The Node 20 crash is not a useful mutant detection.
`scripts/verify-mutation-shards.mts` compares the shard mutant counts with
Stryker's unfiltered inventory, so a missing range or empty shard fails the
gate.

Stryker selects the mutants and enforces its native 100% threshold. Its score
also treats `Timeout` as detected, so `scripts/check-mutation-report.mts`
checks the JSON report separately: every valid mutant must be `Killed`, while
invalid `CompileError` mutants are accepted. Surviving, uncovered, timed-out,
ignored, crashed, pending, empty, and incomplete results fail. The 180-second
per-mutant allowance accommodates slower CI runners; reaching it still fails.
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

## Type-check directives

Stryker inserts `// @ts-nocheck` into sandboxed files so mutants cannot fail
type checking. Its default `disableTypeChecks: true` matches every script and
HTML file in the sandbox, including the `coverage/` report and the compiled
`.quality-tools/` tests that `pnpm quality` creates before mutation. Stryker 10
parses their JavaScript with Babel 8, which loads the project's Babel 7
`babel.config.js` and fails with a preprocessor warning. `stryker.config.json`
limits the preprocessor to the TypeScript sources and tests, which Stryker
parses without the project Babel configuration. Jest's Babel transform does not
type-check, so no other file needs the directive.
