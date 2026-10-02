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
  timeout: 180_000,
});
const projectId = process.env.VOLCANO_PROJECT_ID;
const { data, error } = await client.sandboxes.exec(projectId, 'python -c "print(42)"', {
  preset: 'python3.12',
  region: 'aws-us-east-1',
});
if (error) throw error;
console.log(data.stdout, data.exitCode);
```

Keep service keys on your backend. Creating and managing sessions requires a platform user or service key. An authenticated project user can access only sessions explicitly granted to that user. Anonymous keys cannot access Sandboxes. Availability depends on your platform's Sandbox rollout.

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

In a runtime with explicit resource management, use `await using session = created.data` after checking the creation result. Leaving the scope requests termination through `Symbol.asyncDispose`. Termination is durable and asynchronous; poll `refresh()` if you need confirmation that the session has stopped.

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

The token is bound to this session and port. Do not append it to URLs. See [Sandbox HTTP access](/platform/guides/sandboxes) for browser redemption and authorization.

## Retry safely

Pass a UUID `requestId` to creation or command execution. Retry the same intent with the same ID after a network failure. Do not reuse the ID for a different command. The SDK does not automatically replay failed commands.

Pass `signal` to cancel waiting. Cancellation does not prove the remote command stopped. Choose a client `timeout` longer than the command timeout plus provisioning time; use sessions for long-running work.

Use either `preset` or a saved template's `sandboxId`, never both. `sandboxes.presets()` lists available preset IDs, memory sizes, and regions. `sandboxes.get(sessionId)` reconnects to an existing session. Backend code can call `grant(sessionId, authUserId, expiresAt)` and `revoke(sessionId, authUserId)` to control user access.
