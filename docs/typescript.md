# TypeScript

The Volcano SDK includes comprehensive TypeScript definitions for type-safe development. This guide covers type usage, generics, and best practices.

## Installation

TypeScript definitions are included with the SDK - no additional packages needed:

```bash
npm install @volcano.dev/sdk
```

## Basic Usage

Import types alongside the SDK:

```typescript
import { VolcanoAuth } from '@volcano.dev/sdk';
import type { User, Session, AuthResponse } from '@volcano.dev/sdk';

const volcano = new VolcanoAuth({
  apiUrl: process.env.VOLCANO_API_URL!,
  anonKey: process.env.VOLCANO_ANON_KEY!,
});

// Types are inferred automatically
const { user, session, error } = await volcano.auth.signIn({
  email: 'user@example.com',
  password: 'password123',
});

if (user) {
  console.log(user.email); // TypeScript knows this is a string
}
```

## Core Types

### Configuration

```typescript
interface VolcanoAuthConfig {
  /** API URL (defaults to https://api.volcano.dev) */
  apiUrl?: string;
  /** Project anon key (required) */
  anonKey: string;
  /** Access token for server-side use */
  accessToken?: string;
  /** Refresh token for server-side use */
  refreshToken?: string;
}
```

### User

```typescript
interface User {
  id: string;
  email: string;
  user_metadata?: Record<string, JsonValue>;
  created_at: string;
  updated_at: string;
}
```

### Session

```typescript
interface Session {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}
```

### Response Types

```typescript
interface AuthResponse {
  user: User | null;
  session: Session | null;
  error: Error | null;
}

interface UserResponse {
  user: User | null;
  error: Error | null;
}

interface SessionResponse {
  session: Session | null;
  error: Error | null;
}
```

## Database Queries

### Typed Query Results

Use generics for type-safe query results:

```typescript
interface Post {
  id: string;
  title: string;
  content: string;
  status: 'draft' | 'published' | 'archived';
  user_id: string;
  created_at: string;
}

// Query returns Post[]
const { data, error } = await volcano.from<Post>('posts').select('*').eq('status', 'published');

if (data) {
  data.forEach((post) => {
    console.log(post.title); // TypeScript knows this is string
    console.log(post.status); // TypeScript knows this is 'draft' | 'published' | 'archived'
  });
}
```

### Insert with Types

```typescript
// TypeScript validates the insert values
const { data, error } = await volcano.insert<Post>('posts', {
  title: 'New Post',
  content: 'Content here',
  status: 'draft',
  // user_id is likely auto-set by RLS
});
```

### Update with Types

```typescript
const { data, error } = await volcano
  .update<Post>('posts', {
    status: 'published', // TypeScript ensures this is a valid status
  })
  .eq('id', postId);
```

### Query Builder Types

```typescript
interface QueryBuilder<T> {
  select(columns: string): QueryBuilder<T>;
  eq(column: string, value: FilterValue): QueryBuilder<T>;
  neq(column: string, value: FilterValue): QueryBuilder<T>;
  gt(column: string, value: FilterValue): QueryBuilder<T>;
  gte(column: string, value: FilterValue): QueryBuilder<T>;
  lt(column: string, value: FilterValue): QueryBuilder<T>;
  lte(column: string, value: FilterValue): QueryBuilder<T>;
  like(column: string, pattern: string): QueryBuilder<T>;
  ilike(column: string, pattern: string): QueryBuilder<T>;
  is(column: string, value: null): QueryBuilder<T>;
  in(column: string, values: FilterValue[]): QueryBuilder<T>;
  order(column: string, options?: { ascending?: boolean }): QueryBuilder<T>;
  limit(count: number): QueryBuilder<T>;
  offset(count: number): QueryBuilder<T>;
  execute(): Promise<QueryResult<T>>;
}

interface QueryResult<T> {
  data: T[] | null;
  error: Error | null;
  count?: number;
}
```

## Storage Types

