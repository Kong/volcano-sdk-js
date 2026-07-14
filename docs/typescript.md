# TypeScript

The package ships declarations generated from its TypeScript entry-point sources. The root, generated API, realtime, and Next.js middleware subpaths all provide declarations for both ESM and CommonJS consumers.

## Client types

```ts
import {
  createVolcanoClient,
  type VolcanoClient,
  type VolcanoClientConfig,
} from '@volcano.dev/sdk';

const config: VolcanoClientConfig = {
  baseUrl: 'https://api.volcano.dev',
  anonKey: process.env.VOLCANO_ANON_KEY,
};

const volcano: VolcanoClient = createVolcanoClient(config);
```

## Generated API types

Every OpenAPI schema and operation input/output type is exported from `@volcano.dev/sdk/api`.

```ts
import {
  listProjects,
  type ListProjectsData,
  type ListProjectsResponse,
  type Project,
} from '@volcano.dev/sdk/api';

const options: ListProjectsData['query'] = { limit: 20 };
const result = await listProjects({ client: volcano.api, query: options });

if (result.data) {
  const projects: Project[] = result.data.data;
}
```

Generated operations retain the non-throwing result shape. Narrow on `error` or `data` before using the payload.

## Typed database schemas

```ts
type Databases = {
  application: {
    Tables: {
      posts: {
        Row: {
          id: string;
          title: string;
          status: 'draft' | 'published';
          created_at: string;
        };
        Insert: { title: string; status?: 'draft' | 'published' };
        Update: { title?: string; status?: 'draft' | 'published' };
      };
    };
  };
};

const typedVolcano = createVolcanoClient<Databases>(config);
const database = typedVolcano.database('application');
const { data, error } = await database
  .from('posts')
  .select('id, title, status, created_at')
  .eq('status', 'published');
```

## Storage and functions

```ts
import type { StorageObject } from '@volcano.dev/sdk/api';

const upload = await volcano.storage.from('documents').upload('reports/annual.pdf', file);
const object: StorageObject | null = upload.data;

const invocation = await volcano.functions.invoke<{ accepted: boolean }>('processor', {
  body: { action: 'run' },
});
```

## Separate entry points

```ts
import {
  VolcanoRealtime,
  type PostgresChange,
  type RealtimeConfig,
} from '@volcano.dev/sdk/realtime';
import { createServerClient, type ServerClientConfig } from '@volcano.dev/sdk/next/middleware';
```

The root package does not re-export realtime or middleware code, which keeps those dependencies out of unrelated bundles.
