---
title: 'Getting Started'
description: 'This guide walks you through installing the Volcano SDK and making your first authenticated request.'
---

Install the SDK, sign in, and read a server-validated user profile.
Use Node.js 20 or later for the runnable quickstart below. `VolcanoClient` is the
client for new applications; `VolcanoAuth` remains a compatible alias.

## Installation

Install the SDK using your preferred package manager:

```bash
# npm
npm install @volcano.dev/sdk

# pnpm
pnpm add @volcano.dev/sdk

# yarn
yarn add @volcano.dev/sdk
```

## Sign in and read a profile

Create a project, enable [email and password authentication](/platform/authentication/configuring-auth-methods), and create a user with a confirmed email when your project requires confirmation.
Use that project's [anonymous key](/platform/authentication/security/anon-keys).
Set `VOLCANO_ANON_KEY`, `VOLCANO_USER_EMAIL`, and `VOLCANO_USER_PASSWORD` in your environment.
Set `VOLCANO_API_URL` only when using a different endpoint, such as local mode.

Save this as `quickstart.mjs`:

```javascript
import { VolcanoClient } from '@volcano.dev/sdk';

const { VOLCANO_ANON_KEY, VOLCANO_USER_EMAIL, VOLCANO_USER_PASSWORD } = process.env;
if (!VOLCANO_ANON_KEY || !VOLCANO_USER_EMAIL || !VOLCANO_USER_PASSWORD) {
  throw new Error('Set VOLCANO_ANON_KEY, VOLCANO_USER_EMAIL, and VOLCANO_USER_PASSWORD');
}

const client = new VolcanoClient({
  anonKey: VOLCANO_ANON_KEY,
  apiUrl: process.env.VOLCANO_API_URL ?? 'https://api.volcano.dev',
});
const { user: signedInUser, error: signInError } = await client.auth.signIn({
  email: VOLCANO_USER_EMAIL,
  password: VOLCANO_USER_PASSWORD,
});
if (signInError) throw signInError;

try {
  const { user, error } = await client.auth.getUser();
  if (error) throw error;
  if (!user || user.id !== signedInUser.id) throw new Error('Unexpected user');
  console.log(`Signed in as ${user.email}`);
} finally {
  const { error } = await client.auth.signOut();
  if (error) throw error;
}
```

Run it with `node quickstart.mjs`.
It signs in, fetches the profile, prints the user's email, revokes its server session, and clears the local session. JavaScript auth methods return `{ user, error }` or `{ error }`; check `error` before using a result. Python and Ruby use typed exceptions for the [equivalent Python](/sdk/python) and [Ruby](/sdk/ruby) quickstarts.

Use a separate client for each independent user session.
Do not share one mutable client across users in a server application.
Keep service keys and user passwords out of browser code and source control.

### Realtime Support

Realtime support is included with the SDK and is imported separately to keep
your bundle size small when you don't need it:

```javascript
import { VolcanoRealtime } from '@volcano.dev/sdk/realtime';
```

Browser clients use the browser's native `WebSocket`. Node.js clients use the
SDK's `ws` dependency unless you provide a custom implementation.

### CDN (Browser)

For quick prototyping or simple HTML pages, you can load the SDK directly from a CDN:

```html
<script src="https://unpkg.com/@volcano.dev/sdk@latest/dist/index.js"></script>
<script>
  const volcano = new VolcanoClient({
    apiUrl: 'https://api.volcano.dev',
    anonKey: 'your-anon-key',
  });
</script>
```

## Configuration

Use `https://api.volcano.dev` for the hosted API and your project's anonymous key from the dashboard.
The API URL is shared; the key identifies the project.
Override `apiUrl` when connecting to another environment.

### Initialize the Client

```javascript
import { VolcanoClient } from '@volcano.dev/sdk';

const volcano = new VolcanoClient({
  apiUrl: 'https://api.volcano.dev',
  anonKey: 'your-anon-key',
});
```

