# Volcano JavaScript SDK

The official JavaScript and TypeScript SDK for Volcano. Version 2 exposes the complete platform API through a checked-in generated OpenAPI client and keeps handwritten code only for stateful or ergonomic workflows.

## Install

```bash
pnpm add @volcano.dev/sdk
```

Node.js 20 or newer is required.

## Create a client

```ts
import { createVolcanoClient } from '@volcano.dev/sdk';

const volcano = createVolcanoClient({
  baseUrl: 'https://api.volcano.dev',
  anonKey: process.env.VOLCANO_ANON_KEY,
  accessToken,
  refreshToken,
  serviceRoleKey,
  userToken,
  timeoutMs: 60_000,
  headers: { 'X-Application': 'dashboard' },
  fetch: instrumentedFetch,
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    storage: asyncStorage,
    storageKey: 'volcano-my-project-auth-token',
  },
});
```

Each call creates an isolated client. Credentials can also be supplied individually, so platform management calls can use only `userToken` and backend storage calls can use only `serviceRoleKey`. `fetch`, default headers, synchronous or asynchronous auth storage, session persistence, proactive refresh, and request timeouts are configurable per instance. The SDK sends an overridable `X-Client-Info` header on HTTP requests.

## Generated API

Every OpenAPI operation and schema type is exported from `@volcano.dev/sdk/api`. Generated calls use grouped `body`, `path`, `query`, and `headers` parameters and return a non-throwing `{ data, error, request, response }` result.

```ts
import { listProjects, type Project } from '@volcano.dev/sdk/api';

const result = await listProjects({ client: volcano.api });
if (result.error) {
  console.error(result.error);
} else {
  const projects: Project[] = result.data.data;
}
```

For a generated client without the higher-level helpers:

```ts
import { createApiClient, listProjects } from '@volcano.dev/sdk/api';

const api = createApiClient({ userToken });
await listProjects({ client: api });
api.setCredentials({ userToken: rotatedToken });
```

When an operation accepts multiple credentials, the SDK uses access token, service-role key, then anon key precedence.

## Higher-level helpers

Stateful authentication and hosted redirects:

```ts
const { user, session, error } = await volcano.auth.signIn({
  email: 'user@example.com',
  password: 'secret',
});
```

Database query building:

```ts
type Databases = {
  application: {
    Tables: {
      posts: {
        Row: { id: string; title: string; status: 'draft' | 'published'; created_at: string };
        Insert: { title: string; status?: 'draft' | 'published' };
        Update: { title?: string; status?: 'draft' | 'published' };
      };
    };
  };
};

const typedVolcano = createVolcanoClient<Databases>({ anonKey });
const database = typedVolcano.database('application');
const { data, error, count } = await database
  .from('posts')
  .select('id, title')
  .eq('status', 'published')
  .order('created_at', { ascending: false });
```

Storage and resumable uploads:

```ts
const documents = volcano.storage.from('documents');
await documents.upload('users/123/report.pdf', file);
const { data: blob } = await documents.download('users/123/report.pdf');
```

DNS-based function invocation:

```ts
const result = await volcano.functions.invoke('processor', { body: { action: 'run' } });
```

Function calls also accept custom `headers`, an `AbortSignal`, and a per-call `timeoutMs`. The platform forwards safe custom headers to the function in `event.__volcano_request.headers` while filtering credentials, cookies, and hop-by-hop headers.

Higher-level helpers return `VolcanoApiError` instances with `code`, `details`, `status`, `request`, and `response` fields. Prefer `error.code` for application decisions and `error.message` for display or logs.

Realtime and Next.js middleware remain separate entry points:

```ts
import { VolcanoRealtime } from '@volcano.dev/sdk/realtime';
import { createServerClient, withAuth } from '@volcano.dev/sdk/next/middleware';
```

## CDN / UMD

```html
<script src="https://unpkg.com/@volcano.dev/sdk@2/dist/volcano.umd.js"></script>
<script>
  const volcano = Volcano.createVolcanoClient({ anonKey: 'your-anon-key' });
</script>
```

## Development

```bash
pnpm install
pnpm generate:openapi
pnpm check:openapi
pnpm test:types
pnpm test
pnpm lint
pnpm build
```

Generated source is committed under `src/generated/api`; package consumers never run code generation.

See [docs](./docs/README.md) for authentication, database, storage, functions, realtime, Next.js, TypeScript, and error-handling guides.

## License

Apache-2.0
