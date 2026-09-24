# SDK quality

- Research upstream tools before adding enforcement. Keep rules in native tool
  configuration and orchestration in standard tasks. Add custom checks only
  for requirements established tools cannot express; document that gap.
- Fix failures rather than weakening policy. Exceptions require explicit human
  approval; never approve a quality-policy change on a human reviewer's behalf.
- Keep reviewer and repository-administration credentials outside ordinary
  automation.
- Preserve shared behavioral scenarios and coordinate contract changes with
  `Kong/volcano-hosting` and the other SDKs.
- Keep maintainer guidance under `maintainers/`; `docs/` is published.

## Documentation

- Update the matching public documentation in the same PR when user-facing
  behavior changes.
