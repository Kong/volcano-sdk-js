/** @jest-environment ./__tests__/node-environment.cjs */
import { afterEach, expect, jest, test } from '@jest/globals';
import { VolcanoAuth } from '../src/index.ts';
import { requestOptions, sandboxResult } from '../src/sandbox-request.ts';
import { bodyJson, projectId, requestId, sessionId, snapshot } from './support/sandbox-fixtures.ts';
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

test('refreshes and resumes sessions and refuses changed identity', async () => {
  const fetchMock = jest.fn<typeof fetch>().mockResolvedValue(Response.json(snapshot));
  globalThis.fetch = fetchMock;
  const result = await client().sandboxes.get(sessionId);
  expect(result.error).toBeNull();
  expectPresent(result.data);
  fetchMock.mockResolvedValueOnce(Response.json({ ...snapshot, state: 'suspended' }));
  const observed4 = await result.data.refresh();
  expect(observed4.data).toMatchObject({ state: 'suspended' });
  fetchMock.mockResolvedValueOnce(Response.json(snapshot));
  const observed5 = await result.data.resume();
  expect(observed5.data).toMatchObject({ state: 'running' });
  expect(fetchMock.mock.calls[2]?.[0]).toBe(`https://api.test.com/sandbox-sessions/${sessionId}/resume`);
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
  globalThis.fetch = jest.fn<typeof fetch>().mockResolvedValue(Response.json({ ...snapshot, state }));
  const observed10 = await client().sandboxes.get(sessionId);
  expect(observed10.error).toBeInstanceOf(TypeError);
});

test('disposal of terminated sessions makes no request', async () => {
  const fetchMock = jest.fn<typeof fetch>().mockResolvedValue(Response.json({ ...snapshot, state: 'terminated' }));
  globalThis.fetch = fetchMock;
  const result = await client().sandboxes.get(sessionId);
  expect(result.error).toBeNull();
  expectPresent(result.data);
  await result.data[Symbol.asyncDispose]();
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

test('disposal propagates failures and large file writes fail locally', async () => {
  const fetchMock = jest.fn<typeof fetch>().mockResolvedValue(Response.json(snapshot));
  globalThis.fetch = fetchMock;
  const result = await client().sandboxes.get(sessionId);
  expect(result.error).toBeNull();
  expectPresent(result.data);
  const observed11 = await result.data.files.write('/workspace/large', new Uint8Array(8 * 1024 * 1024 + 1));
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
  const observed13 = await sandboxResult(jest.fn<() => Promise<void>>().mockRejectedValue('secret'));
  expect(observed13).toEqual({ data: null, error: new Error('Sandbox request failed') });
});
test('default request options contain no mutation headers', () => {
  const generated = jest
    .fn<
      (mode: 'anon' | 'session', headers?: Record<string, string>, responseType?: 'blob', timeoutMs?: number) => object
    >()
    .mockReturnValue({});
  requestOptions({
    timeout: 60_000,
    _completeOAuthExchange: () => Promise.resolve(),
    _generatedOptions: generated,
  });
  expect(generated).toHaveBeenCalledWith('session', {}, undefined, undefined);
});
test('replayable request options reject a non-UUID idempotency key', () => {
  const generated = jest
    .fn<
      (mode: 'anon' | 'session', headers?: Record<string, string>, responseType?: 'blob', timeoutMs?: number) => object
    >()
    .mockReturnValue({});
  expect(() =>
    requestOptions(
      {
        timeout: 60_000,
        _completeOAuthExchange: () => Promise.resolve(),
        _generatedOptions: generated,
      },
      { requestId: 'retry-1' },
      'replayable',
    ),
  ).toThrow('A Sandbox resource ID must be a UUID');
  expect(generated).not.toHaveBeenCalled();
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
  expect(result.error).toBeNull();
  expectPresent(result.data);
  const observed14 = await result.data.exec('true');
  expect(observed14.error).toBeNull();
  expect(new Headers(fetchMock.mock.calls[1]?.[1]?.headers).get('Idempotency-Key')).toMatch(
    /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/iu,
  );
  expect(bodyJson(fetchMock.mock.calls[1])).toEqual({ command: 'true' });
});
