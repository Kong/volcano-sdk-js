/** @jest-environment ./__tests__/node-environment.cjs */
import { afterEach, expect, jest, test } from '@jest/globals';
import { ManagementClient } from '../src/index.ts';
import { ManagementTransport } from '../src/management-transport.ts';

const originalFetch = globalThis.fetch;
const repositoryId = 'e7fc4fbf-5bfc-4971-868d-2ea49b712ae4';
const token = 'explicit-management-secret';

afterEach(() => {
  globalThis.fetch = originalFetch;
  jest.restoreAllMocks();
});

test.each([
  ['/git/repositories', 'anon'],
  ['https://other.invalid/git/repositories', 'session'],
  ['/git/../../escape', 'session'],
  ['/git/repositories#fragment', 'session'],
] as const)('internal generated boundary refuses %s with %s authorization', async (path, authorization) => {
  const fetchMock = jest.fn<typeof fetch>();
  globalThis.fetch = fetchMock;
  const transport = new ManagementTransport({ token, apiUrl: 'https://api.example.com/prefix' });
  await expect(transport._generatedFetch(path, {}, authorization)).rejects.toThrow(/management/iu);
  expect(fetchMock).not.toHaveBeenCalled();
});

test.each([204, 205, 304])('buffering preserves a bodyless HTTP %s response and its headers', async (status) => {
  globalThis.fetch = jest
    .fn<typeof fetch>()
    .mockResolvedValue(new Response(null, { status, headers: { 'x-management-test': 'preserved' } }));
  const response = await new ManagementTransport({ token })._generatedFetch('/git/repositories', {}, 'session');
  expect(response.status).toBe(status);
  expect(response.headers.get('x-management-test')).toBe('preserved');
  expect(await response.text()).toBe('');
});

test.each([{ token: 42 }, { token, apiUrl: 42 }, { token, apiUrl: 'https://:password@example.com' }])(
  'invalid runtime constructor options are rejected',
  (options) => {
    expect(() => {
      Reflect.construct(ManagementClient, [options]);
    }).toThrow(Error);
  },
);

test('a per-call invalid timeout fails before the request', async () => {
  const fetchMock = jest.fn<typeof fetch>();
  globalThis.fetch = fetchMock;
  const result = await new ManagementClient({ token }).git.repositories.get(repositoryId, { timeoutMs: 0 });
  expect(result.error).toBeInstanceOf(Error);
  expect(fetchMock).not.toHaveBeenCalled();
});

test.each([null, 'caller reason', 42])('primitive cancellation reason %j is never exposed', async (reason) => {
  const controller = new AbortController();
  controller.abort(reason);
  const result = await new ManagementClient({ token }).git.repositories.get(repositoryId, {
    signal: controller.signal,
  });
  expect(result.error?.message).toBe('Management request failed');
});

test('function cancellation reasons are inspected as data without invocation', async () => {
  const reason = Object.assign(jest.fn(), { status: 429, code: 'retry', retryAfter: 3 });
  const controller = new AbortController();
  controller.abort(reason);
  const result = await new ManagementClient({ token }).git.repositories.get(repositoryId, {
    signal: controller.signal,
  });
  expect(result.error).toMatchObject({ status: 429, code: 'retry', retryAfter: 3 });
  expect(reason).not.toHaveBeenCalled();
});

test.each([{ status: 0, code: 42, retryAfter: Number.NaN }, { status: 600, retryAfter: 'later' }, { status: 1.5 }])(
  'invalid scalar error metadata %j is discarded',
  async (metadata) => {
    globalThis.fetch = jest.fn<typeof fetch>().mockRejectedValue(Object.assign(new Error(token), metadata));
    const result = await new ManagementClient({ token }).git.repositories.get(repositoryId);
    expect(result.error?.message).toBe('Management request failed');
    expect(result.error).not.toHaveProperty('status');
    expect(result.error).not.toHaveProperty('code');
    expect(result.error).not.toHaveProperty('retryAfter');
  },
);
