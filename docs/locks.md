# Project locks

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
Contention returns `{ acquired: false, error: null }`. If renewal fails, the
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

Keys may contain letters, digits, `.`, `_`, `:`, and `-` and are limited to 128
characters. TTL is 5 seconds through 90 days. An unreleased lease expires after
its requested TTL. Renewals cannot move an acquisition's absolute 90-day
deadline; acquire a new lease after that point. Keep the returned lease private
because its token proves ownership.
