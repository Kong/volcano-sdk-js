# Changelog

All notable changes to the Volcano SDK will be documented in this file.

## Unreleased

### Added

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
