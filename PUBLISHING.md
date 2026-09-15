# Publishing the Volcano SDK to npm

Release Please creates version/changelog PRs and enables auto-merge after required
CI passes. Merging a release PR creates a GitHub release, which triggers
[publish.yml](.github/workflows/publish.yml) to test, build, and publish
`@volcano.dev/sdk` to npm using trusted publishing in `npm-production`.

Re-run the original failed release workflow to retry. Never move released tags.

## @volcano.dev/durable-runtime

`packages/durable-runtime` is published separately, by
[publish-durable-runtime.yml](.github/workflows/publish-durable-runtime.yml) on
`workflow_dispatch`. It is a pass-through whose only content is the version
range of the runtime it depends on, so it changes with that range rather than
with the SDK and has no place on the SDK's release train. Bump its version,
merge, then dispatch the workflow against `main` with the same version.

It needs its own trusted publisher on npm, configured once for the package
before the first release.

## Package Contents

The package includes package metadata plus the files listed in `package.json`:

- `dist`
- `README.md`
- `LICENSE`
- `CHANGELOG.md`
- `CONTRIBUTING.md`
- `SECURITY.md`

## CDN Links

After publishing, the package is available via CDN:

```html
<script src="https://unpkg.com/@volcano.dev/sdk@latest/dist/index.js"></script>
<script src="https://cdn.jsdelivr.net/npm/@volcano.dev/sdk@latest/dist/index.js"></script>
```
