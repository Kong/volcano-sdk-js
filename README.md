# Volcano SDK

[![CI](https://github.com/Kong/volcano-sdk-js/actions/workflows/ci.yml/badge.svg)](https://github.com/Kong/volcano-sdk-js/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)
[![npm](https://img.shields.io/npm/v/@volcano.dev/sdk.svg)](https://www.npmjs.com/package/@volcano.dev/sdk)

The official JavaScript/TypeScript SDK for Volcano.

## Installation

```bash
npm install @volcano.dev/sdk
```

## Quick Start

```javascript
import { VolcanoClient } from '@volcano.dev/sdk';

const volcano = new VolcanoClient({
  apiUrl: 'https://api.yourproject.volcano.dev',
  anonKey: 'your-anon-key',
});

// Authentication
const { user } = await volcano.auth.signIn({
  email: 'user@example.com',
  password: 'password123',
});

// Database queries
volcano.database('my-database');
const { data } = await volcano
  .from('posts')
  .select('*')
  .eq('published', true)
  .order('created_at', { ascending: false });

// File storage
const { data: file } = await volcano.storage.from('uploads').upload('photo.jpg', imageFile);

// Backend leader election (initialize accessToken with a service-role key)
const lockResult = await volcano.locks.withLock('daily-rollup', { ttl: 30 }, async ({ signal }) => {
  await runRollup({ signal });
});
if (lockResult.error) throw lockResult.error;

// Realtime subscriptions
import { VolcanoRealtime } from '@volcano.dev/sdk/realtime';

const realtime = new VolcanoRealtime({
  apiUrl: 'https://api.yourproject.volcano.dev',
  anonKey: 'your-anon-key',
  accessToken: volcano.accessToken,
});

await realtime.connect();
const channel = realtime.channel('updates', { type: 'postgres' });
channel.onPostgresChanges('INSERT', 'public', 'posts', (change) => {
  console.log('New post:', change.record);
});
await channel.subscribe();
```

`VolcanoClient` is the preferred name for new code. `VolcanoAuth` remains a
compatible alias, so existing applications do not need to change imports.

For browser realtime connections, make sure the browser app's origin is allowed in your project's auth CORS settings. The anonymous key is used to identify the project before the WebSocket upgrade completes.

## Documentation

| Guide                                            | Description                       |
| ------------------------------------------------ | --------------------------------- |
| [Getting Started](./docs/getting-started.md)     | Installation and setup            |
| [Authentication](./docs/authentication.md)       | Sign-up, sign-in, OAuth, sessions |
| [Database](./docs/database.md)                   | Query builder and CRUD operations |
| [Storage](./docs/storage.md)                     | File upload and management        |
| [Realtime](./docs/realtime.md)                   | Live subscriptions and presence   |
| [Functions](./docs/functions.md)                 | Serverless function invocation    |
| [Durable functions](./docs/durable-functions.md) | Checkpointed, long-running work   |
| [Project locks](./docs/locks.md)                 | Renewable backend leases          |
| [Next.js](./docs/nextjs.md)                      | Server components and middleware  |
| [TypeScript](./docs/typescript.md)               | Type definitions                  |
| [Error Handling](./docs/error-handling.md)       | Error patterns                    |

## Dependencies

Installing `@volcano.dev/sdk` pulls in two packages, both for realtime:

| Package                                                  | Why                                                                  |
| -------------------------------------------------------- | -------------------------------------------------------------------- |
| [`centrifuge`](https://www.npmjs.com/package/centrifuge) | The realtime protocol client                                         |
| [`ws`](https://www.npmjs.com/package/ws)                 | WebSocket transport outside the browser, loaded only when it is used |

Authoring a [durable function](./docs/durable-functions.md) adds one more, in
the function you deploy:

| Package                                                      | Why                                                                                                                                                            |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`@volcano.dev/durable-runtime`](./packages/durable-runtime) | Checkpointing. A re-export of [`@aws/durable-execution-sdk-js`](https://www.npmjs.com/package/@aws/durable-execution-sdk-js), which it installs on your behalf |

That one is an optional peer dependency, so nothing else installs it: a browser
bundle and a standard function stay as small as they were. It is ~1.5 MB and
brings an AWS Lambda client of its own, which is why it is not a base
dependency. A function that depends on `@aws/durable-execution-sdk-js` directly
also works — the SDK accepts either.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for local workflows, package
structure, and pull request expectations.

If you believe you have found a security vulnerability, do not open a public
issue. Follow [SECURITY.md](./SECURITY.md) instead.

## License

Volcano SDK is licensed under the Apache License 2.0. See [LICENSE](./LICENSE).
