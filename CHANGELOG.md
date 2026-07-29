# Changelog

All notable changes to the Volcano SDK will be documented in this file.

## Unreleased

## [1.6.0] - 2026-07-28

### Changed

- OAuth browser callbacks now carry a short-lived, single-use authorization code.
  The SDK validates the flow state and exchanges the code before authenticated
  operations proceed, so access and refresh tokens no longer appear in callback
  URLs.
- Because callback code exchange is asynchronous, await `initialize()` or an auth
  operation before reading synchronous session accessors after a redirect.

## [1.5.0] - 2026-07-27

### Added

- **`VolcanoSystemError` — platform-layer invocation failures are now typed.** `functions.invoke` surfaces a failure that never reached your function code (a failed/provisioning deploy, gateway error, or transport failure such as a timeout/offline) as a `VolcanoSystemError` instead of a plain `Error`. Detect it with `VolcanoSystemError.is(error)` (or `error.isSystemError === true`) and read `error.status` (the blocked HTTP status, or `null` for transport failures). A running function's own non-2xx response is unchanged — it still comes back as `data` with `error` null. The class is exported from `@volcano.dev/sdk` in all build formats. Additive and backward compatible: it extends `Error` with the same message, and its extra fields are non-enumerable so `JSON.stringify(error)` is unchanged.

## [1.4.1] - 2026-07-26

### Fixed

- **Realtime `onPostgresChanges` callbacks now fire (VOL-522).** The hosting server publishes RLS-scoped Postgres changes to a per-user channel (`projectId:postgres:schema:table:userID`, so each subscriber only receives rows their RLS allows), but the SDK's server-publication router only stripped the project-id prefix and looked up `postgres:schema:table:userID` — which never matches the base `postgres:schema:table` channel the client subscribed to. Every change was silently dropped and `onPostgresChanges` never fired. The router now maps the per-user channel back to the base channel (dropping the trailing user-id segment when the exact channel isn't found). Also replaced a false-positive integration test that only asserted the subscription was created with one that asserts the change is actually delivered.

## [1.4.0] - 2026-07-25

### Fixed

- **Bundling the SDK into a function (esbuild `--bundle`) no longer fails at runtime with "handler is not a function" (VOL-505).** The entry source hand-rolled UMD/CommonJS/global exports (`module.exports = VolcanoAuth`, `window.* = ...`, AMD `define(...)`) alongside the real ES `export`s. Rollup passed those statements straight through into the ES build (`dist/index.esm.mjs`), so a stray top-level `module.exports = VolcanoAuth` survived there and, when a bundler inlined the SDK into a CommonJS output, overwrote that bundle's own `module.exports = { handler }`. The entry source is now pure ES modules; rollup generates the CJS/UMD builds (all `exports: 'named'`), and the ES builds are format-pure. A regression test (`__tests__/esm-purity.test.js`) fails if any entry source reintroduces a hand-rolled export.

### Changed

- **Changed (CommonJS default `require` shape):** `require('@volcano.dev/sdk')` now returns the module namespace `{ VolcanoAuth, QueryBuilder, StorageFileApi, isBrowser, loadRealtime, databaseConnectionString, default: VolcanoAuth }` instead of the `VolcanoAuth` class itself. Migrate `const VolcanoAuth = require('@volcano.dev/sdk')` to `const { VolcanoAuth } = require('@volcano.dev/sdk')` (or `require('@volcano.dev/sdk').default`). Named and default imports — `import { VolcanoAuth } from '@volcano.dev/sdk'` and `import VolcanoAuth from '@volcano.dev/sdk'` — are unchanged. This makes the CommonJS runtime shape match the TypeScript declarations, which already described the namespace form.
- The browser/UMD global and the documented CDN `<script>` + `new VolcanoAuth()` path are **unchanged**: the UMD build (`dist/index.js`) restores the class-shaped `window.VolcanoAuth` (and the other named globals) via a `footer` scoped to that output, so the ES build stays pure while the browser global keeps working exactly as before.

## [1.3.1] - 2026-07-24

### Fixed

- `functions.invoke(name, payload)` now sends the request body wrapped as
  `{ payload }` to match the hosting invoke API contract
  (`FunctionInvocationRequest`). Previously the raw payload was sent, leaving the
  server's `req.Payload` empty, so invoked functions received only
  `__volcano_auth` and never the caller's fields.

## [1.3.0] - 2026-07-13

### Added

- `auth.signUp({ signInWhenAllowed: true })` opt-in: when the project does not
  require email confirmation, the SDK runs the follow-up `signIn` for you so the
  response carries a live `user`/`session`. Off by default.
- `databaseConnectionString(baseConnectionString, { userId })` for connecting to
  a Volcano database from inside a function. The target database is identified by
  the globally-unique username already baked into the advertised `DATABASE_URL`,
  so the helper only sets `application_name` to select the access mode —
  `volcano_full_access` (admin, bypasses RLS) or `volcano_user_access:{userId}`
  (RLS enforced) — leaving the username, host, database and password untouched.
  Prefer it over hand-assembling `application_name`.
