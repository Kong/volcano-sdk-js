---
title: Logs
description: Search retained project logs, paginate events, and read activity counts.
order: 6
---

Search logs and inspect activity for resources in your project.

Project logs require a platform user token or a [project access token](/platform/api-reference/using-the-api). For server-side log readers, create a `read_only` project token and set `VOLCANO_PROJECT_ACCESS_TOKEN`, `VOLCANO_PROJECT_ID`, and `VOLCANO_ANON_KEY`. Keep this credential on your server. The constructor requires an anon key, but the supplied project access token authorizes these requests. Project end-user sign-in, anon keys, and service keys do not grant project log access.

```javascript
import { VolcanoClient } from '@volcano.dev/sdk';

const projectId = process.env.VOLCANO_PROJECT_ID;
const client = new VolcanoClient({
  anonKey: process.env.VOLCANO_ANON_KEY,
  apiUrl: process.env.VOLCANO_API_URL || 'https://api.volcano.dev',
  accessToken: process.env.VOLCANO_PROJECT_ACCESS_TOKEN,
});
const request = { resource: { type: 'function' }, q: 'checkout_failed', limit: 100 };
const { data: page, error } = await client.logs.search(projectId, request);
if (error) throw error;
for (const event of page.data) console.log(event.timestamp, event.body);
```

`search()` returns `{ data, error }`. The successful `data` contains `data` (events), `limit`, `has_more`, and an optional `next_cursor`.

## Continue a search

```javascript
if (page.has_more && page.next_cursor) {
  const next = await client.logs.search(projectId, { ...request, cursor: page.next_cursor });
  if (next.error) throw next.error;
  console.log(next.data.data);
}
```

## Read activity buckets

```javascript
const activity = await client.logs.activity(projectId, {
  resource: request.resource,
  q: request.q,
  bucket_count: 24,
});
if (activity.error) throw activity.error;
console.log(activity.data.total);
for (const bucket of activity.data.data)
  console.log(bucket.start_time, bucket.counts, bucket.total);
```

Keep the same resource selector, query, and time bounds on every pagination request. Results are newest first. `body` preserves JSON values, including objects and arrays; it is not always a string. Events include a stable `id`, `timestamp`, and owning `resource`.

Activity returns time buckets and a total count. Each bucket contains `start_time`, `end_time`, `total`, and `counts` grouped by `levels`, `regions`, and `resource_ids`.

Both methods accept `resource.ids` to restrict results to specific resources, `q` for text or field queries, and RFC3339 `start_time` and `end_time` bounds. Logs arrive asynchronously; use bounded polling when waiting for a new event. These methods read retained logs rather than open a live stream.

A project token has no refresh token. The SDK sends it as supplied and surfaces authentication failures; rotate or replace expired credentials through project token management. Do not use auth sign-out to revoke a project token.