```typescript
interface StorageObject {
  id: string;
  bucket_id: string;
  name: string;
  owner_id?: string;
  is_public: boolean;
  size: number;
  mime_type: string;
  etag?: string;
  metadata?: Record<string, JsonValue>;
  created_at: string;
  updated_at: string;
  public_url?: string;
}

interface StorageUploadOptions {
  contentType?: string;
}

interface StorageUploadResponse {
  data: StorageObject | null;
  error: Error | null;
}

interface StorageDownloadResponse {
  data: Blob | null;
  error: Error | null;
}

interface StorageListResponse {
  data: StorageObject[] | null;
  error: Error | null;
  nextCursor: string | null;
}
```

### Usage

```typescript
const storage = volcano.storage.from('avatars');

// Upload
const { data, error }: StorageUploadResponse = await storage.upload('user/avatar.jpg', file, {
  contentType: 'image/jpeg',
});

// Download
const { data: blob }: StorageDownloadResponse = await storage.download('user/avatar.jpg');

// List
const { data: files, nextCursor }: StorageListResponse = await storage.list('user/', {
  limit: 100,
});
```

## Realtime Types

Import realtime types from the realtime module:

```typescript
import { VolcanoRealtime, RealtimeChannel } from '@volcano.dev/sdk/realtime';
import type {
  PostgresChange,
  PresenceState,
  ConnectContext,
  DisconnectContext,
  ErrorContext,
  RealtimeConfig,
  ChannelOptions,
  WebSocketConstructor,
} from '@volcano.dev/sdk/realtime';
```

### Realtime Configuration

```typescript
interface RealtimeConfig {
  apiUrl: string;
  anonKey: string;
  accessToken?: string;
  getToken?: () => Promise<string>;
  volcanoClient?: VolcanoAuth;
  fetchConfig?: FetchConfig;
  webSocket?: WebSocketConstructor;
}

interface ChannelOptions {
  type?: 'broadcast' | 'presence' | 'postgres';
  autoFetch?: boolean;
  fetchBatchWindowMs?: number;
  fetchMaxBatchSize?: number;
}
```

### Event Contexts

```typescript
interface ConnectContext {
  client?: string;
  latency?: number;
}

interface DisconnectContext {
  code?: number;
  reason?: string;
  reconnect?: boolean;
}

interface ErrorContext {
  error?: Error;
  message?: string;
  code?: number;
}
```

### Postgres Changes

```typescript
interface PostgresChange {
  table: string;
  schema: string;
  type: 'INSERT' | 'UPDATE' | 'DELETE';
  record?: Record<string, unknown>;
  old_record?: Record<string, unknown>;
  columns?: string[];
  timestamp: string;
}
```

### Typed Postgres Listeners

```typescript
interface Message {
  id: string;
  content: string;
  user_id: string;
  created_at: string;
}

channel.onPostgresChanges('INSERT', 'public', 'messages', (change: PostgresChange) => {
  const message = change.record as Message;
  console.log('New message:', message.content);
});
```

### Presence State

```typescript
interface PresenceState {
  [clientId: string]: Record<string, unknown>;
}

// Type your presence data
interface UserPresence {
  user_id: string;
  username: string;
  status: 'online' | 'away' | 'busy';
}

channel.onPresenceSync((state: PresenceState) => {
  const users = Object.values(state) as UserPresence[];
  users.forEach((user) => {
    console.log(`${user.username} is ${user.status}`);
  });
});
```

## Functions Types

### Typed Function Invocation

```typescript
interface InvokeParams {
  userId: string;
  action: 'fetch' | 'update' | 'delete';
}

interface InvokeResult {
  success: boolean;
  data?: Record<string, unknown>;
  message?: string;
}

const { data, error } = await volcano.functions.invoke<InvokeParams, InvokeResult>('process-user', {
  userId: '123',
  action: 'fetch',
});

if (data) {
  console.log(data.success); // TypeScript knows this is boolean
  console.log(data.message); // TypeScript knows this is string | undefined
}
```

## OAuth Types

```typescript
type OAuthProviderName = 'google' | 'github' | 'microsoft' | 'apple';

interface OAuthProvider {
  provider: OAuthProviderName;
  linked_at: string;
  updated_at: string;
}

interface OAuthAPIParams {
  endpoint: string;
  method?: string;
  body?: JsonValue;
}
```

### Usage

