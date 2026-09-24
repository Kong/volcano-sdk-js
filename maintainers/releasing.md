# Release evidence and recovery

The checked-in release and publish workflows own versioning and publication.
This checklist does not authorize a release, a registry mutation or an environment approval.

## Reviewed release flow

Release Please maintains the version/changelog PR; maintainers merge it deliberately.
Ordinary changes can accumulate. Client-only fixes use the same release path.
Update `backend-requirements.json` when any accumulated SDK change needs newer
Hosting behavior. Its release and source SHA must identify an actually completed
production deployment; a hotfix label cannot waive that requirement.

The current PR head runs native checks and Hosting-owned staging acceptance using
an installed candidate tarball. A head update invalidates that evidence. After
merge, `publish.yml` builds the final package once and runs full Hosting Staging
Validation for those exact bytes. It then requires declared production readiness,
rechecks it immediately before npm publication, creates the stable GitHub release,
and checks registry installation in a job without publishing credentials.

This is staging acceptance plus declared production readiness, not direct testing
against production. The latest production attempt must be successful and preserve
the declared required source. A later failed, cancelled, or unfinished rollout
blocks release. The deployment records do not attest current out-of-band settings
or flags, and the final read does not lock out a rollout starting afterward.

The original candidate artifact contains its source SHA, build run, version,
backend declaration and SHA-256. Recovery uses `workflow_dispatch` with that
original merged build run ID, repeats full Hosting validation, and reuses its
files. No recovery rebuild occurs. A newer staging batch (including a queued batch)
invalidates old evidence conservatively and requires another full validation. Expired/missing artifacts fail closed. If npm
already contains the version, its tarball must match byte-for-byte.

Pending merged Release Please PRs remain `autorelease: pending` until publication;
new release PRs wait. After publication the SDK sets `autorelease: tagged`, creates
the tag at the tested merge SHA and refreshes Release Please. The pinned Release
Please library is exercised through two version/changelog cycles in release-tool
tests, including an intervening held candidate. No SDK version allocator is added.

Before enabling the pilot, configure Hosting's dedicated staging fixture account,
deploy the reviewed read-only production evidence role and staging fixture role,
and verify GitHub App grants in both repositories. The SDK app needs Hosting
Actions write and Contents read. Hosting needs SDK Actions/Contents/Pull requests
read. Keep npm trusted publishing on this repository's `publish.yml` and
`npm-production`; restrict that environment to main. Restrict the new
`sdk-release-validation` environment to main and the exact Release Please branch.
Require `SDK Release Gate` and native quality checks
on release PRs. Confirm the real OIDC subjects before enabling the IAM trust.

The workflow supports main releases. If a fix must exclude unreleased features,
prepare a maintenance branch and review its release workflow/environment trust;
do not introduce a bypass. Native checks and the legacy contract/live runners
remain while Hosting validates migration coverage. Python/Ruby are a later pilot.

See Hosting's `docs/internal/guides/sdk-release-gate.md` for the rollout checklist,
credential ownership, fixture recovery, coverage limits and unexecuted live proof.

## Recover from a bad release

For an application regression, first restore its previously tested application revision and dependency lock using [the public guide](../docs/versions.md).
Confirm compatibility with current server configuration and data; an SDK downgrade does not roll either back.

Record the affected versions, symptom, safe previous version, artifact digests and any required data/server remediation in the incident or release issue.
Prepare a reviewed fix as a new version. Do not republish altered bytes under an existing version.
If package deprecation, yanking, an npm tag move or another registry action is needed, preview the exact package/version/action and obtain explicit release-owner authorization first.
Keep already published artifacts and audit evidence available unless the approved response specifically requires otherwise.

Before calling recovery verified, run clean installs and the affected application/quickstart checks for both the safe version and the proposed fix. Record actual results and remaining limits; a written rollback plan is not a performed rollback.
