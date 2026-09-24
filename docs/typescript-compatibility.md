---
title: 'TypeScript compatibility'
description: 'Handle optional response fields accurately when upgrading the SDK.'
---

The SDK generates its public declarations from the TypeScript implementation.
JavaScript entrypoints and returned values are unchanged. Nine response types
now describe values the runtime already returned; strict TypeScript consumers
may need to check for missing fields:

```typescript
import { VolcanoClient } from '@volcano.dev/sdk';

const volcano = new VolcanoClient({ anonKey: 'your-anon-key' });
const { user, error } = await volcano.auth.getUser();
if (error) throw error;
if (user?.created_at !== undefined) {
  console.log(new Date(user.created_at));
}
```

| Response type          | Corrected fields                                                                                                                           |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `User`                 | `created_at` and `updated_at` are optional. `status` remains optional.                                                                     |
| `Session`              | `refresh_token` can be `undefined` for HttpOnly cookie sessions.                                                                           |
| `SessionsResponse`     | `sessions`, `total`, `page`, `limit`, and `total_pages` can be `undefined` when omitted by the server.                                     |
| `AuthSession`          | `created_at` and `updated_at` are optional.                                                                                                |
| `OAuthProvider`        | `provider`, `linked_at`, and `updated_at` are optional. Returned provider names are strings; OAuth input names retain their existing enum. |
| `LinkProviderResponse` | `authorization_url` is optional.                                                                                                           |
| `OAuthTokenResponse`   | `message`, `provider`, and `expiresIn` can be `undefined`, in addition to their existing nullable types.                                   |
| `StorageObject`        | `created_at` and `updated_at` are optional; `owner_id` can also be `null`.                                                                 |
| `EmailChangeResponse`  | `emailChangeToken` can be explicitly `undefined`, including with `exactOptionalPropertyTypes`.                                             |

Check the fields your application needs before using them. Error responses keep
their existing `null` values; missing successful fields are not replaced with
invented defaults. Public method arguments, generic parameters, aliases, and
package entrypoints retain their existing signatures.
