# Getting Started

This guide walks you through installing the Volcano SDK and making your first authenticated request.

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
  const volcano = new VolcanoAuth({
    apiUrl: 'https://api.yourproject.volcano.dev',
    anonKey: 'your-anon-key',
  });
</script>
```

## Configuration

Every Volcano project has two keys you'll need:

1. **API URL** - Your project's API endpoint (e.g., `https://api.yourproject.volcano.dev`)
2. **Anon Key** - A public key that identifies your project

You can find both in your project's settings dashboard.

### Initialize the Client

```javascript
import { VolcanoAuth } from '@volcano.dev/sdk';

const volcano = new VolcanoAuth({
  apiUrl: 'https://api.yourproject.volcano.dev',
  anonKey: 'your-anon-key',
});
```

The anon key is safe to include in client-side code. It identifies your project but doesn't grant any special privileges - all access is controlled by Row-Level Security policies.

### Environment Variables

In production, store your configuration in environment variables:

```javascript
const volcano = new VolcanoAuth({
  apiUrl: process.env.VOLCANO_API_URL,
  anonKey: process.env.VOLCANO_ANON_KEY,
});
```

For Next.js applications, prefix your environment variables with `NEXT_PUBLIC_` to make them available in the browser:

```env
NEXT_PUBLIC_VOLCANO_API_URL=https://api.yourproject.volcano.dev
NEXT_PUBLIC_VOLCANO_ANON_KEY=ak-your-anon-key
```

## Your First Request

Let's create a user account and sign in.

### 1. Sign Up a New User

```javascript
const { user, error } = await volcano.auth.signUp({
  email: 'alice@example.com',
  password: 'secure-password-123',
});

if (error) {
  console.error('Sign up failed:', error.message);
  return;
}

console.log('Account created!', user.id);
```

The SDK automatically stores the session in localStorage (in browsers), so subsequent requests are authenticated.

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
