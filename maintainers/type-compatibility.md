# Public declaration compatibility

The migration must preserve public exports, optional properties, generic
parameters, and package formats while making response types truthful. Runtime
behavior is checked separately from declarations.

| Native option                                                                                                                              | Decision                                                                                                                                                                |
| ------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [TypeScript declarations and consumer projects](https://www.typescriptlang.org/docs/handbook/declaration-files/templates/module-d-ts.html) | Adopt. The pinned compiler emits declarations from implementation and checks CJS/ESM consumers with strict settings and library checking enabled.                       |
| [tsd type assertions](https://github.com/tsdjs/tsd)                                                                                        | Adapt its consumer-fixture pattern using the already-pinned TypeScript compiler. No second compiler or assertion dependency is needed for these structural comparisons. |
| [API Extractor reports](https://api-extractor.com/pages/overview/demo_api_report/)                                                         | Reject for this migration. A signature report detects textual API changes but does not replace checking whether existing consumer types remain valid.                   |

`test/fixtures/published-api.d.ts` freezes main commit `3ec5cf3` with exactly
nine return-type corrections approved by Sean Keever on September 24, 2026.
It is a consumer regression fixture, not a declaration shipped in the package
or an ignored-diagnostic baseline. `public-api-compatibility.d.ts` compares every
published type and class member using native TypeScript constraints. The
package consumer project also exercises generics, CJS/ESM entrypoints, and
expected failures for private implementation members.

The approved corrections are documented in
[TypeScript compatibility](../docs/typescript-compatibility.md). They reflect
optional fields already present in the wire schema and runtime responses.
Unapproved optionality or public-signature changes must fail the fixture.

The Orval generic transport assertion and two compatibility generics have
explicit human approval recorded in `quality-exceptions.json`. Native ESLint
checks reject unused directives; exception tests verify their exact rules and
source locations. These approvals do not authorize another suppression.
