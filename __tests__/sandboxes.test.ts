/** @jest-environment ./__tests__/node-environment.cjs */
import { afterEach, describe, expect, jest, test } from '@jest/globals';
import { VolcanoAuth } from '../src/index.js';
import { requestOptions, sandboxResult } from '../src/sandbox-request.ts';

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
    expect(bodyJson(request)).toEqual({
      command: 'exit 7',
      preset: 'python3.12',
      region: 'aws-us-east-1',
    });
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
    expect(bodyJson(fetchMock.mock.calls[0])).toEqual({
      preset: 'node22',
      region: 'aws-us-east-1',
    });
    expect(new Headers(fetchMock.mock.calls[0]?.[1]?.headers).get('Idempotency-Key')).toBe(
      requestId,
    );
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
  expect(bodyJson(fetchMock.mock.calls[2])).toEqual({ path: '/workspace/data' });
  const access = await result.data.access(8080);
  expect(bodyJson(fetchMock.mock.calls[3])).toEqual({ port: 8080 });
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

test('lists preset sizes and regions', async () => {
  globalThis.fetch = jest
    .fn<typeof fetch>()
    .mockResolvedValue(
      Response.json({ data: [{ id: 'node22', memory_mb: 1024, regions: ['aws-us-east-1'] }] }),
    );
  const observed1 = await client().sandboxes.presets();
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
  if (result.data === null) {
    throw result.error;
  }
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

test('refreshes and resumes sessions and refuses changed identity', async () => {
  const fetchMock = jest.fn<typeof fetch>().mockResolvedValue(Response.json(snapshot));
  globalThis.fetch = fetchMock;
  const result = await client().sandboxes.get(sessionId);
  if (result.data === null) {
    throw result.error;
  }
  fetchMock.mockResolvedValueOnce(Response.json({ ...snapshot, state: 'suspended' }));
  const observed4 = await result.data.refresh();
  expect(observed4.data).toMatchObject({ state: 'suspended' });
  fetchMock.mockResolvedValueOnce(Response.json(snapshot));
  const observed5 = await result.data.resume();
  expect(observed5.data).toMatchObject({ state: 'running' });
  expect(fetchMock.mock.calls[2]?.[0]).toBe(
    `https://api.test.com/sandbox-sessions/${sessionId}/resume`,
  );
  fetchMock.mockResolvedValueOnce(Response.json({ ...snapshot, id: requestId }));
  const observed6 = await result.data.refresh();
  expect(observed6.error?.message).toBe('Sandbox session identity changed');
});

test('grants and revokes access for one auth user', async () => {
  const fetchMock = jest
    .fn<typeof fetch>()
    .mockImplementation(() => Promise.resolve(new Response(null, { status: 204 })));
  globalThis.fetch = fetchMock;
  const api = client().sandboxes;
  const observed7 = await api.grant(sessionId, requestId, snapshot.expires_at);
  expect(observed7.error).toBeNull();
  expect(bodyJson(fetchMock.mock.calls[0])).toEqual({ expires_at: snapshot.expires_at });
  const observed8 = await api.revoke(sessionId, requestId);
  expect(observed8.error).toBeNull();
  expect(fetchMock.mock.calls[1]?.[1]?.method).toBe('DELETE');
  expect(fetchMock.mock.calls[1]?.[0]).toContain(requestId);
});

test('rejects invalid IDs before sending credentials', async () => {
  const fetchMock = jest.fn<typeof fetch>();
  globalThis.fetch = fetchMock;
  const observed9 = await client().sandboxes.get('../other');
  expect(observed9.error).toBeInstanceOf(TypeError);
  expect(fetchMock).not.toHaveBeenCalled();
});

test.each(['future-state', null])('rejects invalid session state %j', async (state) => {
  globalThis.fetch = jest
    .fn<typeof fetch>()
    .mockResolvedValue(Response.json({ ...snapshot, state }));
  const observed10 = await client().sandboxes.get(sessionId);
  expect(observed10.error).toBeInstanceOf(TypeError);
});

test('disposal of terminated sessions makes no request', async () => {
  const fetchMock = jest
    .fn<typeof fetch>()
    .mockResolvedValue(Response.json({ ...snapshot, state: 'terminated' }));
  globalThis.fetch = fetchMock;
  const result = await client().sandboxes.get(sessionId);
  if (result.data === null) {
    throw result.error;
  }
  await result.data[Symbol.asyncDispose]();
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

test('disposal propagates failures and large file writes fail locally', async () => {
  const fetchMock = jest.fn<typeof fetch>().mockResolvedValue(Response.json(snapshot));
  globalThis.fetch = fetchMock;
  const result = await client().sandboxes.get(sessionId);
  if (result.data === null) {
    throw result.error;
  }
  const observed11 = await result.data.files.write(
    '/workspace/large',
    new Uint8Array(8 * 1024 * 1024 + 1),
  );
  expect(observed11.error).toBeInstanceOf(RangeError);
  expect(fetchMock).toHaveBeenCalledTimes(1);
  fetchMock.mockResolvedValue(Response.json({ error: 'unavailable' }, { status: 503 }));
  await expect(result.data[Symbol.asyncDispose]()).rejects.toMatchObject({ status: 503 });
});

test('rejects malformed command flags', async () => {
  globalThis.fetch = jest
    .fn<typeof fetch>()
    .mockResolvedValue(Response.json({ stdout: '', stderr: '', exit_code: 0, timed_out: 'false' }));
  const observed12 = await client().sandboxes.exec(projectId, 'true', {
    preset: 'node22',
    region: 'aws-us-east-1',
  });
  expect(observed12.error).toBeInstanceOf(TypeError);
});

test('normalizes non-Error failures without exposing arbitrary values', async () => {
  const observed13 = await sandboxResult(
    jest.fn<() => Promise<void>>().mockRejectedValue('secret'),
  );
  expect(observed13).toEqual({ data: null, error: new Error('Sandbox request failed') });
});
test('default request options contain no mutation headers', () => {
  const generated = jest
    .fn<(mode: 'session', headers?: Record<string, string>) => object>()
    .mockReturnValue({});
  requestOptions({ _completeOAuthExchange: () => Promise.resolve(), _generatedOptions: generated });
  expect(generated).toHaveBeenCalledWith('session', {});
});
test('session commands use default execution options', async () => {
  const fetchMock = jest
    .fn<typeof fetch>()
    .mockResolvedValueOnce(Response.json(snapshot))
    .mockResolvedValueOnce(
      Response.json({
        stdout: '',
        stderr: '',
        exit_code: 0,
        timed_out: false,
        stdout_truncated: false,
        stderr_truncated: false,
      }),
    );
  globalThis.fetch = fetchMock;
  const result = await client().sandboxes.get(sessionId);
  if (result.data === null) {
    throw result.error;
  }
  const observed14 = await result.data.exec('true');
  expect(observed14.error).toBeNull();
  expect(new Headers(fetchMock.mock.calls[1]?.[1]?.headers).get('Idempotency-Key')).toMatch(
    /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i,
  );
  expect(bodyJson(fetchMock.mock.calls[1])).toEqual({ command: 'true' });
});
