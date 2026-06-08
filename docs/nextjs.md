# Next.js Integration

This guide covers how to use the Volcano SDK effectively in Next.js applications, including App Router, Pages Router, Server Components, and Middleware.

## Overview

Next.js applications have multiple execution environments:

| Environment           | SDK Usage                                               |
| --------------------- | ------------------------------------------------------- |
| **Client Components** | Full SDK - authentication, queries, storage, realtime   |
| **Server Components** | Limited - use middleware helpers or API routes          |
| **Middleware**        | Auth validation with `@volcano.dev/sdk/next/middleware` |
| **API Routes**        | Server client for auth validation                       |

## Installation

```bash
npm install @volcano.dev/sdk
```

Realtime support is available from `@volcano.dev/sdk/realtime`; no separate
package install is required.

## Environment Variables

Create a `.env.local` file:

```env
NEXT_PUBLIC_VOLCANO_API_URL=https://api.yourproject.volcano.dev
NEXT_PUBLIC_VOLCANO_ANON_KEY=ak-your-anon-key
NEXT_PUBLIC_VOLCANO_DATABASE_NAME=your-database
```

Variables prefixed with `NEXT_PUBLIC_` are available in both client and server code.

## Client Components

Client Components have full access to the SDK, including localStorage for session persistence.

### Create a Shared Client

```typescript
// lib/volcano.ts
import { VolcanoAuth } from '@volcano.dev/sdk';

let volcano: VolcanoAuth | null = null;

export function getVolcano(): VolcanoAuth {
  if (!volcano) {
    volcano = new VolcanoAuth({
      apiUrl: process.env.NEXT_PUBLIC_VOLCANO_API_URL!,
      anonKey: process.env.NEXT_PUBLIC_VOLCANO_ANON_KEY!,
    });
    volcano.database(process.env.NEXT_PUBLIC_VOLCANO_DATABASE_NAME!);
  }
  return volcano;
}
```

### Auth Provider

Create a context to share auth state across your app:

```tsx
// context/AuthContext.tsx
'use client';

import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import { getVolcano } from '@/lib/volcano';
import type { User } from '@volcano.dev/sdk';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const volcano = getVolcano();

    // Initialize and restore session
    volcano.initialize().then(({ user }) => {
      setUser(user);
      setLoading(false);
    });

    // Listen for auth changes
    const unsubscribe = volcano.auth.onAuthStateChange((updatedUser) => {
      setUser(updatedUser);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const volcano = getVolcano();
    const { error } = await volcano.auth.signIn({ email, password });
    if (error) throw error;
  }, []);

  const signUp = useCallback(async (email: string, password: string) => {
    const volcano = getVolcano();
    const { error } = await volcano.auth.signUp({ email, password });
    if (error) throw error;
  }, []);

  const signOut = useCallback(async () => {
    const volcano = getVolcano();
    await volcano.auth.signOut();
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
```

### Use in Layout

```tsx
// app/layout.tsx
import { AuthProvider } from '@/context/AuthContext';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
```

### Protected Page Component

```tsx
// app/dashboard/page.tsx
'use client';

import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { getVolcano } from '@/lib/volcano';

export default function DashboardPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [posts, setPosts] = useState([]);

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
  }, [user, loading, router]);

  useEffect(() => {
    if (user) {
      const volcano = getVolcano();
      volcano
        .from('posts')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(10)
        .then(({ data }) => {
          setPosts(data || []);
        });
    }
  }, [user]);

  if (loading) {
    return <div>Loading...</div>;
  }

  if (!user) {
    return null;
  }

  return (
    <div>
      <h1>Welcome, {user.email}</h1>
      <ul>
        {posts.map((post: any) => (
          <li key={post.id}>{post.title}</li>
        ))}
      </ul>
    </div>
  );
}
```

## Middleware

Protect routes at the edge with Next.js middleware and the Volcano middleware helpers.

### Setup Middleware

```typescript
// middleware.ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createServerClient, withAuth } from '@volcano.dev/sdk/next/middleware';

export async function middleware(request: NextRequest) {
  const client = createServerClient({
    anonKey: process.env.NEXT_PUBLIC_VOLCANO_ANON_KEY!,
    apiUrl: process.env.NEXT_PUBLIC_VOLCANO_API_URL,
  });

  // Check if user is authenticated
  const user = await withAuth(request, client);

  // Protect dashboard routes
  if (request.nextUrl.pathname.startsWith('/dashboard')) {
    if (!user) {
      return NextResponse.redirect(new URL('/login', request.url));
    }
  }

  // Redirect authenticated users away from login
  if (request.nextUrl.pathname === '/login') {
    if (user) {
      return NextResponse.redirect(new URL('/dashboard', request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*', '/login'],
};
```

### Middleware Helpers API

The `@volcano.dev/sdk/next/middleware` module provides:

