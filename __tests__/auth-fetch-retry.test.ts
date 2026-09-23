/** @jest-environment node */
import { afterEach, expect, jest, test } from '@jest/globals';
import { fetchWithAuthRetry } from '../src/auth-fetch-retry.ts';
import { AuthRefreshDiscardedError } from '../src/errors.ts';

afterEach(() => {
  jest.restoreAllMocks();
});

function authClient() {
  const context = { accessToken: 'original' };
  return {
    timeout: 1000,
    accessToken: 'original',
    _completeOAuthExchange: jest.fn(() => Promise.resolve()),
    _captureAuthContext: jest.fn(() => context),
    _refreshSessionForContext: jest.fn(
      (): Promise<{ error: Error | null }> => Promise.resolve({ error: null }),
    ),
    _isAuthContextCurrent: jest.fn(() => true),
  };
}

test('sends the captured token and leaves a successful response alone', async () => {
  const client = authClient();
  const response = new Response('ok', { status: 200 });
  const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue(response);

  expect(
    await fetchWithAuthRetry(client, 'https://api.example.com/item', {
      headers: { 'X-Request-Id': 'request-1', Authorization: 'Bearer unrelated' },
    }),
  ).toBe(response);
  expect(client._completeOAuthExchange).toHaveBeenCalledTimes(1);
  expect(client._refreshSessionForContext).not.toHaveBeenCalled();
  expect(new Headers(fetchMock.mock.calls[0]?.[1]?.headers).get('Authorization')).toBe(
    'Bearer original',
  );
  expect(new Headers(fetchMock.mock.calls[0]?.[1]?.headers).get('X-Request-Id')).toBe('request-1');
});

const headerCases: [HeadersInit, string][] = [
  [
    new Headers({ authorization: 'Bearer unrelated', 'X-Request-Id': 'header-object' }),
    'header-object',
  ],
  [
    [
      ['authorization', 'Bearer unrelated'],
      ['X-Request-Id', 'header-tuples'],
    ],
    'header-tuples',
  ],
];

test.each(headerCases)(
  'normalizes non-record headers while retaining the captured token',
  async (headers, expectedRequestId) => {
    const fetchMock = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('ok', { status: 200 }));

    await fetchWithAuthRetry(authClient(), 'https://api.example.com/item', { headers });

    const actual = new Headers(fetchMock.mock.calls[0]?.[1]?.headers);
    expect(actual.get('Authorization')).toBe('Bearer original');
    expect(actual.get('X-Request-Id')).toBe(expectedRequestId);
  },
);

test('retries one 401 with the refreshed token on the same session', async () => {
  const client = authClient();
  client._refreshSessionForContext.mockImplementation(() => {
    client.accessToken = 'renewed';
    return Promise.resolve({ error: null });
  });
  const first = new Response(null, { status: 401 });
  const second = new Response('ok', { status: 200 });
  const fetchMock = jest
    .spyOn(globalThis, 'fetch')
    .mockResolvedValueOnce(first)
    .mockResolvedValueOnce(second);

  expect(await fetchWithAuthRetry(client, 'https://api.example.com/item')).toBe(second);
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(new Headers(fetchMock.mock.calls[0]?.[1]?.headers).get('Authorization')).toBe(
    'Bearer original',
  );
  expect(new Headers(fetchMock.mock.calls[1]?.[1]?.headers).get('Authorization')).toBe(
    'Bearer renewed',
  );
});

test('returns the original 401 when refresh fails without replacing the session', async () => {
  const client = authClient();
  client._refreshSessionForContext.mockResolvedValue({ error: new Error('refresh failed') });
  const first = new Response(null, { status: 401 });
  const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue(first);

  expect(await fetchWithAuthRetry(client, 'https://api.example.com/item')).toBe(first);
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

test('propagates a discarded refresh without retrying the request', async () => {
  const client = authClient();
  const discarded = new AuthRefreshDiscardedError();
  client._refreshSessionForContext.mockResolvedValue({ error: discarded });
  const fetchMock = jest
    .spyOn(globalThis, 'fetch')
    .mockResolvedValue(new Response(null, { status: 401 }));

  await expect(fetchWithAuthRetry(client, 'https://api.example.com/item')).rejects.toBe(discarded);
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

test('refuses a successful refresh after the captured session changes', async () => {
  const client = authClient();
  client._isAuthContextCurrent.mockReturnValue(false);
  const fetchMock = jest
    .spyOn(globalThis, 'fetch')
    .mockResolvedValue(new Response(null, { status: 401 }));

  await expect(fetchWithAuthRetry(client, 'https://api.example.com/item')).rejects.toBeInstanceOf(
    AuthRefreshDiscardedError,
  );
  expect(fetchMock).toHaveBeenCalledTimes(1);
});
