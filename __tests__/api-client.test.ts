/** @jest-environment node */

import {
  authGetUser,
  authSignin,
  createApiClient,
  healthCheck,
  listProjects,
  listStorageObjects,
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
      (client: ReturnType<typeof createApiClient>) => listProjects({ client }),
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

    const result = await healthCheck({ client });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.data).toEqual({});
  });

  it('normalizes the base URL and sends identifying and custom headers', async () => {
    const fetchMock = jest.fn(async () => successResponse());
    const client = createApiClient({
      baseUrl: ' https://api.example.com/v1/// ',
      fetch: fetchMock,
      headers: { 'X-Application': 'dashboard' },
    });

    await healthCheck({ client });

    const request = fetchMock.mock.calls[0][0] as Request;
    expect(request.url).toBe('https://api.example.com/v1/health');
    expect(request.headers.get('X-Application')).toBe('dashboard');
    expect(request.headers.get('X-Client-Info')).toBe('volcano-sdk-js/2.0.0; runtime=node');
  });

  it('preserves an explicitly configured client information header', async () => {
    const fetchMock = jest.fn(async () => successResponse());
    const client = createApiClient({
      fetch: fetchMock,
      headers: { 'X-Client-Info': 'my-app/1.0.0' },
    });

    await healthCheck({ client });

    const request = fetchMock.mock.calls[0][0] as Request;
    expect(request.headers.get('X-Client-Info')).toBe('my-app/1.0.0');
  });

  it.each([
    ['ftp://api.example.com', 'HTTP or HTTPS'],
    ['https://api.example.com?tenant=one', 'query string or fragment'],
  ])('rejects an invalid base URL: %s', (baseUrl, expectedMessage) => {
    expect(() => createApiClient({ baseUrl })).toThrow(expectedMessage);
  });

  it('cancels requests after the configured timeout', async () => {
    jest.useFakeTimers();
    const fetchMock = jest.fn(
      (request: Request) =>
        new Promise((_resolve, reject) => {
          if (request.signal.aborted) {
            reject(request.signal.reason);
            return;
          }
          request.signal.addEventListener('abort', () => reject(request.signal.reason), {
            once: true,
          });
        }),
    );
    const client = createApiClient({ fetch: fetchMock, timeoutMs: 10 });

    const request = healthCheck({ client });
    await jest.advanceTimersByTimeAsync(10);
    const result = await request;

    expect(result.error).toMatchObject({ name: 'TimeoutError' });
    jest.useRealTimers();
  });

  it('preserves caller cancellation through the timeout wrapper', async () => {
    const fetchMock = jest.fn(
      (request: Request) =>
        new Promise((_resolve, reject) => {
          if (request.signal.aborted) {
            reject(request.signal.reason);
            return;
          }
          request.signal.addEventListener('abort', () => reject(request.signal.reason), {
            once: true,
          });
        }),
    );
    const client = createApiClient({ fetch: fetchMock });
    const controller = new AbortController();

    const pending = healthCheck({ client, signal: controller.signal });
    controller.abort(new DOMException('Cancelled by caller', 'AbortError'));
    const result = await pending;

    expect(result.error).toMatchObject({ message: 'Cancelled by caller', name: 'AbortError' });
  });

  it('clears the timeout for responses without a body', async () => {
    jest.useFakeTimers();
    try {
      let requestSignal: AbortSignal | undefined;
      const fetchMock = jest.fn(async (request: Request) => {
        requestSignal = request.signal;
        return new Response(null, { headers: { 'Content-Length': '0' } });
      });
      const client = createApiClient({ fetch: fetchMock, timeoutMs: 10 });

      await healthCheck({ client });
      await jest.advanceTimersByTimeAsync(10);

      expect(requestSignal?.aborted).toBe(false);
    } finally {
      jest.useRealTimers();
    }
  });

  it('keeps the timeout active while consuming the response body', async () => {
    jest.useFakeTimers();
    try {
      const fetchMock = jest.fn(
        async (request: Request) =>
          new Response(
            new ReadableStream({
              start(controller) {
                request.signal.addEventListener(
                  'abort',
                  () => controller.error(request.signal.reason),
                  { once: true },
                );
              },
            }),
            { headers: { 'Content-Type': 'application/json' } },
          ),
      );
      const client = createApiClient({ fetch: fetchMock, timeoutMs: 10 });

      const pending = healthCheck({ client });
      await jest.advanceTimersByTimeAsync(10);
      const result = await pending;

      expect(result.error).toMatchObject({ name: 'TimeoutError' });
    } finally {
      jest.useRealTimers();
    }
  });

  it('preserves caller cancellation while consuming the response body', async () => {
    const fetchMock = jest.fn(
      async (request: Request) =>
        new Response(
          new ReadableStream({
            start(controller) {
              request.signal.addEventListener(
                'abort',
                () => controller.error(request.signal.reason),
                { once: true },
              );
            },
          }),
          { headers: { 'Content-Type': 'application/json' } },
        ),
    );
    const client = createApiClient({ fetch: fetchMock });
    const controller = new AbortController();

    const pending = healthCheck({ client, signal: controller.signal });
    await Promise.resolve();
    controller.abort(new DOMException('Cancelled while reading', 'AbortError'));
    const result = await pending;

    expect(result.error).toMatchObject({
      message: 'Cancelled while reading',
      name: 'AbortError',
    });
  });
});