The anonymous key is safe to include in client-side code.
Project permissions and Row-Level Security policies control the data and operations available to each caller.

### Environment Variables

In production, store your configuration in environment variables:

```javascript
const volcano = new VolcanoClient({
  apiUrl: process.env.VOLCANO_API_URL,
  anonKey: process.env.VOLCANO_ANON_KEY,
});
```

For Next.js applications, prefix your environment variables with `NEXT_PUBLIC_` to make them available in the browser:

```env
NEXT_PUBLIC_VOLCANO_API_URL=https://api.volcano.dev
NEXT_PUBLIC_VOLCANO_ANON_KEY=ak-your-anon-key
```

## Your First Request

Let's create a user account and sign in.

### 1. Sign Up a New User

```javascript
const { confirmationRequired, message, error } = await volcano.auth.signUp({
  email: 'alice@example.com',
  password: 'secure-password-123',
});

if (error) {
  console.error('Sign up failed:', error.message);
  return;
}

console.log(message ?? 'Account created!');
```

Sign up is session-less: it creates the account but does not start a session, so you sign in next (see below) to authenticate. Pass `signInWhenAllowed: true` to have the SDK sign in automatically when the project does not require email confirmation.

### 2. Sign In an Existing User

```javascript
const { user, error } = await volcano.auth.signIn({
  email: 'alice@example.com',
  password: 'secure-password-123',
});

if (error) {
  console.error('Sign in failed:', error.message);
  return;
}

console.log('Welcome back,', user.email);
```

### 3. Query the Database

Once signed in, you can query your PostgreSQL database directly from the browser:

```javascript
// Set your database name (do this once)
volcano.database('my-database');

// Fetch all published posts
const { data, error } = await volcano
  .from('posts')
  .select('id, title, content, created_at')
  .eq('published', true)
  .order('created_at', { ascending: false })
  .limit(10);

if (error) {
  console.error('Query failed:', error.message);
  return;
}

console.log('Found', data.length, 'posts');
data.forEach((post) => {
  console.log('-', post.title);
});
```

Row-Level Security policies automatically filter results to only include data the current user is allowed to see.

### 4. Insert Data

```javascript
const { data, error } = await volcano.insert('posts', {
  title: 'My First Post',
  content: 'Hello, Volcano!',
  published: true,
});

if (error) {
  console.error('Insert failed:', error.message);
  return;
}

console.log('Created post:', data[0].id);
```

## Session Persistence

In browser environments, the SDK automatically persists the user's session to localStorage. When your app loads, you can restore the session:

```javascript
// Check if there's an existing session
const { user, error } = await volcano.initialize();

if (user) {
  console.log('Session restored for', user.email);
} else {
  console.log('No active session');
}
```

This is especially useful for single-page applications where you want to keep users logged in across page refreshes.

## Listening for Auth Changes

You can subscribe to authentication state changes to update your UI when users sign in or out:

```javascript
const unsubscribe = volcano.auth.onAuthStateChange((user) => {
  if (user) {
    console.log('User signed in:', user.email);
    showDashboard();
  } else {
    console.log('User signed out');
    showLoginForm();
  }
});

// Later, when your component unmounts:
unsubscribe();
```

## Sign Out

```javascript
const { error } = await volcano.auth.signOut();

if (error) {
  console.error('Sign out failed:', error.message);
} else {
  console.log('Signed out successfully');
}
```

This clears the local session and invalidates the refresh token on the server.

## Next Steps

Now that you have the basics working, explore more features:

- [Authentication](./authentication.md) - OAuth, password recovery, email confirmation
- [Database](./database.md) - Advanced queries, updates, and deletes
- [Storage](./storage.md) - Upload and manage files
- [Realtime](./realtime.md) - Subscribe to database changes
- [Next.js](./nextjs.md) - Server components and middleware integration
