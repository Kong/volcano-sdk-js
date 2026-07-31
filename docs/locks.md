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
callback signal is aborted; callbacks must honor it.

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

try {
  await volcano.locks.renew('migration', acquired.lease, { ttl: 10 });
} finally {
  await volcano.locks.release('migration', acquired.lease);
}
```

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
