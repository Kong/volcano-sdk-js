# Volcano SDK Documentation

Welcome to the Volcano SDK documentation. This guide will help you integrate Volcano's backend services into your JavaScript and TypeScript applications.

## What is Volcano?

Volcano is a backend-as-a-service platform that provides everything you need to build modern applications:

- **Authentication** with email/password, OAuth providers, and anonymous users
- **PostgreSQL Database** with Row-Level Security and a browser-friendly query builder
- **File Storage** with access control policies
- **Realtime** subscriptions for database changes, presence, and broadcast messaging
- **Serverless Functions** for custom backend logic

The SDK is designed to work seamlessly in browsers, React/Next.js applications, and Node.js environments.

## Documentation

| Guide                                   | Description                                                   |
| --------------------------------------- | ------------------------------------------------------------- |
| [Getting Started](./getting-started.md) | Installation, configuration, and your first request           |
| [Authentication](./authentication.md)   | User sign-up, sign-in, OAuth, sessions, and password recovery |
| [Database](./database.md)               | Query builder for PostgreSQL with Row-Level Security          |
| [Storage](./storage.md)                 | Upload, download, and manage files                            |
| [Realtime](./realtime.md)               | WebSocket subscriptions, presence, and broadcast              |
| [Functions](./functions.md)             | Invoke serverless functions                                   |
| [Next.js Integration](./nextjs.md)      | Server components, middleware, and SSR considerations         |
| [TypeScript](./typescript.md)           | Type definitions and best practices                           |
| [Error Handling](./error-handling.md)   | Error patterns and troubleshooting                            |

## Quick Example

Here's a complete example showing authentication and database queries:

```javascript
import { VolcanoAuth } from '@volcano.dev/sdk';

// Initialize the client
const volcano = new VolcanoAuth({
  apiUrl: 'https://api.yourproject.volcano.dev',
  anonKey: 'your-anon-key',
});

// Set your database
volcano.database('my-database');

// Sign in
const { user, error } = await volcano.auth.signIn({
  email: 'user@example.com',
  password: 'password123',
});

if (error) {
  console.error('Sign in failed:', error.message);
} else {
  console.log('Welcome back,', user.email);
}

// Query the database
const { data: posts } = await volcano
  .from('posts')
  .select('id, title, created_at')
  .eq('published', true)
  .order('created_at', { ascending: false })
  .limit(10);

console.log('Recent posts:', posts);
```

## Installation

```bash
npm install @volcano.dev/sdk
```

Realtime support is included with the SDK and is available from
`@volcano.dev/sdk/realtime`.

## Getting Help

- [GitHub Issues](https://github.com/Kong/volcano-sdk-js/issues) - Report bugs or request features
- [Volcano Documentation](https://volcano.dev/) - Product documentation and examples

## License

Apache License 2.0 - see [LICENSE](../LICENSE) for details.