- Automatically adopt a managed hosted-auth (and OAuth) redirect session from the
  URL fragment. When the user is redirected back with
  `#access_token=…&refresh_token=…`, the client detects and stores the session at
  construction (and on `getUser()`/`initialize()`) and strips the tokens from the
  URL — so users are authenticated without a manual "consume redirect" step or a
  required `getUser()` call first. The redirect session fully replaces any prior
  stored session (a stale refresh token is cleared when the hand-off carries none).
- `auth.signInWithHostedAuth()` / `auth.getHostedAuthUrl()` to start the managed
  hosted-auth flow. They generate a one-time nonce (stored in `sessionStorage`)
  and pass it as `state`; the returned session's `state` is validated against it.

### Security

- Bind adopted redirect sessions to the flow this client initiated (login-CSRF /
  session-fixation defense). `signInWithHostedAuth()`/`getHostedAuthUrl()` and
  `signInWithOAuth()` now store a one-time nonce; the hosted pages and OAuth
  callback echo it back as `state`. A fragment whose `state` does not match the
  stored nonce — e.g. an unsolicited/attacker-crafted `#access_token=…` link, or a
  flow not initiated via the SDK — is **rejected** and scrubbed from the URL
  instead of being adopted. `signInWithOAuth(provider, { redirectTo })` accepts an
  optional return URL (defaults to the current page).

### Changed

- **Session-less signup (VOL-309).** `auth.signUp()` now returns
  `{ user: null, session: null, confirmationRequired, message, error }` and no
  longer issues or persists a session by default — obtain a session via a separate
  `signIn` (or the new `signInWhenAllowed` option). The response is uniform for a
  new and an already-registered email, so it cannot be used to enumerate accounts.
- Require Node.js 20 or newer for package installation and repository tooling.
- Prepare package metadata and license files for public npm and GitHub distribution.
- Bundle realtime runtime dependencies (`centrifuge` and `ws`) with the SDK package.
- Retain `test:integration` as the platform CI entry point for server-backed
  SDK integration tests.

### Removed

- Removed server-backed integration tests from this repository. End-to-end coverage
  now lives with the platform implementation.

## [1.2.1] - 2026-06-12

### Changed

- Publish refreshed package metadata for the `Kong/volcano-sdk-js` repository
  rename.

## [1.2.0] - 2026-01-27

### Added

- **Realtime SDK** - WebSocket support for real-time features
  - `VolcanoRealtime` - Main realtime client
  - `RealtimeChannel` - Channel for subscriptions
  - Database changes (Postgres) - Listen for INSERT/UPDATE/DELETE
  - Broadcast - Send messages to all subscribers
  - Presence - Track online users and their state
  - Auto-fetch for lightweight notifications
- **Request Timeouts** - 60-second default timeout on all fetch requests
- **Better Error Messages** - More descriptive error messages for file uploads

### Changed

- **OAuth Provider Validation** - SDK now only validates provider format (lowercase letters, numbers, hyphens). Backend validates which providers are supported
- **updateUser Validation** - Removed client-side validation for empty params. Backend handles all validation
- **Code Quality** - Reduced duplication with helper functions (`fetchWithTimeout`, `safeJsonParse`, `errorResult`)
- **Constants** - Extracted hardcoded values to named constants

### Fixed

- All fetch requests now have proper timeout handling via AbortController

### Notes

- OAuth validation behavior changed: SDK accepts any valid-format provider string and passes to backend
- updateUser with empty params now makes API call (backend returns validation error)

## [1.1.0] - 2026-01-13

### Added

- **Database access methods** (Lambda/Node.js only)
  - `database.createClient(event)` - Simple pattern for beginners
  - `database.createPool(options)` - Production pattern with connection pooling
  - `database.setAuthContext(client, auth)` - Set auth context on pooled connections
- **Universal SDK** - Works in browser AND Lambda/Node.js
- **Automatic Row-Level Security** - Auth context automatically injected
- **TypeScript definitions** for database methods
- **Production example** with connection pooling

### Changed

- **Package name:** `@volcano.dev/sdk`
- **Improved documentation** with clear client-side vs server-side guidance
- **Updated examples** to use simplified approach

### Migration Guide

```javascript
import { VolcanoAuth } from '@volcano.dev/sdk';

// New database capabilities (Lambda only)
const db = volcano.database.createClient(event);
```

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2024-01-06

### Added

- Initial release of Volcano Auth SDK
- Email/password authentication (signup, signin, signout)
- Automatic token refresh
- Session persistence with localStorage
- OAuth/SSO support (Google, GitHub, Microsoft, Apple)
- OAuth provider linking/unlinking
- Function invocation with auth context
- Auth state change listeners
- TypeScript type definitions
- Universal module support (UMD, ESM, CJS)
- Browser and Node.js compatibility

### Features

- Zero dependencies
- Automatic session restoration
- Retry logic for expired tokens
- Comprehensive error handling
- Full OAuth flow support
