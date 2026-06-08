# Volcano SDK

[![CI](https://github.com/Kong/sdk-volcano-js/actions/workflows/ci.yml/badge.svg)](https://github.com/Kong/sdk-volcano-js/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)
[![npm](https://img.shields.io/npm/v/@volcano.dev/sdk.svg)](https://www.npmjs.com/package/@volcano.dev/sdk)

The official JavaScript/TypeScript SDK for Volcano.

## Installation

```bash
npm install @volcano.dev/sdk
```

## Quick Start

```javascript
import { VolcanoAuth } from '@volcano.dev/sdk';

const volcano = new VolcanoAuth({
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

For browser realtime connections, make sure the browser app's origin is allowed in your project's auth CORS settings. The anonymous key is used to identify the project before the WebSocket upgrade completes.

## Documentation

| Guide                                        | Description                       |
| -------------------------------------------- | --------------------------------- |
| [Getting Started](./docs/getting-started.md) | Installation and setup            |
| [Authentication](./docs/authentication.md)   | Sign-up, sign-in, OAuth, sessions |
| [Database](./docs/database.md)               | Query builder and CRUD operations |
| [Storage](./docs/storage.md)                 | File upload and management        |
| [Realtime](./docs/realtime.md)               | Live subscriptions and presence   |
| [Functions](./docs/functions.md)             | Serverless function invocation    |
| [Next.js](./docs/nextjs.md)                  | Server components and middleware  |
| [TypeScript](./docs/typescript.md)           | Type definitions                  |
| [Error Handling](./docs/error-handling.md)   | Error patterns                    |

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for local workflows, package
structure, and pull request expectations.

If you believe you have found a security vulnerability, do not open a public
issue. Follow [SECURITY.md](./SECURITY.md) instead.

## License

Volcano SDK is licensed under the Apache License 2.0. See [LICENSE](./LICENSE).
