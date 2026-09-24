# Quality policy

`pnpm quality` composes native tools in `package.json`: ESLint, TypeScript,
Prettier, Knip, Jest, Stryker, Publint, ATTW, and pnpm audit own their checks.
`quality:checks` runs the checks shared by both supported CI runtimes;
`mutation:full` adds the complete mutation gate.

## Protecting the task graph

A valid task can silently stop enforcing quality if its command becomes
`node --version` or drops a required subtask. [pnpm run](https://pnpm.io/10.x/cli/run)
executes the manifest's commands; it does not know which checks this SDK requires.
[actionlint](https://github.com/rhysd/actionlint) validates workflow syntax,
expressions, and shell commands, but cannot establish that `pnpm quality` still
invokes the SDK's required tools. A task runner would have the same policy gap.

`scripts/quality-policy.test.mjs` therefore compares the canonical task graph
and each required leaf command with the reviewed commands. Its negative test
replaces every command in turn and requires rejection. CI invokes this test
directly in the required Quality policy job, so deleting it from a package task
cannot disable it. This checks orchestration integrity; it does not reimplement
linting, typing, coverage, or package validation.

Change the manifest and assertions together when a reviewed policy change is
intentional. These files cannot protect themselves against a coordinated edit;
Codex review and repository merge protection remain separate controls.

## Toolchain pins

[setup-node](https://github.com/actions/setup-node) reads `.node-version` for
Node 22 development and quality jobs. The compatibility job pins Node 20
separately; the package's `engines` range remains `>=20`. Release jobs retain
Node 24 and pin npm 11. Go is only used to run actionlint. Update these exact
patch versions from the [Node release index](https://nodejs.org/dist/index.json),
[npm registry](https://registry.npmjs.org/npm), and
[Go release history](https://go.dev/doc/devel/release), then rerun quality.
