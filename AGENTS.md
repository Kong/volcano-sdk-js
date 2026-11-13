# SDK quality

- Research upstream tools before adding enforcement. Keep rules in native tool
  configuration and orchestration in standard tasks. Add custom checks only
  for requirements established tools cannot express; document that gap.
- Fix failures rather than weakening policy. Use delegated judgment for narrow,
  evidenced tool or compatibility exceptions; never grant a human review approval.
- Keep reviewer and repository-administration credentials outside ordinary
  automation.
- Keep native unit, type, build, and package checks here. Hosting owns behavioral
  acceptance scenarios and bindings; coordinate changes with `Kong/volcano-hosting`.
- Keep maintainer guidance under `maintainers/`.

## Documentation

- Public SDK docs live in `Kong/volcano-docs` under `content/sdk/js`. When
  user-facing behavior changes, open a companion PR there and link the two PRs.
