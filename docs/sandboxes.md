---
title: Sandboxes
description: Run isolated commands, keep a session for multiple steps, and access its files and HTTP services.
---

Run a command in a temporary Sandbox. Volcano terminates the session after the command completes.

```javascript
import { VolcanoClient } from '@volcano.dev/sdk';

const client = new VolcanoClient({
  apiUrl: process.env.VOLCANO_API_URL ?? 'https://api.volcano.dev',
  anonKey: process.env.VOLCANO_ANON_KEY,
  accessToken: process.env.VOLCANO_SERVICE_KEY,
});
const projectId = process.env.VOLCANO_PROJECT_ID;
const { data, error } = await client.sandboxes.exec(projectId, 'python -c "print(42)"', {
  preset: 'python3.12',
  region: 'aws-us-east-1',
});
if (error) throw error;
console.log(data.stdout, data.exitCode);
```

Keep service keys on your backend. Creating and managing sessions requires a platform user or service key. An authenticated project user can access only sessions explicitly granted to that user. Anonymous keys can list the public preset catalog with `sandboxes.presets()`, but cannot create or access sessions. Availability depends on your platform's Sandbox rollout.

A nonzero command exit is returned as `data.exitCode`; it is not a platform error. All methods return `{ data, error }`. Check `error` before using `data`.

## Reuse a session

Creation returns the current state, which may be `starting`. Poll `refresh()` until it becomes `running`; fail on `unknown` or `terminated` and keep polling bounded. Commands require a running session.

```javascript
const created = await client.sandboxes.create(projectId, {
  preset: 'python3.12',
  region: 'aws-us-east-1',
  maxDurationSeconds: 300,
});
if (created.error) throw created.error;
const session = created.data;
try {
  const deadline = Date.now() + 120_000;
  while (session.state !== 'running') {
    if (Date.now() >= deadline || ['unknown', 'terminated'].includes(session.state)) {
      throw new Error(`Session unavailable: ${session.state}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
    const refreshed = await session.refresh();
    if (refreshed.error) throw refreshed.error;
  }
  const written = await session.files.write(
    '/workspace/input.txt',
    new TextEncoder().encode('hello'),
  );
  if (written.error) throw written.error;
  const output = await session.exec('cat /workspace/input.txt');
  if (output.error) throw output.error;
  console.log(output.data.stdout);
} finally {
  const stopped = await session.terminate();
  if (stopped.error) throw stopped.error;
}
```

In a runtime with explicit resource management, use `await using session = created.data` after checking the creation result. Leaving the scope requests termination through `Symbol.asyncDispose`. Disposal skips sessions already terminating or terminated and accepts a 404 for a session already removed. Termination is durable and asynchronous; poll `refresh()` if you need confirmation that the session has stopped.

`session.suspend()` and `session.resume()` request state transitions. Poll for `suspended` or `running` before the next operation. Local suspension preserves processes and files, but the container continues to reserve memory.

## Read files and access HTTP

`session.files.read(path)` returns `Uint8Array`. Writes accept `Uint8Array`; paths stay within the session workspace. Files are limited to 8 MiB.

Start a background HTTP service inside the session, then obtain a short-lived credential for its port:

```javascript
const started = await session.exec('python -m http.server 8080 >/workspace/http.log 2>&1 &');
if (started.error) throw started.error;
const access = await session.access(8080);
if (access.error) throw access.error;
const response = await fetch(access.data.url, {
  headers: { 'X-Volcano-Sandbox-Token': access.data.token },
});
console.log(await response.text());
```

Read the scoped credential through `access.data.token`; it is omitted from JSON serialization and routine object logging. The token is bound to this session and port. Do not append it to URLs. See [Sandbox HTTP access](/platform/guides/sandboxes) for browser redemption and authorization.

## Retry safely

Pass a UUID `requestId` to `sandboxes.create()`, `sandboxes.deploy()`, `sandboxes.exec()`, or `session.exec()`. Other operations accept cancellation through `signal` but do not accept `requestId`. Retry the same intent with the same ID after a network failure. Do not reuse the ID for a different command. The SDK does not automatically replay failed commands.

Pass `signal` to cancel waiting. Cancellation does not prove the remote command stopped. The HTTP timeout budget is the command timeout plus 120 seconds for provisioning, or the configured client timeout if longer. A one-shot command timeout returns HTTP 504; retrying the same request ID returns HTTP 409 and does not rerun it. A session command timeout returns command data with `timedOut: true`. One-shot commands allow up to 60 seconds; session commands allow up to 3600 seconds.

Use either `preset` or a saved template's `sandboxId`, never both. `sandboxes.presets()` lists available preset IDs, memory sizes, and regions. `sandboxes.get(sessionId)` reconnects to an existing session. Backend code can call `grant(sessionId, authUserId, expiresAt)` and `revoke(sessionId, authUserId)` to control user access.

## Deploy custom templates

Build a tar.gz archive containing a root `Dockerfile` fragment and its files.
Volcano supplies the base image and entrypoint; use `RUN`, `COPY`, and `CMD`
instead of `FROM`, `USER`, or `ENTRYPOINT`. Use the backend `client` initialized
above with a service key granting `sandboxes.deployments.write` to deploy and
`sandboxes.deployments.read` to read history, status, source, and logs.

```typescript
const sandboxId = crypto.randomUUID();
const requestId = crypto.randomUUID();
const { readFile } = await import('node:fs/promises');
const source = new Uint8Array(await readFile('./sandbox.tar.gz'));
const { data: deployment, error } = await client.sandboxes.deploy(projectId, sandboxId, source, {
  name: 'my-image',
  memoryMB: 1024,
  ports: [8080],
  requestId,
});
if (error) throw error;
const state = await client.sandboxes.deployment(projectId, sandboxId, deployment.id);
```

`ports` accepts at most 16 unique integers from 1 through 65532.

Keep the same template ID, request ID, source bytes, and options when retrying an
uncertain request. To update an existing template, deploy with its ID and a new
request ID. Wait for `status: 'active'` before creating a session from that
`sandboxId`. Existing sessions retain their original image.

`deployments(projectId, sandboxId, { cursor, limit: 25 })` returns paginated history.
`limit` accepts 1–100 and defaults to 10; use the returned `nextCursor` for the next page.
`source(projectId, sandboxId, deploymentId)` returns the original archive as
`Uint8Array`. Sources may be at most 32 MiB compressed and expanded.

Read regional build output with
`logs(projectId, sandboxId, deploymentId, { region: 'aws-us-east-1', limit: 100 })`.
The response contains `data` events and an optional `nextCursor`; pass it as
`cursor` to read the next page. Failed builds remain visible in deployment history.

## Delete a template

`deleteTemplate(projectId, sandboxId)` retires the template and requests termination
of all its sessions, including running work. The template becomes unavailable for
new sessions. Use this only when you intend to remove the template; to stop one
session while keeping the template, call `session.terminate()` instead.

Call it from backend code with a platform user token or a service key granting
`sandboxes.terminate` in the target project. An anonymous key or an authenticated
project-user session does not authorize template deletion.

```typescript
const deleted = await client.sandboxes.deleteTemplate(projectId, sandboxId);
if (deleted.error) throw deleted.error;
```

A successful response acknowledges the deletion request. Session termination and
resource cleanup finish asynchronously; wait for sessions to reach `terminated`
if your workflow requires confirmation that execution has stopped.
