/** @jest-environment node */

import {
  authGetUser,
  authSignin,
  createApiClient,
  listStorageObjects,
  searchProjectLogs,
} from '../src/api';

const successResponse = () => ({
  headers: new Headers({ 'Content-Type': 'application/json' }),
  ok: true,
  status: 200,
  text: async () => '{}',
});

const authorizationHeader = (fetchMock: jest.Mock): string | null => {
  const request = fetchMock.mock.calls[0][0] as Request;
  return request.headers.get('Authorization');
};

describe('createApiClient', () => {
  it.each([
    [
      'AnonKey',
      { anonKey: 'anon-token' },
      (client: ReturnType<typeof createApiClient>) =>
        authSignin({ client, body: { email: 'user@example.com', password: 'password' } }),
      'anon-token',
    ],
    [
      'AuthUserAccessToken',
      { accessToken: 'access-token' },
      (client: ReturnType<typeof createApiClient>) => authGetUser({ client }),
      'access-token',
    ],
    [
      'ServiceRoleKey',
      { serviceRoleKey: 'service-role-token' },
      (client: ReturnType<typeof createApiClient>) =>
        listStorageObjects({ client, path: { bucketName: 'documents' } }),
      'service-role-token',
    ],
    [
      'UserToken',
      { userToken: 'user-token' },
      (client: ReturnType<typeof createApiClient>) =>
        searchProjectLogs({
          body: { resource: { type: 'function' } },
          client,
          path: { id: 'project-id' },
        }),
      'user-token',
    ],
  ])(
    'routes the %s security scheme by its OpenAPI key',
    async (_name, credentials, call, token) => {
      const fetchMock = jest.fn(async () => successResponse());
      const client = createApiClient({ ...credentials, fetch: fetchMock });

      await call(client);

      expect(authorizationHeader(fetchMock)).toBe(`Bearer ${token}`);
    },
  );

  it.each([
    [{ anonKey: 'anon-token' }, 'anon-token'],
    [{ anonKey: 'anon-token', serviceRoleKey: 'service-role-token' }, 'service-role-token'],
    [
      {
        accessToken: 'access-token',
        anonKey: 'anon-token',
        serviceRoleKey: 'service-role-token',
      },
      'access-token',
    ],
  ])('uses access-token, service-role, then anon precedence', async (credentials, token) => {
    const fetchMock = jest.fn(async () => successResponse());
    const client = createApiClient({ ...credentials, fetch: fetchMock });

    await listStorageObjects({ client, path: { bucketName: 'documents' } });

    expect(authorizationHeader(fetchMock)).toBe(`Bearer ${token}`);
  });

  it('rotates credentials without replacing the client instance', async () => {
    const fetchMock = jest.fn(async () => successResponse());
    const client = createApiClient({ accessToken: 'old-token', fetch: fetchMock });

    client.setCredentials({ accessToken: 'new-token' });
    await authGetUser({ client });

    expect(authorizationHeader(fetchMock)).toBe('Bearer new-token');
  });

  it('uses the configured fetch implementation', async () => {
    const fetchMock = jest.fn(async () => successResponse());
    const client = createApiClient({ fetch: fetchMock });

    const result = await authSignin({
      body: { email: 'user@example.com', password: 'password' },
      client,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.data).toEqual({});
  });

  it('cancels requests after the configured timeout', async () => {
    jest.useFakeTimers();
    const fetchMock = jest.fn(
      (request: Request) =>
        new Promise((_resolve, reject) => {
          request.signal.addEventListener('abort', () => reject(request.signal.reason), {
            once: true,
          });
        }),
    );
    const client = createApiClient({ fetch: fetchMock, timeoutMs: 10 });

    const request = authSignin({
      body: { email: 'user@example.com', password: 'password' },
      client,
    });
    await jest.advanceTimersByTimeAsync(10);
    const result = await request;

    expect(result.error).toMatchObject({ name: 'TimeoutError' });
    jest.useRealTimers();
  });
});
