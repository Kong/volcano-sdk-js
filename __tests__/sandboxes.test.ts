/** @jest-environment ./__tests__/node-environment.cjs */
import { afterEach, describe, expect, jest, test } from '@jest/globals';
import { VolcanoAuth } from '../src/index.js';

const projectId = '11111111-1111-4111-8111-111111111111';
const sessionId = '22222222-2222-4222-8222-222222222222';
const requestId = '33333333-3333-4333-8333-333333333333';
const originalFetch = globalThis.fetch;
const snapshot = {
  id: sessionId,
  project_id: projectId,
  sandbox_id: requestId,
  state: 'running',
  desired_state: 'running',
  region: 'aws-us-east-1',
  memory_mb: 1024,
  created_at: '2026-09-24T00:00:00Z',
  expires_at: '2026-09-24T01:00:00Z',
};
function client() {
  return new VolcanoAuth({
    apiUrl: 'https://api.test.com',
    anonKey: 'ak-project',
    accessToken: 'sk-service',
  });
}
function bodyJson(call: Parameters<typeof fetch> | undefined): unknown {
  const body = call?.[1]?.body;
  if (typeof body !== 'string') {
    throw new TypeError('Expected JSON request body');
  }
  return JSON.parse(body);
}
function requestCall(calls: Parameters<typeof fetch>[], index: number): Parameters<typeof fetch> {
  const call = calls[index];
  if (call === undefined) {
    throw new Error('Missing request');
  }
  return call;
}
afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('Sandboxes facade', () => {
  test('preserves command output and explicitly supplied replay key', async () => {
    const fetchMock = jest.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        stdout: 'out',
        stderr: 'err',
        exit_code: 7,
        timed_out: false,
        stdout_truncated: false,
        stderr_truncated: false,
        session_id: sessionId,
        region: 'aws-us-east-1',
        duration_ms: 10,
      }),
    );
    globalThis.fetch = fetchMock;
    const result = await client().sandboxes.exec(projectId, 'exit 7', {
      preset: 'python3.12',
      region: 'aws-us-east-1',
      requestId,
    });
    expect(result.error).toBeNull();
    expect(result.data).toMatchObject({ stdout: 'out', stderr: 'err', exitCode: 7 });
    const request = fetchMock.mock.calls[0];
    expect(request?.[0]).toBe(`https://api.test.com/projects/${projectId}/sandbox-executions`);
    expect(new Headers(request?.[1]?.headers).get('Idempotency-Key')).toBe(requestId);
  });
  test('returns a session that refreshes state and controls the same id', async () => {
    const fetchMock = jest
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json(snapshot))
      .mockResolvedValueOnce(
        Response.json({ ...snapshot, state: 'suspended', desired_state: 'suspended' }),
      );
    globalThis.fetch = fetchMock;
    const result = await client().sandboxes.create(projectId, {
      preset: 'node22',
      region: 'aws-us-east-1',
      requestId,
    });
    expect(result.error).toBeNull();
    const handle = result.data;
    if (handle === null) {
      throw result.error;
    }
    expect(handle.id).toBe(sessionId);
    const suspended = await handle.suspend();
    expect(suspended.error).toBeNull();
    expect(handle.state).toBe('suspended');
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      `https://api.test.com/sandbox-sessions/${sessionId}/suspend`,
    );
  });
  test('does not replay a failed command automatically', async () => {
    const fetchMock = jest
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ error: 'outcome unknown' }, { status: 409 }));
    globalThis.fetch = fetchMock;
    const result = await client().sandboxes.exec(projectId, 'increment', {
      preset: 'python3.12',
      region: 'aws-us-east-1',
      requestId,
    });
    expect(result.error).toMatchObject({ status: 409 });
    expect(result.data).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

test('passes session lifetime controls and terminates on async disposal', async () => {
  const fetchMock = jest
    .fn<typeof fetch>()
    .mockResolvedValueOnce(Response.json(snapshot))
    .mockResolvedValueOnce(Response.json({ ...snapshot, state: 'terminating' }));
  globalThis.fetch = fetchMock;
  const result = await client().sandboxes.create(projectId, {
    preset: 'python3.12',
    region: 'aws-us-east-1',
    maxDurationSeconds: 300,
    idleTimeoutSeconds: 60,
  });
  expect(bodyJson(fetchMock.mock.calls[0])).toMatchObject({
    max_duration_seconds: 300,
    idle_timeout_seconds: 60,
  });
  if (result.data === null) {
    throw result.error;
  }
  await result.data[Symbol.asyncDispose]();
  const disposal = requestCall(fetchMock.mock.calls, 1);
  expect(disposal[0]).toBe(`https://api.test.com/sandbox-sessions/${sessionId}`);
  expect(disposal[1]?.method).toBe('DELETE');
});

test('preserves binary files and returns a scoped HTTP credential', async () => {
  const fetchMock = jest
    .fn<typeof fetch>()
    .mockResolvedValueOnce(Response.json(snapshot))
    .mockResolvedValueOnce(new Response(null, { status: 204 }))
    .mockResolvedValueOnce(Response.json({ data: 'AP+A' }))
    .mockResolvedValueOnce(
      Response.json({
        url: 'https://session.example',
        token: 'scoped-token',
        expires_at: snapshot.expires_at,
      }),
    );
  globalThis.fetch = fetchMock;
  const result = await client().sandboxes.get(sessionId);
  if (result.data === null) {
    throw result.error;
  }
  const bytes = new Uint8Array([0, 255, 128]);
  const written = await result.data.files.write('/workspace/data', bytes);
  expect(written.error).toBeNull();
  expect(bodyJson(fetchMock.mock.calls[1])).toEqual({
    path: '/workspace/data',
    data: 'AP+A',
  });
  const read = await result.data.files.read('/workspace/data');
  expect(read.data).toEqual(bytes);
  const access = await result.data.access(8080);
  expect(access.data).toEqual({
    url: 'https://session.example',
    token: 'scoped-token',
    expiresAt: snapshot.expires_at,
  });
});

test('rejects invalid selectors before issuing a request', async () => {
  const fetchMock = jest.fn<typeof fetch>();
  globalThis.fetch = fetchMock;
  const result = await client().sandboxes.create(projectId, { region: 'aws-us-east-1' });
  expect(result.error).toBeInstanceOf(TypeError);
  expect(fetchMock).not.toHaveBeenCalled();
});
