# Contributing To Volcano SDK

Thanks for your interest in improving the Volcano JavaScript SDK.

## Local Prerequisites

- Node.js 22.23.3 from `.node-version` for development. The package supports Node.js 20 or newer.
- pnpm 10.34.1.

## Common Workflows

| Goal                            | Command                          |
| ------------------------------- | -------------------------------- |
| Install dependencies            | `pnpm install --frozen-lockfile` |
| Run the complete quality gate   | `pnpm quality`                   |
| Run linting                     | `pnpm lint`                      |
| Run unit tests                  | `pnpm test`                      |
| Regenerate API types            | `pnpm generate:openapi`          |
| Check generated types           | `pnpm check:openapi`             |
| Check public types              | `pnpm test:types`                |
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

Hosting owns live acceptance under `tests/sdk-contract`. It builds and installs
this SDK as a customer would during Staging Validation.

## Package Structure

- `src/index.ts` declares public exports; `src/volcano-auth.ts` composes the SDK client.
- `src/realtime.ts` contains the realtime WebSocket client.
- `src/next/middleware.ts` contains Next.js middleware helpers.
- TypeScript declarations are emitted from `src/**/*.ts` during `pnpm build`.
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

| Change                                    | Required updates                                                                                                                                                  |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public facade or SDK-facing wire contract | Audit all three SDKs; update each affected facade, native tests, and public language examples. Regenerate internal clients when their wire snapshot changes.      |
| Shared behavior                           | Update the canonical requirement ID and Gherkin scenario in Hosting, every affected Hosting-owned language binding, native tests, and equivalent public examples. |
| Native behavior                           | Add native regression coverage and document language-specific behavior. Update shared scenarios only if the shared behavior changes.                              |
| Public examples                           | Update equivalent examples in every affected language and verify their public API calls.                                                                          |

Explain unaffected languages and intentional language-specific differences;
method presence alone is not evidence of equivalent behavior. Start behavior
fixes with a failing native test. Never edit generated clients by hand.

Use the same branch name across affected repositories and link the companion
PRs. Keep each PR focused and use `type(scope): description` for every commit
and PR title, for example `fix(auth): preserve the current session`. Obtain clean
code and security reviews and passing required checks on the final commit before merge.
Hosting changes also require human approval.

### Roll out shared behavior

Hosting owns the canonical scenarios and all language bindings under
`tests/sdk-contract`. Its Staging Validation builds each SDK's latest `main`,
installs the distribution in a fresh environment, and exercises public behavior.
Do not copy features or acceptance runners into this repository.

Land compatible server support before an SDK version needs it in production.
Then merge the SDK implementation and native tests. Update the Hosting scenarios
and bindings in the coordinated PR, and validate those SDK main revisions in
Staging Validation. Record the Hosting and SDK commits from that run.

A maintainer manually merges the Release Please version PR; the existing release
and trusted-publisher workflows publish automatically. Hosting acceptance is
independent and does not gate SDK publication.

When the wire contract changes, first build Hosting's public bundle with
`scripts/ci/openapi-bundle.sh <output-directory>` and update the affected SDK's
`openapi/openapi.yaml` from that bundle. Then run its generator and freshness
check. The generator reads the vendored snapshot; it does not update that
snapshot from Hosting. Do not use snapshot equality as a server compatibility
gate.

From a Hosting checkout, verify shared tooling before review:

```shell
npm ci --prefix tests/sdk-contract --ignore-scripts
npm test --prefix tests/sdk-contract
go test ./scripts/ci
```

Use the installed-package runner's `inspect` mode to verify bindings without
provisioning. Staging Validation runs the live suite and requires cleanup. Record
actual live results separately from discovery or package checks.

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
