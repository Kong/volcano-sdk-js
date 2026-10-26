/** @jest-environment ./__tests__/node-environment.cjs */
import { afterEach, describe, expect, jest, test } from '@jest/globals';
import { VolcanoAuth } from '../src/index.ts';
import { bodyJson, projectId, requestCall, requestId, sessionId, snapshot } from './support/sandbox-fixtures.ts';
import { expectPresent } from './support/assertions.ts';

const originalFetch = globalThis.fetch;
function client(): VolcanoAuth {
  return new VolcanoAuth({
    apiUrl: 'https://api.test.com',
    anonKey: 'ak-project',
    accessToken: 'sk-service',
  });
}
afterEach(() => {
  globalThis.fetch = originalFetch;
});

function preservesCommandResults(): void {
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
    expect(bodyJson(request)).toEqual({
      command: 'exit 7',
      preset: 'python3.12',
      region: 'aws-us-east-1',
    });
  });
}

function controlsSessionsWithoutReplay(): void {
  test('returns a session that refreshes state and controls the same id', async () => {
    const fetchMock = jest
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json(snapshot))
      .mockResolvedValueOnce(Response.json({ ...snapshot, state: 'suspended', desired_state: 'suspended' }));
    globalThis.fetch = fetchMock;
    const result = await client().sandboxes.create(projectId, {
      preset: 'node22',
      region: 'aws-us-east-1',
      requestId,
    });
    expect(result.error).toBeNull();
    const handle = result.data;
    expectPresent(handle);
    expect(handle.id).toBe(sessionId);
    expect(bodyJson(fetchMock.mock.calls[0])).toEqual({
      preset: 'node22',
      region: 'aws-us-east-1',
    });
    expect(new Headers(fetchMock.mock.calls[0]?.[1]?.headers).get('Idempotency-Key')).toBe(requestId);
    const suspended = await handle.suspend();
    expect(suspended.error).toBeNull();
    expect(handle.state).toBe('suspended');
    expect(fetchMock.mock.calls[1]?.[0]).toBe(`https://api.test.com/sandbox-sessions/${sessionId}/suspend`);
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
}

describe('Sandboxes facade', () => {
  preservesCommandResults();
  controlsSessionsWithoutReplay();
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
  expect(result.error).toBeNull();
  expectPresent(result.data);
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
  expect(result.error).toBeNull();
  expectPresent(result.data);
  const bytes = new Uint8Array([0, 255, 128]);
  const written = await result.data.files.write('/workspace/data', bytes);
  expect(written.error).toBeNull();
  expect(bodyJson(fetchMock.mock.calls[1])).toEqual({
    path: '/workspace/data',
    data: 'AP+A',
  });
  const read = await result.data.files.read('/workspace/data');
  expect(read.data).toEqual(bytes);
  expect(bodyJson(fetchMock.mock.calls[2])).toEqual({ path: '/workspace/data' });
  const access = await result.data.access(8080);
  expect(bodyJson(fetchMock.mock.calls[3])).toEqual({ port: 8080 });
  expect(access.data?.token).toBe('scoped-token');
  expect(access.data).toEqual({
    url: 'https://session.example',
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

test('lists public presets with only anonymous credentials and cancellation', async () => {
  const fetchMock = jest
    .fn<typeof fetch>()
    .mockResolvedValue(Response.json({ data: [{ id: 'node22', memory_mb: 1024, regions: ['aws-us-east-1'] }] }));
  globalThis.fetch = fetchMock;
  const signal = new AbortController().signal;
  const anonymousClient = new VolcanoAuth({
    apiUrl: 'https://api.test.com',
    anonKey: 'ak-project',
  });
  const observed1 = await anonymousClient.sandboxes.presets({ signal });
  const request = requestCall(fetchMock.mock.calls, 0);
  expect(request[0]).toBe('https://api.test.com/sandboxes/presets');
  expect(new Headers(request[1]?.headers).get('Authorization')).toBe('Bearer ak-project');
  expect(new Headers(request[1]?.headers).has('Idempotency-Key')).toBe(false);
  expect(request[1]?.signal?.aborted).toBe(false);
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(observed1).toEqual({
    data: [{ id: 'node22', memoryMB: 1024, regions: ['aws-us-east-1'] }],
    error: null,
  });
});

test.each([
  null,
  { data: null },
  { data: [{ regions: null }] },
  { data: [{ id: 2, memory_mb: 1024, regions: [] }] },
  { data: [{ id: 'node22', memory_mb: '1024', regions: [] }] },
])('rejects malformed preset responses: %j', async (value) => {
  globalThis.fetch = jest.fn<typeof fetch>().mockResolvedValue(Response.json(value));
  const observed2 = await client().sandboxes.presets();
  expect(observed2.error).toBeInstanceOf(TypeError);
});

test('selects a template and forwards command limits and cancellation', async () => {
  const fetchMock = jest.fn<typeof fetch>().mockResolvedValue(Response.json(snapshot));
  globalThis.fetch = fetchMock;
  const signal = new AbortController().signal;
  const result = await client().sandboxes.create(projectId, {
    sandboxId: requestId,
    region: 'aws-us-east-1',
    memoryMB: 2048,
    signal,
  });
  expect(result.error).toBeNull();
  expect(bodyJson(fetchMock.mock.calls[0])).toEqual({
    sandbox_id: requestId,
    region: 'aws-us-east-1',
    memory_mb: 2048,
  });
  expect(fetchMock.mock.calls[0]?.[1]?.signal?.aborted).toBe(false);
  expect(result.error).toBeNull();
  expectPresent(result.data);
  fetchMock.mockResolvedValue(
    Response.json({
      stdout: 'ok',
      stderr: '',
      exit_code: 0,
      timed_out: false,
      stdout_truncated: true,
      stderr_truncated: true,
    }),
  );
  const observed3 = await result.data.exec('echo ok', {
    timeoutSeconds: 5,
    environment: { A: 'b' },
  });
  expect(observed3.data).toEqual({
    stdout: 'ok',
    stderr: '',
    exitCode: 0,
    timedOut: false,
    stdoutTruncated: true,
    stderrTruncated: true,
  });
  expect(bodyJson(fetchMock.mock.calls[1])).toEqual({
    command: 'echo ok',
    timeout_seconds: 5,
    environment: { A: 'b' },
  });
});