```typescript
import {
  createServerClient,
  withAuth,
  getTokenFromRequest,
  isBrowser,
  isServer,
} from '@volcano.dev/sdk/next/middleware';

// Create a server client for auth validation
const client = createServerClient({
  anonKey: 'your-anon-key',
  apiUrl: 'https://api.example.com', // optional
});

// Validate auth and get user
const user = await withAuth(request, client);

// Extract token from request (Authorization header or cookie)
const token = getTokenFromRequest(request);

// Validate token manually
const { user, error } = await client.getUser(token);

// Refresh a token
const { accessToken, refreshToken, error } = await client.refreshToken(oldRefreshToken);

// Environment detection
if (isBrowser()) {
  // Running in browser
}
if (isServer()) {
  // Running on server
}
```

## API Routes

### App Router (Route Handlers)

```typescript
// app/api/posts/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getTokenFromRequest } from '@volcano.dev/sdk/next/middleware';

export async function GET(request: NextRequest) {
  const client = createServerClient({
    anonKey: process.env.NEXT_PUBLIC_VOLCANO_ANON_KEY!,
    apiUrl: process.env.NEXT_PUBLIC_VOLCANO_API_URL,
  });

  const token = getTokenFromRequest(request);
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { user, error } = await client.getUser(token);
  if (error || !user) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  }

  // User is authenticated - perform database operations
  // For complex queries, call your Volcano function
  const volcano = new VolcanoAuth({
    apiUrl: process.env.NEXT_PUBLIC_VOLCANO_API_URL!,
    anonKey: process.env.NEXT_PUBLIC_VOLCANO_ANON_KEY!,
    accessToken: token,
  });

  const { data, error: queryError } = await volcano.functions.invoke('get-user-posts');

  if (queryError) {
    return NextResponse.json({ error: queryError.message }, { status: 500 });
  }

  return NextResponse.json({ posts: data });
}
```

### Pages Router (API Routes)

```typescript
// pages/api/posts.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { VolcanoAuth } from '@volcano.dev/sdk';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const token = req.headers.authorization?.replace('Bearer ', '');

  if (!token) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const volcano = new VolcanoAuth({
    apiUrl: process.env.NEXT_PUBLIC_VOLCANO_API_URL!,
    anonKey: process.env.NEXT_PUBLIC_VOLCANO_ANON_KEY!,
    accessToken: token,
  });

  volcano.database(process.env.NEXT_PUBLIC_VOLCANO_DATABASE_NAME!);

  const { data, error } = await volcano
    .from('posts')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  return res.status(200).json({ posts: data });
}
```

## Server Components

Server Components can't directly use the SDK because they don't have access to localStorage or browser APIs. Instead:

1. **Fetch data in API routes** and call them from Server Components
2. **Use Server Actions** with the SDK
3. **Pass data from middleware** via headers

### Server Action Example

```typescript
// app/actions.ts
'use server';

import { cookies } from 'next/headers';
import { createServerClient } from '@volcano.dev/sdk/next/middleware';
import { VolcanoAuth } from '@volcano.dev/sdk';

export async function getPosts() {
  const cookieStore = cookies();
  const token = cookieStore.get('volcano_access_token')?.value;

  if (!token) {
    throw new Error('Not authenticated');
  }

  const client = createServerClient({
    anonKey: process.env.NEXT_PUBLIC_VOLCANO_ANON_KEY!,
    apiUrl: process.env.NEXT_PUBLIC_VOLCANO_API_URL,
  });

  const { user, error } = await client.getUser(token);
  if (error || !user) {
    throw new Error('Invalid session');
  }

  // Use the SDK with the token
  const volcano = new VolcanoAuth({
    apiUrl: process.env.NEXT_PUBLIC_VOLCANO_API_URL!,
    anonKey: process.env.NEXT_PUBLIC_VOLCANO_ANON_KEY!,
    accessToken: token,
  });

  volcano.database(process.env.NEXT_PUBLIC_VOLCANO_DATABASE_NAME!);

  const { data } = await volcano
    .from('posts')
    .select('id, title, created_at')
    .order('created_at', { ascending: false })
    .limit(10);

  return data;
}
```

```tsx
// app/posts/page.tsx
import { getPosts } from '@/app/actions';

export default async function PostsPage() {
  const posts = await getPosts();

  return (
    <ul>
      {posts?.map((post) => (
        <li key={post.id}>{post.title}</li>
      ))}
    </ul>
  );
}
```

## Realtime in Next.js

Realtime requires a Client Component since it uses WebSockets:

