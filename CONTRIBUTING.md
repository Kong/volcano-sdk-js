# Contributing To Volcano SDK

Thanks for your interest in improving the Volcano JavaScript SDK.

## Local Prerequisites

- Node.js 20 or newer.
- pnpm 10.34.1.

## Common Workflows

| Goal                   | Command                          |
| ---------------------- | -------------------------------- |
| Install dependencies   | `pnpm install --frozen-lockfile` |
| Run linting            | `pnpm lint`                      |
| Run unit tests         | `pnpm test`                      |
| Build the package      | `pnpm build`                     |
| Check package metadata | `pnpm test:package`              |

The SDK repository keeps its local workflow focused on client behavior,
packaging, and documentation. Server-backed end-to-end coverage lives with the
platform implementation.

The `test:integration` script is intentionally retained as a stable entry point
for platform CI jobs that check out this repository while running those
server-backed SDK integration tests.

## Package Structure

- `src/index.js` contains the main SDK client.
- `src/realtime.js` contains the realtime WebSocket client.
- `src/next/middleware.js` contains Next.js middleware helpers.
- `src/*.d.ts` and `src/next/*.d.ts` contain checked-in TypeScript
  declarations.
- `docs/` contains user-facing guides.
- `examples/nextjs-notes-app/` contains the Next.js example app.

The package publishes built files from `dist/`. Do not hand-edit generated
files in `dist/`; run `pnpm build` to refresh package output.

## Pull Requests

- Use draft PRs for work in progress.
- Use Conventional Commits (`feat:`, `fix:`, `docs:`, `chore:`, ...).
- Keep PRs focused to one bug fix, feature, or cohesive documentation update.
- Include tests for behavior changes.
- Update docs or examples when changing user-facing APIs.
- Run `pnpm lint`, `pnpm test`, and `pnpm build` before pushing when code
  changes are included.

Security vulnerabilities should not be reported through public issues or pull
requests. Follow `SECURITY.md` instead.

## Contributor License Agreement

Kong may require external contributors to sign a contributor license agreement
before their changes can be merged. When the repository CLA check is enabled,
the pull request check will provide signing instructions.
