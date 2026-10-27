# Quality policy

`pnpm quality` composes native tools in `package.json`: oxlint, TypeScript,
oxfmt, Knip, Jest, Stryker, Publint, ATTW, and pnpm audit own their checks.
`quality:checks` runs the checks shared by both supported CI runtimes;
`mutation:full` adds the complete mutation gate.

## Lint

oxlint runs its `correctness`, `suspicious`, `pedantic`, and `perf` categories
as errors with the `typescript`, `unicorn`, `oxc`, `import`, `jest`, `promise`,
`node`, `react`, `react-perf`, `jsx-a11y`, and `nextjs` plugins, so Jest suites
and the Next.js example also get their framework's rules.
`scripts/lint-policy.test.mts` pins `.oxlintrc.json`, so a rule, plugin, or
override change fails until the policy test changes with it, and lints fixtures
to show the categories and framework rules apply where that code lives,
including typed rules in the durable example's JavaScript.

Type-aware mode (`options.typeAware`) runs the typed rules, such as
`no-floating-promises`, `strict-boolean-expressions`, the `no-unsafe-*` family,
`return-await`, and `no-deprecated`, through the pinned `oxlint-tsgolint`
binary. It reads types from the compiler projects that own each file: the root
`tsconfig.json`, which references `tsconfig.tooling.json` for scripts, the Next.js
example's `tsconfig.json`, and the durable example's `jsconfig.json`. Type
tests, fixtures, and both examples import `dist`, so `pnpm lint` builds first.

Four rules are off:

- `eslint/no-underscore-dangle`: a leading underscore is how JavaScript
  consumers recognise the SDK's `@internal` members, which the published types
  strip. Renaming them would make internals look public.
- `react/react-in-jsx-scope`: it predates React 17's automatic JSX runtime,
  which Next.js uses, so it only demands unused imports.
- `eslint/require-await`: `typescript/require-await` replaces it. The base rule
  also reports an async function that returns a promise without awaiting it,
  which `return-await` requires, so the pair would make such functions
  synchronous and throw instead of reject.
- `typescript/prefer-readonly-parameter-types`: it demands deeply readonly types
  for every parameter, DOM and library types included, and no recommended or
  strict type-checked preset enables it.

The `style` and `restriction` categories are not enabled: they hold opinions and
feature bans meant to be adopted rule by rule, and enabling either raises
thousands of findings. `nursery` is not enabled because its rules are unstable.
Rules come from the enabled categories and plugins only, with oxlint's default
options. No rule is enabled or reconfigured on its own, so rules the ESLint
configuration enabled individually, such as `no-explicit-any`,
`no-non-null-assertion`, the type-assertion ban, `complexity` 5, and
`no-console`, are not carried over. Strict `tsc`, the type-aware `no-unsafe-*`
rules, 100% coverage, and the mutation gate still apply.

A finding that cannot be fixed without changing behavior, such as a loop whose
iterations must run in order, can be approved in `quality-exceptions.json` with
the rule, a declaration scope, a rationale, and evidence. Its exact
`// oxlint-disable-next-line <rule> -- <reason>` directive must be listed for
that file in `scripts/suppression-policy.mts`, once per place it is approved,
and must sit alone on its line. One directive may name several rules approved
for the same line. `scripts/quality-exceptions.test.mts` fails once a rule no
longer fires without its directive. Every other suppression comment fails the
tracked-file policy.

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
`.quality-tools/`; oxlint checks the TypeScript sources. Knip inventories their
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
`scripts/jest-completeness.cts` does the same for Jest: focused, skipped, todo,
and retried tests fail the run.
