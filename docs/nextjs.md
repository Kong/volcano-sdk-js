# Next.js

## Browser client

Create a single client for browser components and select a database explicitly.

```ts
// lib/volcano.ts
import { createVolcanoClient } from '@volcano.dev/sdk';

export const volcano = createVolcanoClient({
  baseUrl: process.env.NEXT_PUBLIC_VOLCANO_API_URL,
  anonKey: process.env.NEXT_PUBLIC_VOLCANO_ANON_KEY,
});

export const database = volcano.database(process.env.NEXT_PUBLIC_VOLCANO_DATABASE_NAME!);
```

```tsx
'use client';

import { database } from '@/lib/volcano';

export async function loadPosts() {
  return database.from('posts').select('id, title').order('created_at', {
    ascending: false,
  });
}
```

The auth helper persists browser sessions and refreshes access-token requests once when they receive a 401.

## Middleware and route handlers

Use the separate middleware entry point. It routes validation and refresh through the generated auth operations.

```ts
// middleware.ts
import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient, withAuth } from '@volcano.dev/sdk/next/middleware';

const auth = createServerClient({
  baseUrl: process.env.VOLCANO_API_URL,
  anonKey: process.env.VOLCANO_ANON_KEY!,
});

export async function middleware(request: NextRequest) {
  const user = await withAuth(request, auth);
  if (!user && request.nextUrl.pathname.startsWith('/dashboard')) {
    return NextResponse.redirect(new URL('/login', request.url));
  }
  return NextResponse.next();
}
```

`withAuth` reads a bearer token first, then the `volcano_access_token` cookie. `createServerClient().refreshToken()` can rotate a refresh token in route-handler code.

## Server-side generated API

For platform management or other stateless calls, use the API subpath directly.

```ts
import { createApiClient, listProjects } from '@volcano.dev/sdk/api';

const api = createApiClient({
  baseUrl: process.env.VOLCANO_API_URL,
  userToken: process.env.VOLCANO_USER_TOKEN,
});

const projects = await listProjects({ client: api });
```

Do not expose service-role keys or platform user tokens to browser bundles.