```typescript
// TypeScript ensures valid provider names
volcano.auth.signInWithOAuth('google'); // OK
volcano.auth.signInWithOAuth('invalid'); // Error: not assignable to 'OAuthProviderName'

// Get linked providers
const { providers } = await volcano.auth.getLinkedOAuthProviders();
if (providers) {
  providers.forEach((p: OAuthProvider) => {
    console.log(`${p.provider} linked at ${p.linked_at}`);
  });
}
```

## Session Management Types

```typescript
interface AuthSession {
  id: string;
  user_id: string;
  provider: 'email' | 'google' | 'github' | 'microsoft' | 'apple' | 'anonymous';
  user_agent?: string;
  ip_address?: string;
  last_ip_address?: string;
  expires_at: string;
  last_activity_at?: string;
  session_started_at?: string;
  is_active: boolean;
  is_current: boolean;
  created_at: string;
  updated_at: string;
}

interface SessionsResponse {
  sessions: AuthSession[] | null;
  total: number;
  page: number;
  limit: number;
  total_pages: number;
  error: Error | null;
}
```

## Middleware Types

```typescript
import type {
  ServerClientConfig,
  ServerClient,
  User,
  GetUserResult,
  RefreshTokenResult,
} from '@volcano.dev/sdk/next/middleware';

interface ServerClientConfig {
  anonKey: string;
  apiUrl?: string;
  accessToken?: string;
}

interface ServerClient {
  getUser(accessToken: string): Promise<GetUserResult>;
  refreshToken(refreshToken: string): Promise<RefreshTokenResult>;
}

interface GetUserResult {
  user: User | null;
  error: Error | null;
}

interface RefreshTokenResult {
  accessToken: string | null;
  refreshToken: string | null;
  error: Error | null;
}
```

## Utility Types

### JsonValue

A recursive type for JSON-serializable values:

```typescript
type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
```

### FilterValue

Values accepted by query filters:

```typescript
type FilterValue = string | number | boolean | null | Date;
```

### UserMetadata

Type for user metadata:

```typescript
type UserMetadata = Record<string, JsonValue>;

// Usage
const { user } = await volcano.auth.signUp({
  email: 'user@example.com',
  password: 'password',
  metadata: {
    name: 'Alice',
    preferences: {
      theme: 'dark',
      notifications: true,
    },
  } as UserMetadata,
});
```

## Best Practices

### 1. Define Your Data Models

Create interfaces for your database tables:

```typescript
// types/database.ts
export interface Post {
  id: string;
  title: string;
  content: string;
  status: 'draft' | 'published' | 'archived';
  user_id: string;
  created_at: string;
  updated_at: string;
}

export interface Comment {
  id: string;
  post_id: string;
  user_id: string;
  content: string;
  created_at: string;
}

export interface User {
  id: string;
  email: string;
  name: string;
  avatar_url?: string;
}
```

### 2. Use Type Guards

```typescript
function isPost(data: unknown): data is Post {
  return (
    typeof data === 'object' &&
    data !== null &&
    'id' in data &&
    'title' in data &&
    'content' in data
  );
}

const { data } = await volcano.from('posts').select('*');

if (data && data.every(isPost)) {
  // data is typed as Post[]
}
```

### 3. Handle Null Errors

Always check for errors and null data:

```typescript
const { data, error } = await volcano.from<Post>('posts').select('*');

if (error) {
  // Handle error
  console.error(error.message);
  return;
}

if (!data) {
  // Handle empty result
  return;
}

// data is guaranteed to be Post[]
data.forEach((post) => {
  console.log(post.title);
});
```

### 4. Type Your Callbacks

```typescript
const unsubscribe = volcano.auth.onAuthStateChange((user: User | null) => {
  if (user) {
    // TypeScript knows user properties
    console.log(user.email);
  }
});
```

### 5. Use Strict Mode

Enable strict TypeScript for best type checking:

```json
// tsconfig.json
{
  "compilerOptions": {
    "strict": true,
    "strictNullChecks": true
  }
}
```

## Next Steps

- [Getting Started](./getting-started.md) - Basic SDK usage
- [Database](./database.md) - Query builder with types
- [Realtime](./realtime.md) - Typed realtime subscriptions
