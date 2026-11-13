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
[TypeScript compatibility](https://docs.volcano.dev/sdk/js/typescript-compatibility). They reflect
optional fields already present in the wire schema and runtime responses.
Unapproved optionality or public-signature changes must fail the fixture.

## OpenAPI namespace compatibility

`test/fixtures/published-openapi.d.ts` independently preserves all 1,069
published namespace members from commit `8dc3d45da48957405045a88eea8cfd78de7b2468`.
Its source was `src/generated/openapi.d.ts`, SHA-256
`81c90f85ad9dd9fc2cd9327c8a1f1cf1e1530a5d49c04398368565567f6ce5fd`.
It has no imports from current generated types and is never packaged.

`src/openapi-compatibility.ts` owns the closed graph of 185 historical members
needed to preserve changed or removed declarations. The public `Components`,
`Operations`, and `Paths` aliases use that graph for historical names and forward
every other member to the current generated namespace. Newly introduced names
therefore describe the current producer. The vendored OpenAPI snapshot and
private generated clients remain complete and current.

`test/fixtures/public-openapi-compatibility.d.ts` checks every historical member
against the independent fixture and every unaffected or new member against the
current generator output. It resolves both CommonJS and ESM package exports.
`test/types/package-openapi-compatibility.ts` also checks representative consumer
object literals and expected failures. Run `pnpm test:types` and the package
checks after any snapshot or bridge change. A historical declaration preserves
source compatibility; it does not promise that an obsolete server operation
still works.

Do not refresh the historical fixture during an ordinary OpenAPI sync. Establish
any later published baseline as an explicit release decision, preserving the
previous consumer evidence. Extend the owned historical closure only when the
native comparisons show that a current generated change requires it.

The bridge and independent fixture keep their archival graphs together using
two exact file-scoped line-count exceptions. Two original neutral `unknown`
expressions remain untouched in the fixture under four property-scoped rule
exceptions. Production uses equivalent simplified expressions, checked against
the original fixture. [Quality policy](quality-policy.md#lint) describes the
native diagnostic proofs and limits of these exceptions.

`QueryBuilder` and `StorageFileApi` are each published as both a runtime value
and a type, and the query and mutation builders are thenable. Their lint
exceptions are recorded in `quality-exceptions.json` (see
[Quality policy](quality-policy.md#lint)); exception tests verify their exact
rules and source locations. These approvals do not authorize another
suppression.
