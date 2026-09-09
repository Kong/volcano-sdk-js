# Publishing the Volcano SDK to npm

Release Please creates version/changelog PRs and enables auto-merge after required
CI passes. Merging a release PR creates a GitHub release, which triggers
[publish.yml](.github/workflows/publish.yml) to test, build, and publish
`@volcano.dev/sdk` to npm using trusted publishing in `npm-production`.

Re-run the original failed release workflow to retry. Never move released tags.

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
