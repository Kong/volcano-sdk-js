---
title: 'Repository source reads'
description: 'Use an explicit management credential to inspect repositories and resolve exact source revisions.'
---

# Repository source reads

`ManagementClient` reads project-owned Git repositories through the control plane.
It requires a Volcano deployment with the first-class Git read operations; older
deployments may answer `404`. Provider availability is reported through each
repository's capabilities and rechecked when reading source.

Use a project access token with read permission, or a platform token authorized
for the project. Construction performs no requests. The client uses only the
token you supply; it does not sign in, bootstrap an application, refresh a
session, retry a rejected credential, or follow redirects.

```javascript
import { ManagementClient } from '@volcano.dev/sdk';

const client = new ManagementClient({ token: 'your-project-read-token' });
const projectId = '2b248570-5d83-43ae-b751-90b3f420e755';

const page = await client.git.repositories.list(projectId, { limit: 20 });
if (page.error) throw page.error;

for (const repository of page.data.repositories) {
  console.log(repository.id, repository.capabilities);
}
```

All methods return `{ data, error }`. Repository IDs are Volcano UUIDs, independent
of provider repository numbers or names. Repository metadata uses `projectId`,
`createdAt`, `binding.rootDirectory`, `binding.productionBranch`, and capability
`unavailableReason`. A retained identity can have `binding: null`; it does not
promise that its source remains available. Preserve unknown provider, operation,
and unavailable-reason strings.

Pages contain `repositories`, `limit`, `hasMore`, and optional `nextCursor` and
`prevCursor`. Pass `cursor: page.data.nextCursor` to move forward or
`endingBefore: page.data.prevCursor` to move backward, keeping the same project
and limit. Supply one cursor direction at a time.

## Resolve an exact revision

```javascript
const repositoryId = 'e7fc4fbf-5bfc-4971-868d-2ea49b712ae4';
const metadata = await client.git.repositories.get(repositoryId, { projectId });
if (metadata.error) throw metadata.error;

const selected = await client.git.revisions.resolve(projectId, repositoryId, {
  type: 'commit',
  oid: 'cccccccccccccccccccccccccccccccccccccccc',
  witness: { type: 'branch', name: 'release/日本語' },
});
if (selected.error) throw selected.error;

const same = await client.git.revisions.get(selected.data.id, { projectId });
if (same.error) throw same.error;
console.log(same.data.commitOid, same.data.treeOid);
```

Select a branch with `{ type: 'branch', name: 'main' }` or a tag with
`{ type: 'tag', name: 'v1' }`. Names containing slashes remain names. These
selectors cannot include a witness. A commit selector requires a complete
lowercase SHA-1 OID and an explicit branch or tag witness whose observed history
contains that commit. Object availability alone does not prove admission.

A revision contains `id`, `projectId`, `resource`, `commitOid`, and `treeOid`.
Treat `id` as opaque. It identifies a reauthorized read context, not a permanent
Commit resource or retained source. A branch moving does not change its selected
commit. Binding/layout changes, missing provider access, or signing-key retirement
can make the context unavailable. Re-resolving an orphan OID requires a qualifying
witness; the client never substitutes a current head. Reads cover the repository
root; a deployment root directory is not a source-access boundary.

## Request options and errors

The default API URL is `https://api.volcano.dev`. Set `apiUrl` for another
deployment, including an HTTP local endpoint or an optional URL path prefix.
User information, queries, and fragments are rejected in API base URLs.

Set constructor `timeoutMs` or per-call `timeoutMs` to a positive integer up to
2,147,483,647; the default is 60,000. It bounds asynchronous fetch and body reads,
not subsequent CPU parsing. Each call also accepts `signal: AbortSignal`.
Already-canceled calls perform no request.

Errors use constant safe messages and, when supplied, scalar `status`, `code`, and
`retryAfter` metadata. They omit raw response bodies and request objects and
redact the configured token. A `401` returns directly without another credential
or application authentication attempt.
