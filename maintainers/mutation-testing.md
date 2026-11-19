# Mutation testing

`pnpm quality` runs Stryker against every handwritten runtime file under `src/`.
Generated files, declarations, and tests are outside the mutation target. A
local run checks the complete target. CI splits the same gate: one job runs the
nonmutation quality checks and tests, and 48 required shards run
`pnpm mutation:full` on Node 22.

Pull requests and merge groups set `MUTATION_BASE` to their base commit, so
Stryker mutates only the handwritten runtime files the change adds or modifies.
A change that touches none, such as a test, docs, or dependency change, passes
without Stryker. Pushes to `main` mutate the complete target; a test change that
lets a mutant in unchanged code survive fails there. Run the pull request scope
locally with `MUTATION_BASE=origin/main pnpm mutation:full`.

`scripts/verify-mutation-shards.mts` compares the complete target's shard
mutant counts with Stryker's unfiltered inventory, so a missing range or empty
shard fails the gate. It counts mutants with a no-op test runner, because
Stryker instruments before its dry run.

Stryker selects the mutants and enforces its native 100% threshold. Its score
also treats `Timeout` as detected, so `scripts/check-mutation-report.mts`
checks the JSON report separately: every valid mutant must be `Killed`, while
invalid `CompileError` mutants are accepted. Surviving, uncovered, timed-out,
ignored, crashed, pending, empty, and incomplete results fail.
[Stryker's state and score definitions](https://stryker-mutator.io/docs/mutation-testing-elements/mutant-states-and-metrics/)
explain the distinction.

Stryker runs every test that covers a mutant, one after another, even after the
first failure. A mutant that breaks the shared fetch path (`src/fetch-lifecycle.ts`)
fails about 620 tests, and about 70 of them only after their 2- or 5-second wait
expires: about 160 seconds on a fast machine. The 600-second per-mutant
allowance keeps those slow kills from turning into timeouts on slower CI
runners. Reaching it still fails.

## Shard balance

Each shard job has a 90-minute limit, so the slowest shard sets how long the
gate takes. Mutants differ widely in cost, and line counts do not predict it:
a mutant on a shared path such as `src/fetch-lifecycle.ts` reruns hundreds of
tests, and a mutant that breaks one fails many of them after a timeout.
Stryker's own estimates come from the dry run, so they miss that too.

`scripts/mutation-scope.mts` therefore splits the target by measured cost, from
`mutation-costs.json`: worker milliseconds by source file and by the line each
mutant starts on. Every shard job computes the same split from the sources and
that table. A file of type declarations costs nothing, because Stryker finds no
mutants in it. Code the table has no timings for, a new file or a new chunk of
a measured one, costs the measured average per line. Without a table, every
line costs 1.

Stryker runs each mutant through `timed-jest`
(`scripts/mutation-timing-runner.mts`), which wraps the Jest runner and times
each mutant inside the worker that runs it. A reporter cannot: Stryker reports
results without start times, from several workers at once. Each worker appends
its timings to `reports/mutation-timing/<pid>.jsonl`, and the shard log shows
every mutant slower than 30 seconds as it finishes:

```text
Slow mutant src/user-agent.ts:107 ObjectLiteral 48.2s, 727 tests, killed
```

knip's Stryker plugin reads the `testRunner` name as a package,
`@stryker-mutator/timed-jest-runner`, so `knip.json` ignores that name.

After Stryker exits, `scripts/run-mutation.mts` prints the slowest mutants and
the costliest files. The mutation step times out at 85 minutes, before the
job's 90, so a shard that is too slow still uploads the timings it measured as
`mutation-timing-node-22-shard-<n>`. To refresh the table, download those
artifacts from a full run on `main`, then run:

```sh
pnpm build:tooling
node .quality-tools/update-mutation-costs.mjs path/to/mutation-timing-node-22-shard-*
```

Each file the timings cover replaces that file's whole entry, and files they do
not cover keep their costs. Prefer a run where every shard finished: a shard
that timed out measured only part of its files. Refresh the table when the
slowest shard grows well past the others.

## Runner lifetime

[Stryker's native `maxTestRunnerReuse`](https://stryker-mutator.io/docs/stryker-js/configuration/#maxtestrunnerreuse-number)
restarts a worker after 20 mutants. An unbounded worker retained 5,675
async-local storage instances; its CPU profile was dominated by Node's
`AsyncLocalStorage._propagate` calls from Jest 30.3 Circus. Static mutants timed out
after long runs but were killed in fresh workers. Bounded reuse preserves every
mutant and the existing timeout allowance. CI retains `stryker.log` on failure
to distinguish worker behavior from test assertions.

A reused worker also keeps the timers a test file started. A test that fails
under one mutant can abandon an SDK request on its 60-second timeout. When the
timeout fires during a later mutant's run, that mutant reports a `RuntimeError`
instead of `Killed`. Like jsdom, the Node test environment
(`scripts/node-environment.cts`) stops a file's timers when the file finishes.
Restarting workers after every mutant would also prevent this, but it doubles
the run time.
