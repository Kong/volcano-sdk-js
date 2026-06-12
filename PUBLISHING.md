# Publishing the Volcano SDK to npm

The package is published as `@volcano.dev/sdk`. Do not rename it without a
coordinated package migration.

## Publishing Model

Publishing uses npm trusted publishing from GitHub Actions. The workflow
authenticates to npm with GitHub OIDC, so no long-lived `NPM_TOKEN` secret is
required for normal package publishing.

The workflow is `.github/workflows/publish.yml`.

- Merges to `main` publish the `package.json` version to the `latest` dist-tag.
- Published versions must use stable `MAJOR.MINOR.PATCH` SemVer, such as
  `1.2.0`.
- Publishing uses the `npm-production` GitHub environment so repository admins
  can add required reviewers before public release.

## npm Trusted Publisher Setup

Configure the package on npmjs.com:

- Package: `@volcano.dev/sdk`
- Publisher: GitHub Actions
- Organization or user: `Kong`
- Repository: `volcano-sdk-js`
- Workflow filename: `publish.yml`
- Package environment: `npm-production`
- Allowed action: `npm publish`

The npm package environment must match the GitHub environment used by the
publishing job.

After trusted publishing works, set npm package publishing access to require 2FA
and disallow traditional token publishing where possible.

## Stable Releases

To publish a stable release:

1. Update `package.json` to the target stable SemVer version.
2. Run local verification:

   ```bash
   pnpm install --frozen-lockfile
   pnpm lint
   pnpm test
   pnpm build
   pnpm test:package
   npm pack --dry-run
   ```

3. Merge the version change to `main`.
4. Wait for the `Publish SDK` workflow to publish the version with the `latest`
   dist-tag.

The publish workflow verifies that `package.json` uses stable
`MAJOR.MINOR.PATCH` SemVer. For example, `"version": "1.2.0"` is valid, while
`"version": "1.2.0-beta.1"` is not.

Optionally create a matching Git tag after the publish succeeds if source
history should retain a release marker:

```bash
git tag v1.2.0
git push origin v1.2.0
```

## One-Time Dist-Tag Repair

If the npm `latest` dist-tag points at the wrong version, a maintainer with npm
package access can repair it after publishing the intended version:

```bash
npm dist-tag add @volcano.dev/sdk@1.2.0 latest
npm dist-tag ls @volcano.dev/sdk
```

Use this only for dist-tag maintenance. Normal publishing should happen through
the trusted publishing workflow.

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

## Troubleshooting

If npm reports an authentication error, check that:

- npm trusted publishing is configured for `Kong/volcano-sdk-js`.
- The configured workflow filename is exactly `publish.yml`.
- The workflow has `id-token: write`.
- The job runs on a GitHub-hosted runner.
- The package repository URL in `package.json` points to
  `https://github.com/Kong/volcano-sdk-js.git`.

If publishing fails because the package version already exists on npm, update
`package.json` to the next stable SemVer version and merge that change to
`main`.
