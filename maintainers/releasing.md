# Release evidence and recovery

## Reviewed release flow

Release Please maintains the version/changelog PR. Its **Production compatibility**
check runs native checks, builds one candidate tarball and installs it in a fresh
test directory. The workflow reads Hosting's `tests/sdk-contract` using the existing
Kong app's Contents read credentials and a pinned commit, then runs those tests
against `https://api.volcano.dev`. Missing results, unexpected skips and cleanup
failures block the check.

A maintainer manually merges the PR. `publish.yml` verifies the latest successful
check, exact package hash and merged Git tree, then publishes the same tarball
through npm trusted publishing. It creates the stable GitHub release/tag and runs
a registry install smoke without publication credentials. Nothing builds after merge.
Pending merged releases hold the next Release Please version until publication.

Compatibility is checked at test time. Rerun the check before merging if production
changed. There are no cross-repository workflow calls, deployment callbacks or
published acceptance-runner package. The Hosting source pin is in the compatibility
workflow and `.github/release-tools/hosting-tests.json`; update both together.

## Setup

- Make existing `KONG_GH_APP_ID` / `KONG_GH_APP_PRIVATE_KEY` available to this
  repository. The job requests only Hosting Contents read. Release Please continues
  using `VOLCANO_APP_ID` / `VOLCANO_APP_KEY`.
- Deploy Hosting's fixture role and dedicated production test account credential.
  Fixture creation and recovery use public APIs; SDK subprocesses receive only
  scoped project credentials. Cleanup must pass before evidence is recorded.
- Create `sdk-production-compatibility` with no reviewers or wait timer and allow
  PR merge refs plus `main`. Keep `npm-production` restricted to `main` and npm's
  trusted publisher bound to `publish.yml` and that environment.
- Require **Production compatibility**, native checks and an up-to-date PR branch.
  Disable release PR auto-merge. Manual merge is the release approval.
- Run live acceptance and reconcile coverage before enabling publication. These
  draft changes have not deployed infrastructure or performed that live proof.

## Retry publication

Rerun the original PR compatibility workflow to refresh evidence; it reuses the
candidate artifact. Dispatch **Publish SDK** with the merged PR number. Recovery
uses tooling from main and never rebuilds an approved package. Missing/expired
artifacts fail closed and require release-owner resolution. An existing npm version
must match the tested tarball byte-for-byte. The registry smoke can be rerun alone.

Native checks and legacy SDK contract/live runners remain until migration coverage
is verified. Python/Ruby are outside this JavaScript pilot; CLI remains unchanged.
See Hosting's `docs/internal/guides/sdk-release-gate.md` for account setup and recovery.

## Recover from a bad release

For an application regression, first restore its previously tested application revision and dependency lock using [the public guide](../docs/versions.md).
Confirm compatibility with current server configuration and data; an SDK downgrade does not roll either back.

Record the affected versions, symptom, safe previous version, artifact digests and any required data/server remediation in the incident or release issue.
Prepare a reviewed fix as a new version. Do not republish altered bytes under an existing version.
If package deprecation, yanking, an npm tag move or another registry action is needed, preview the exact package/version/action and obtain explicit release-owner authorization first.
Keep already published artifacts and audit evidence available unless the approved response specifically requires otherwise.

Before calling recovery verified, run clean installs and the affected application/quickstart checks for both the safe version and the proposed fix. Record actual results and remaining limits; a written rollback plan is not a performed rollback.
