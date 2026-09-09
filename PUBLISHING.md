# Publishing the Volcano SDK to npm

See [Releasing](RELEASING.md) for the release flow, trusted-publisher setup,
verification, and recovery instructions. Release Please manages version bumps
and release tags.

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
