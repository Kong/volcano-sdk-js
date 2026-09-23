---
title: 'Project locks'
description: 'Project locks are renewable leases for backend coordination, keeping one holder at a time on work like a migration or a scheduled rollup.'
---

Project locks are renewable leases for backend coordination. They require a
service-role key with `locks.manage` or full access.

```javascript
import { VolcanoAuth } from '@volcano.dev/sdk';

const volcano = new VolcanoAuth({
  apiUrl: process.env.VOLCANO_API_URL,
  anonKey: process.env.ANON_KEY,
  accessToken: process.env.SERVICE_ROLE_KEY,
});

const result = await volcano.locks.withLock('daily-rollup', { ttl: 30 }, async ({ signal }) =>
  runRollup({ signal }),
);

if (result.error) throw result.error;
if (!result.acquired) console.log('another function is leader');
```

`withLock` renews near one-third of the TTL and releases in `finally`.
Contention returns `{ acquired: false, error: null }`, whether another holder
owns the lock or a previous lease of your own has lapsed. If renewal fails, the
callback signal is aborted; callbacks must honor it. A stalled renewal also
aborts the signal when the locally measured TTL elapses.

For example, a scheduled function can skip work when another invocation is
already the leader:

```javascript
export const handler = async () => {
  const result = await volcano.locks.withLock(
    'scheduled-cleanup',
    { ttl: 60 },
    async ({ signal }) => {
      const deleted = await deleteExpiredRecords({ signal });
      return { deleted };
    },
  );

  if (result.error) throw result.error;
  return {
    statusCode: 200,
    body: JSON.stringify(
      result.acquired ? { leader: true, ...result.data } : { leader: false, skipped: true },
    ),
  };
};
```

For direct control:

```javascript
const acquired = await volcano.locks.acquire('migration', { ttl: 10 });
if (!acquired.acquired || acquired.error) return acquired;

const renewal = new AbortController();
try {
  const renewed = await volcano.locks.renew('migration', acquired.lease, {
    ttl: 10,
    signal: renewal.signal,
  });
  if (renewed.error) throw renewed.error;
} finally {
  await volcano.locks.release('migration', acquired.lease);
}
```

Abort `renewal` to cancel the in-flight renewal request. Cancellation is
reported through `renewed.error`; the existing lease remains unchanged.

## Recover an uncertain acquisition

Acquisition retries a transport failure or HTTP 503 once with the original key,
TTL, ownership token, request ID, and credential. Other HTTP errors are returned
without retrying acquisition. Generate and retain IDs before acquiring if you need
to recover after both attempts fail:

```javascript
const token = crypto.randomUUID();
const requestId = crypto.randomUUID();
const result = await volcano.locks.acquire('migration', { ttl: 30, token, requestId });
```

Reuse those IDs for the same uncertain acquisition. Use a new ownership token
for a new lease after release or expiry. Keep the token private. Every lock
method accepts `requestId`; `withLock` forwards its `token` and `requestId` only
to acquisition, and generates separate request IDs for renewal and release.

If the server returns an invalid success response, the SDK attempts to release
the acquired lock using the credential that acquired it. If cleanup fails, the
returned error's `lease` contains the ownership token and its `cause` is the
cleanup failure. Retain that token to retry release, including when using
`withLock`.

## Fencing token

`lease.fencingToken` rises whenever the lock changes hands and stays the same
across renewals. Pass it to whatever the lock protects and reject writes carrying
a lower token than the highest already seen:

```javascript
const { rowCount } = await sql`
  update rollup_state
  set    cursor = ${next}, fencing_token = ${lease.fencingToken}
  where  id = ${id} and fencing_token <= ${lease.fencingToken}
`;
if (rowCount === 0) throw new Error('another holder took over');
```

A lease cannot stop a holder whose renewal is delayed past `expiresAt`, so this
check is what keeps its late writes out.

## Inspect and recover

```javascript
const { state } = await volcano.locks.get('migration');
// { held: true, expiresAt: '2026-07-20T14:00:10Z', fencingToken: 1784684410123 }

await volcano.locks.forceRelease('migration');
```

`get` requires no lock token, so monitoring code can read the holder.
`held: false` means an acquire would succeed now.

`forceRelease` drops the lease whatever token holds it, for a holder that died
without releasing. It breaks mutual exclusion by itself — the old holder keeps
working until its next renewal fails — so use it only where the protected
resource checks the fencing token.

Keys may contain letters, digits, `.`, `_`, `:`, and `-` and are limited to 128
characters. TTL is 5 seconds through 90 days. An unreleased lease expires after
its requested TTL. Renewing sets the new expiry outright instead of adding to the
current one, so a smaller TTL shortens the lease. Renewals cannot move an
acquisition's absolute 90-day deadline; acquire a new lease after that point.
Keep the returned lease private because its token proves ownership.

Rate-limit errors expose `status: 429`, `code: "lock_rate_limited"`, and
`retryAfter` in seconds. Every request counts against the project's 600-per-minute
budget, reads and force releases included, and each holder spends `180 / ttl`
renewals per minute, so a 30-second TTL supports roughly 100 concurrent holders
per project. Raise the TTL when you need more.