```tsx
// components/LivePosts.tsx
'use client';

import { useEffect, useState } from 'react';
import { VolcanoRealtime } from '@volcano.dev/sdk/realtime';
import { getVolcano } from '@/lib/volcano';
import { useAuth } from '@/context/AuthContext';

export function LivePosts() {
  const { user } = useAuth();
  const [posts, setPosts] = useState<any[]>([]);

  useEffect(() => {
    if (!user) return;

    const volcano = getVolcano();

    // Initial fetch
    volcano
      .from('posts')
      .select('*')
      .order('created_at', { ascending: false })
      .then(({ data }) => setPosts(data || []));

    // Setup realtime
    const realtime = new VolcanoRealtime({
      apiUrl: process.env.NEXT_PUBLIC_VOLCANO_API_URL!,
      anonKey: process.env.NEXT_PUBLIC_VOLCANO_ANON_KEY!,
      accessToken: volcano.accessToken!,
    });

    realtime.connect().then(() => {
      const channel = realtime.channel('posts', { type: 'postgres' });

      channel.onPostgresChanges('INSERT', 'public', 'posts', (change) => {
        setPosts((current) => [change.record, ...current]);
      });

      channel.onPostgresChanges('UPDATE', 'public', 'posts', (change) => {
        setPosts((current) => current.map((p) => (p.id === change.record.id ? change.record : p)));
      });

      channel.onPostgresChanges('DELETE', 'public', 'posts', (change) => {
        setPosts((current) => current.filter((p) => p.id !== change.old_record.id));
      });

      channel.subscribe();
    });

    return () => {
      realtime.disconnect();
    };
  }, [user]);

  return (
    <ul>
      {posts.map((post) => (
        <li key={post.id}>{post.title}</li>
      ))}
    </ul>
  );
}
```

## OAuth Handling

OAuth redirects must be handled carefully in Next.js:

### Login Page

```tsx
// app/login/page.tsx
'use client';

import { getVolcano } from '@/lib/volcano';

export default function LoginPage() {
  const handleGoogleLogin = () => {
    const volcano = getVolcano();
    volcano.auth.signInWithGoogle();
    // This redirects to Google, then back to your callback URL
  };

  return <button onClick={handleGoogleLogin}>Sign in with Google</button>;
}
```

### OAuth Callback Page

```tsx
// app/auth/callback/page.tsx
'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getVolcano } from '@/lib/volcano';

export default function AuthCallbackPage() {
  const router = useRouter();

  useEffect(() => {
    const volcano = getVolcano();

    // The SDK handles the OAuth tokens from the URL
    volcano.initialize().then(({ user }) => {
      if (user) {
        router.push('/dashboard');
      } else {
        router.push('/login?error=auth_failed');
      }
    });
  }, [router]);

  return <div>Completing sign in...</div>;
}
```

## SSR Safety

The SDK detects server environments and prevents browser-only operations:

```typescript
import { isBrowser } from '@volcano.dev/sdk';

// OAuth methods throw on server
if (isBrowser()) {
  volcano.auth.signInWithGoogle(); // OK in browser
} else {
  // Handle server-side OAuth flow differently
}
```

Service keys are blocked in browser environments:

```typescript
// This throws an error in the browser:
const volcano = new VolcanoAuth({
  anonKey: 'sk-service-key', // ERROR: Service keys can't be used client-side
});
```

## Best Practices

### 1. Single Client Instance

Create one SDK instance and reuse it:

```typescript
// Good
const volcano = getVolcano();
await volcano.from('posts').select('*');
await volcano.from('comments').select('*');

// Avoid
const v1 = new VolcanoAuth({ ... });
const v2 = new VolcanoAuth({ ... });
```

### 2. Handle Loading States

Always account for authentication loading:

```tsx
const { user, loading } = useAuth();

if (loading) {
  return <LoadingSpinner />;
}

if (!user) {
  return <LoginPrompt />;
}

return <Dashboard user={user} />;
```

### 3. Clean Up Subscriptions

Always unsubscribe from realtime channels:

```tsx
useEffect(() => {
  const realtime = new VolcanoRealtime({ ... });
  const channel = realtime.channel('updates', { type: 'postgres' });

  realtime.connect().then(() => {
    channel.subscribe();
  });

  return () => {
    channel.unsubscribe();
    realtime.disconnect();
  };
}, []);
```

### 4. Validate on Server

Don't trust client data - validate tokens in middleware and API routes:

```typescript
// middleware.ts
const user = await withAuth(request, client);
if (!user) {
  return NextResponse.redirect('/login');
}
```

### 5. Environment Variable Naming

Use `NEXT_PUBLIC_` for client-accessible variables:

```env
# Available everywhere
NEXT_PUBLIC_VOLCANO_API_URL=...
NEXT_PUBLIC_VOLCANO_ANON_KEY=...

# Server-only (don't prefix)
VOLCANO_SERVICE_KEY=...
```

## Next Steps

- [Authentication](./authentication.md) - Complete auth guide
- [Database](./database.md) - Query builder reference
- [Realtime](./realtime.md) - WebSocket subscriptions
