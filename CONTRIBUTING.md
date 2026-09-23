# Contributing To Volcano SDK

Thanks for your interest in improving the Volcano JavaScript SDK.

## Local Prerequisites

- Node.js 20 or newer.
- pnpm 10.34.1.

## Common Workflows

| Goal                            | Command                          |
| ------------------------------- | -------------------------------- |
| Install dependencies            | `pnpm install --frozen-lockfile` |
| Run linting                     | `pnpm lint`                      |
| Run unit tests                  | `pnpm test`                      |
| Regenerate API types            | `pnpm generate:openapi`          |
| Check generated types           | `pnpm check:openapi`             |
| Check public types              | `pnpm test:types`                |
| Discover contract lane          | `pnpm test:contract --listTests` |
| Build the package               | `pnpm build`                     |
| Check packed metadata and types | `pnpm test:package`              |

The SDK repository keeps its local workflow focused on client behavior,
packaging, and documentation. Server-backed end-to-end coverage lives with the
platform implementation.

`pnpm test:package` packs with pnpm, then runs Publint and
[Are the Types Wrong](https://github.com/arethetypeswrong/arethetypeswrong.github.io/blob/main/packages/cli/README.md)
against the same tarball. ATTW's native `node16` profile checks CommonJS, ESM,
and bundler resolution through the package export map. Legacy Node 10 resolution
is outside the SDK's Node 20+ support; no diagnostic rules or entrypoints are ignored.
`pnpm test:quickstart` also installs that tarball in an isolated consumer and
checks realtime imports and the documented quickstart.

The `test:integration` script is intentionally retained as a stable entry point
for platform CI jobs that check out this repository while running those
server-backed SDK integration tests.

## Package Structure

- `src/index.js` contains the main SDK client.
- `src/realtime.js` contains the realtime WebSocket client.
- `src/next/middleware.ts` contains Next.js middleware helpers.
- `src/*.d.ts` and `src/next/*.d.ts` contain checked-in TypeScript
  declarations.
- `openapi/openapi.yaml` is the vendored public API contract.
- `src/generated/openapi.d.ts` is generated from that contract and must not be
  edited by hand.
- `docs/` contains user-facing guides.
- `examples/nextjs-notes-app/` contains the Next.js example app.

The package publishes built files from `dist/`. Do not hand-edit generated
files in `dist/`; run `pnpm build` to refresh package output.

## Coordinate SDK changes

Follow the [Hosting SDK contract workflow](https://github.com/Kong/volcano-hosting/blob/main/.agents/skills/sdk-contract-coordination/SKILL.md).
Hosting owns the wire contract in `api/openapi.yaml` and the behavioral contract
in `tests/sdk-contract`. JavaScript, Python, and Ruby expose that behavior through
handwritten, idiomatic facades; generated transport code stays internal.

Classify the impact in the PR before changing the contract:

| Change                                    | Required updates                                                                                                                                                               |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Public facade or SDK-facing wire contract | Audit all three SDKs; update each affected facade, native tests, and public language examples. Regenerate internal clients when their wire snapshot changes.                   |
| Shared behavior                           | Update the canonical requirement ID and Gherkin scenario in Hosting, every affected language binding, checked-in feature copies, native tests, and equivalent public examples. |
| Native behavior                           | Add native regression coverage and document language-specific behavior. Update shared scenarios only if the shared behavior changes.                                           |
| Public examples                           | Update equivalent examples in every affected language and verify their public API calls.                                                                                       |

Explain unaffected languages and intentional language-specific differences;
method presence alone is not evidence of equivalent behavior. Start behavior
fixes with a failing native test. Never edit generated clients by hand.

Use the same branch name across affected repositories and link the companion
PRs. Keep each PR focused and use `type(scope): description` for every commit
and PR title, for example `fix(auth): preserve the current session`. Obtain clean
code and security reviews and passing required checks on the final commit before merge.
Hosting changes also require human approval.

### Roll out shared scenarios

Before merging SDK code, prove it remains compatible with the currently deployed
Hosting contract. Staging Gherkin does not keep runtime code dormant, and the
existing release automation can publish a main-derived package. If new server
support is required, first land a backward-compatible Hosting prerequisite or
keep the SDK PR in draft until an explicitly reviewed release/rollout plan is in
place. Do not merge an incompatible implementation merely because its scenario
is staged.

1. Change the canonical scenario in Hosting once. Copy its bytes into each SDK
   and implement its native binding.
2. Stage new scenarios under `features/staged` while Hosting main still uses the
   older contract. Do not activate scenarios ahead of Hosting.
3. Merge the required SDK changes before validating and merging the coordinated
   Hosting PR. Record the Hosting and SDK revisions used by acceptance.
4. After Hosting merges, promote those unchanged files into `features/contract`
   and run the default binding-discovery checks. Do not keep duplicate active
   and staged copies.

Hosting CI checks out each SDK's latest `main` and records the actual tested
SHAs. Do not introduce a checked-in pin manifest or assume a rerun uses the same
SDK revisions. Generate and verify each SDK against its own OpenAPI snapshot;
compatibility with the server is established by integration tests.

When the wire contract changes, first build Hosting's public bundle with
`scripts/ci/openapi-bundle.sh <output-directory>` and update the affected SDK's
`openapi/openapi.yaml` from that bundle. Then run its generator and freshness
check. The generator reads the vendored snapshot; it does not update that
snapshot from Hosting. Do not use snapshot equality as a server compatibility
gate.

From a Hosting checkout, verify shared tooling and copies before review:

```shell
npm ci --prefix tests/sdk-contract --ignore-scripts
npm test --prefix tests/sdk-contract
bash scripts/ci/run-sdk-contract-tests_test.sh
bash scripts/ci/run-sdk-contract-tests.sh --validate-features-only \
  /path/to/volcano-sdk-js /path/to/volcano-sdk-python /path/to/volcano-sdk-ruby
```

Without `--validate-features-only`, the runner creates and deletes fixtures.
Use an approved disposable environment for live runs; staging and production
require explicit authorization. Ordinary Cloud E2E remains post-merge. Do not
infer live acceptance from tooling checks or a nonblocking staging result.

### Documentation and release boundaries

`docs/` is published to the developer documentation site. Put user-facing
examples there and maintainer instructions in this file or beside the code.
Keep equivalent language examples current in the same coordinated change.
Package checks validate artifacts; they do not authorize publication. Treat
registry-installed quickstarts and release approval as separate release work.

## Pull Requests

- Use draft PRs for work in progress.
- Use scoped Conventional Commits for commits and PR titles, such as
  `feat(storage): add upload progress` or `docs(auth): clarify session adoption`.
- Keep PRs focused to one bug fix, feature, or cohesive documentation update.
- Include tests for behavior changes.
- Update docs or examples when changing user-facing APIs.
- Run `pnpm check:openapi`, `pnpm lint`, `pnpm test`, and `pnpm build` before
  pushing when code changes are included.

Security vulnerabilities should not be reported through public issues or pull
requests. Follow `SECURITY.md` instead.

## Contributor License Agreement

Kong may require external contributors to sign a contributor license agreement
before their changes can be merged. When the repository CLA check is enabled,
the pull request check will provide signing instructions.
