# Quality policy

`pnpm quality` composes native tools in `package.json`: ESLint, TypeScript,
Prettier, Knip, Jest, Stryker, Publint, ATTW, and pnpm audit own their checks.
`quality:checks` runs the checks shared by both supported CI runtimes;
`mutation:full` adds the complete mutation gate.

## Dependency audit exceptions

The audit requires zero advisories at every severity. An advisory with no
patched release can be approved in `quality-exceptions.json` with rule
`pnpm audit` and scope `<GHSA>:<package>@<version>`; the audit then drops that
one advisory and its count. pnpm's `auditConfig.ignoreGhsas` cannot do this: it
hides the advisory but keeps it in the severity counts. The audit fails while an
approval names an advisory pnpm no longer reports, so remove it once a fix ships.

## Protecting the task graph

A valid task can silently stop enforcing quality if its command becomes
`node --version` or drops a required subtask. [pnpm run](https://pnpm.io/10.x/cli/run)
executes the manifest's commands; it does not know which checks this SDK requires.
[actionlint](https://github.com/rhysd/actionlint) validates workflow syntax,
expressions, and shell commands, but cannot establish that `pnpm quality` still
invokes the SDK's required tools. A task runner would have the same policy gap.

`scripts/quality-policy.test.mts` therefore compares the canonical task graph
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
Node 22 development and quality jobs; the package's `engines` range is `>=22`,
and CI tests that pinned Node 22 patch. Release jobs retain Node 24 and pin
npm 11. Go is only used to run actionlint. Update these exact patch versions
from the [Node release index](https://nodejs.org/dist/index.json),
[npm registry](https://registry.npmjs.org/npm), and
[Go release history](https://go.dev/doc/devel/release), then rerun quality.

## Typed development tooling

`tsconfig.tooling.json` applies the SDK's strict compiler flags to every maintained
script and native Node test. `pnpm build:tooling` emits ordinary JavaScript into
`.quality-tools/`; ESLint checks the TypeScript sources. Knip inventories their
source entrypoints, and the tracked-file policy rejects untyped scripts or tests.
Jest's two CJS loader files only load the compiled environment adapters.

Use the existing compiler and [Node test runner](https://nodejs.org/docs/latest-v22.x/api/test.html):
[TypeScript rewrites relative extensions](https://www.typescriptlang.org/tsconfig/rewriteRelativeImportExtensions.html)
from `.mts`/`.cts` to `.mjs`/`.cjs`. Keeping the compiler output beside `scripts/`
preserves root-relative asset paths. Standalone package, test, and mutation tasks
build their prerequisites; CI compiles and invokes the policy test independently
of the task graph it checks. The npm package's explicit file list excludes tooling.

[Node's built-in type stripping](https://nodejs.org/api/typescript.html) is off
by default before Node 22.18, which `engines` still allows, and does not
type-check. [tsx](https://tsx.hirok.io/typescript) would still require a separate type check and an additional runtime loader.
Compiler emission keeps execution on the same ordinary Node module system used
by consumers. No type assertions or typing suppressions are needed at the
JSON report, child-process, HTTP, or test-runner boundaries.

The [native reporter API](https://nodejs.org/docs/latest-v22.x/api/test.html#custom-reporters)
supplies execution events, but Node 22 has no fail-on-skip or fail-on-empty
switch. Node even reports an empty test file as a passing case named after its
path; Node 22 accepts an unmatched test glob. `scripts/node-completeness.mts`
rejects those outcomes and skipped or pending cases while the native TAP reporter
formats results. Negative suites prove these failures.
ESLint rejects empty test files, focus and skip syntax before execution, including
native test options.
