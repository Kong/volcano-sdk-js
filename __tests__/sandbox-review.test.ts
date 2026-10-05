/** @jest-environment ./__tests__/node-environment.cjs */
import { inspect } from 'node:util';
import { afterEach, expect, jest, test } from '@jest/globals';
import { VolcanoAuth } from '../src/index.ts';

const id = '11111111-1111-4111-8111-111111111111';
const snapshot = { id, project_id: id, region: 'us-east-1', state: 'running', expires_at: '' };
const command = {
  stdout: '',
  stderr: '',
  exit_code: 0,
  timed_out: false,
  stdout_truncated: false,
  stderr_truncated: false,
  session_id: id,
  region: 'us-east-1',
  duration_ms: 0,
};
const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
  jest.restoreAllMocks();
});

test.each([
  [60_000, undefined, 180_000],
  [60_000, 600, 720_000],
  [900_000, 600, 900_000],
])(
  'command requests budget provisioning time: %s/%s',
  async (timeout, timeoutSeconds, expected) => {
    const client = new VolcanoAuth({
      apiUrl: 'https://api.test.com',
      anonKey: 'anon',
      accessToken: 'service',
      timeout,
    });
    const fetchMock = jest.fn<typeof fetch>().mockResolvedValueOnce(Response.json(snapshot));
    globalThis.fetch = fetchMock;
    const session = await client.sandboxes.get(id);
    if (session.data === null) {
      throw session.error;
    }
    const timer = jest.spyOn(globalThis, 'setTimeout');
    const options = timeoutSeconds === undefined ? {} : { timeoutSeconds };
    fetchMock.mockImplementation(() => Promise.resolve(Response.json(command)));
    const result = await session.data.exec('true', options);
    expect(result.error).toBeNull();
    expect(timer).toHaveBeenLastCalledWith(expect.any(Function), expected);
    const executed = await client.sandboxes.exec(id, 'true', {
      ...options,
      preset: 'node22',
      region: 'us-east-1',
    });
    expect(executed.error).toBeNull();
    expect(timer).toHaveBeenLastCalledWith(expect.any(Function), expected);
  },
);

test.each(['terminating', 'terminated'])('disposal skips %s sessions', async (state) => {
  const client = new VolcanoAuth({ anonKey: 'anon', accessToken: 'service' });
  const fetchMock = jest
    .fn<typeof fetch>()
    .mockResolvedValueOnce(Response.json(snapshot))
    .mockResolvedValueOnce(Response.json({ ...snapshot, state }));
  globalThis.fetch = fetchMock;
  const session = await client.sandboxes.get(id);
  if (session.data === null) {
    throw session.error;
  }
  const terminated = await session.data.terminate();
  expect(terminated.error).toBeNull();
  await session.data[Symbol.asyncDispose]();
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

test('disposal accepts an already removed session', async () => {
  const client = new VolcanoAuth({ anonKey: 'anon', accessToken: 'service' });
  globalThis.fetch = jest
    .fn<typeof fetch>()
    .mockResolvedValueOnce(Response.json(snapshot))
    .mockResolvedValueOnce(Response.json({ error: 'not found' }, { status: 404 }));
  const session = await client.sandboxes.get(id);
  if (session.data === null) {
    throw session.error;
  }
  await expect(session.data[Symbol.asyncDispose]()).resolves.toBeUndefined();
});

test('scoped access credentials remain usable but are absent from routine logs', async () => {
  const client = new VolcanoAuth({ anonKey: 'anon', accessToken: 'service' });
  globalThis.fetch = jest
    .fn<typeof fetch>()
    .mockResolvedValueOnce(Response.json(snapshot))
    .mockResolvedValueOnce(
      Response.json({ url: 'https://session.test', token: 'private-access-token', expires_at: '' }),
    );
  const session = await client.sandboxes.get(id);
  if (session.data === null) {
    throw session.error;
  }
  const access = await session.data.access(8080);
  expect(access.data?.token).toBe('private-access-token');
  expect(inspect(access)).not.toContain('private-access-token');
  expect(JSON.stringify(access)).not.toContain('private-access-token');
  expect({ ...access.data }).not.toHaveProperty('token');
});

test('disposal preserves network errors', async () => {
  const client = new VolcanoAuth({ anonKey: 'anon', accessToken: 'service' });
  const failure = new Error('connection failed');
  globalThis.fetch = jest
    .fn<typeof fetch>()
    .mockResolvedValueOnce(Response.json(snapshot))
    .mockRejectedValueOnce(failure);
  const session = await client.sandboxes.get(id);
  if (session.data === null) {
    throw session.error;
  }
  await expect(session.data[Symbol.asyncDispose]()).rejects.toBe(failure);
});
