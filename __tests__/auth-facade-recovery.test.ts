/** @jest-environment ./__tests__/node-environment.cjs */
import { describe, expect, it, jest } from '@jest/globals';
import { AuthSessionChangedError, VolcanoAuth } from '../src/index.ts';
import { fetchCall, fetchUrl, jsonField, reply, resultError } from './auth-concurrency-fixtures.ts';
import { sessionToken } from './session-fixtures.ts';

const fetchMock = jest.mocked(globalThis.fetch);

const SESSION = '00000000-0000-4000-8000-000000000010';
const OTHER = '00000000-0000-4000-8000-000000000011';
const renewed = () =>
  reply(200, {
    access_token: sessionToken(SESSION, true),
    refresh_token: 'refresh-2',
    expires_in: 3600,
    user: { id: 'user', email: 'user@example.com', status: 'active' },
  });
const replacement = {
  access_token: sessionToken(OTHER),
  refresh_token: 'other-refresh',
  user: { id: 'other', email: 'other@example.com', status: 'active' },
} as const;
const cases: readonly [
  string,
  (client: VolcanoAuth) => Promise<{ error: unknown }>,
  number,
  unknown,
][] = [
  ['request email', (c) => c.auth.requestEmailChange('new@example.com'), 200, {}],
  ['cancel email', (c) => c.auth.cancelEmailChange(), 200, {}],
  [
    'list sessions',
    (c) => c.auth.getSessions({ page: 2, limit: 10 }),
    200,
    { sessions: [], total: 0, page: 2, limit: 10, total_pages: 0 },
  ],
  ['delete others', (c) => c.auth.deleteAllOtherSessions(), 204, {}],
  ['delete session', (c) => c.auth.deleteSession(OTHER), 204, {}],
  ['providers', (c) => c.auth.getLinkedOAuthProviders(), 200, { providers: [] }],
  [
    'link',
    (c) => c.auth.linkOAuthProvider('github'),
    200,
    { authorization_url: 'https://provider.example' },
  ],
  ['unlink', (c) => c.auth.unlinkOAuthProvider('github'), 204, {}],
  [
    'token',
    (c) => c.auth.getOAuthProviderToken('github'),
    200,
    { message: 'ready', provider: 'github', expires_in: 3600 },
  ],
  [
    'refresh token',
    (c) => c.auth.refreshOAuthToken('github'),
    200,
    { message: 'refreshed', provider: 'github', expires_in: 3600 },
  ],
  [
    'provider API',
    (c) =>
      c.auth.callOAuthAPI('github', {
        endpoint: '/user',
        method: 'POST',
        body: { name: 'original' },
      }),
    200,
    { data: { ok: true } },
  ],
];
function client() {
  return new VolcanoAuth({
    apiUrl: 'https://api.test',
    anonKey: 'anon',
    accessToken: sessionToken(SESSION),
    refreshToken: 'refresh-1',
  });
}

describe.each(cases)('%s recovery', (_name, invoke, status, body) => {
  it.each(['json', 'empty', 'html'])(
    'replays the captured request after %s401',
    async (rejection) => {
      const denied = reply(401, { error: 'expired' });
      if (rejection !== 'json') {
        jest.spyOn(denied, 'json').mockRejectedValue(new SyntaxError(rejection));
      }
      fetchMock
        .mockResolvedValueOnce(denied)
        .mockResolvedValueOnce(renewed())
        .mockResolvedValueOnce(reply(status, body));
      const current = client();
      expect(await resultError(invoke(current))).toBeNull();
      expect(
        fetchMock.mock.calls.map(([, options]) =>
          new Headers(options?.headers).get('Authorization'),
        ),
      ).toEqual([
        `Bearer ${sessionToken(SESSION)}`,
        'Bearer anon',
        `Bearer ${sessionToken(SESSION, true)}`,
      ]);
      expect(fetchCall(0)[0]).toBe(fetchCall(2)[0]);
      expect(fetchCall(0)[1]?.body).toBe(fetchCall(2)[1]?.body);
    },
  );

  it('bounds repeated401 to one refresh', async () => {
    fetchMock
      .mockResolvedValueOnce(reply(401))
      .mockResolvedValueOnce(renewed())
      .mockResolvedValueOnce(reply(401));
    expect(await resultError(invoke(client()))).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it.each(['transport', '503'])('does not retry %s failures', async (failure) => {
    if (failure === 'transport') {
      fetchMock.mockRejectedValue(new Error('response lost'));
    } else {
      fetchMock.mockResolvedValue(reply(503));
    }
    expect(await resultError(invoke(client()))).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('preserves explicit replacement during the request', async () => {
    const current = client();
    fetchMock.mockImplementation(async () => {
      await current.auth.setSession(replacement);
      return reply(401);
    });
    expect(await resultError(invoke(current))).toMatchObject({ status: 409 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(current.accessToken).toBe(replacement.access_token);
  });

  it('captures ownership before yielding to a replacement session', async () => {
    const current = client();
    fetchMock.mockResolvedValue(reply(status, body));
    const request = invoke(current);
    await current.auth.setSession(replacement);
    expect(await resultError(request)).toBeInstanceOf(AuthSessionChangedError);
    for (const [, options] of fetchMock.mock.calls) {
      expect(new Headers(options?.headers).get('Authorization')).toBe(
        `Bearer ${sessionToken(SESSION)}`,
      );
    }
  });
});

it('captures ownership before serializing a provider API body', async () => {
  const current = client();
  fetchMock.mockResolvedValue(reply(200, { data: {} }));
  const body: Record<string, string> = {};
  Object.defineProperty(body, 'toJSON', {
    value() {
      void current.auth.setSession(replacement);
      return { name: 'original' };
    },
  });
  const result = await current.auth.callOAuthAPI('github', { endpoint: '/user', body });
  expect(result.error).toBeInstanceOf(AuthSessionChangedError);
  expect(fetchMock).not.toHaveBeenCalled();
});

describe.each(['updateUser', 'convertAnonymous'] as const)('%s profile ownership', (method) => {
  it.each(['getter', 'toJSON'])('captures ownership before a profile %s', async (boundary) => {
    const current = client();
    fetchMock.mockResolvedValue(reply(200, { user: { id: 'other' } }));
    const replaceSession = () => {
      void current.auth.setSession(replacement);
      return { name: 'original' };
    };
    const options =
      boundary === 'getter'
        ? {
            email: 'replacement@example.com',
            password: 'synthetic',
            get metadata() {
              return replaceSession();
            },
          }
        : {
            email: 'replacement@example.com',
            password: 'synthetic',
            metadata: Object.defineProperty({}, 'toJSON', { value: replaceSession }),
          };
    const result = await current.auth[method](options);
    expect(result.error).toBeInstanceOf(AuthSessionChangedError);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

it('captures ownership before serializing email confirmation', async () => {
  const current = client();
  fetchMock.mockResolvedValue(reply(200, { user: { id: 'other' } }));
  const token = Object.assign('confirmation', {
    toJSON() {
      void current.auth.setSession(replacement);
      return 'confirmation';
    },
  });
  const result = await current.auth.confirmEmailChange(token);
  expect(result.error).toBeInstanceOf(AuthSessionChangedError);
  expect(fetchMock).not.toHaveBeenCalled();
});

it('captures ownership after an OAuth exchange settles without another auth call', async () => {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const storage = (initial: Record<string, string>) => {
    const items = new Map(Object.entries(initial));
    return {
      getItem: (key: string): string | null => items.get(key) ?? null,
      setItem(key: string, value: string): void {
        items.set(key, value);
      },
      removeItem(key: string): void {
        items.delete(key);
      },
    };
  };
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      document: {},
      location: {
        href: 'https://app.example.com/auth/callback?code=one-time&state=oauth-nonce',
        origin: 'https://app.example.com',
        hash: '',
        pathname: '/auth/callback',
        search: '?code=one-time&state=oauth-nonce',
      },
      history: { state: null, replaceState: jest.fn() },
      localStorage: storage({}),
      sessionStorage: storage({
        volcano_auth_state: 'oauth-nonce',
        volcano_auth_redirect_url: 'https://app.example.com/auth/callback',
      }),
    },
  });
  try {
    fetchMock.mockResolvedValueOnce(renewed()).mockResolvedValue(reply(200));
    const current = new VolcanoAuth({ apiUrl: 'https://api.test', anonKey: 'anon' });
    // Await the constructor exchange itself without asking an auth API to drain it.
    await current._oauthExchangePromise;
    const request = current.auth.requestEmailChange('original@example.com');
    await current.auth.setSession(replacement);
    expect(await resultError(request)).toBeInstanceOf(AuthSessionChangedError);
    for (const [, options] of fetchMock.mock.calls.slice(1)) {
      expect(new Headers(options?.headers).get('Authorization')).toBe(
        `Bearer ${sessionToken(SESSION, true)}`,
      );
    }
  } finally {
    if (originalWindow === undefined) {
      Reflect.deleteProperty(globalThis, 'window');
    } else {
      Object.defineProperty(globalThis, 'window', originalWindow);
    }
  }
});

it('replays a provider API body snapshot after refresh', async () => {
  const current = client();
  const body = { names: ['original'] };
  fetchMock
    .mockImplementationOnce(() => {
      body.names.push('changed');
      return Promise.resolve(reply(401));
    })
    .mockResolvedValueOnce(renewed())
    .mockResolvedValueOnce(reply(200, { data: {} }));
  expect(
    await resultError(current.auth.callOAuthAPI('github', { endpoint: '/user', body })),
  ).toBeNull();
  expect(jsonField(fetchCall(2)[1], 'body')).toEqual({ names: ['original'] });
});

it('clears the current session after refreshing an authenticated deletion', async () => {
  const current = client();
  fetchMock
    .mockResolvedValueOnce(reply(401))
    .mockResolvedValueOnce(renewed())
    .mockResolvedValueOnce(reply(204));
  expect(await resultError(current.auth.deleteSession(SESSION))).toBeNull();
  expect(current.accessToken).toBeNull();
});

it('captures ownership before reading session-list options', async () => {
  const current = client();
  fetchMock.mockResolvedValue(reply(200, { sessions: [] }));
  const options = {
    get page() {
      void current.auth.setSession(replacement);
      return 2;
    },
  };
  const result = await current.auth.getSessions(options);
  expect(result.error).toBeInstanceOf(AuthSessionChangedError);
  expect(fetchMock).not.toHaveBeenCalled();
});

it.each(['sign out', 'rejected refresh'])(
  'rejects another-session deletion after local clearing by %s',
  async (clearing) => {
    const current = client();
    let clearingResult: { error: { status?: number } | null } | undefined;
    fetchMock.mockImplementation(async (url) => {
      if (fetchUrl(url).endsWith('/auth/refresh')) {
        return reply(401, { error: 'expired refresh' });
      }
      if (fetchUrl(url).endsWith(OTHER)) {
        clearingResult = await (clearing === 'sign out'
          ? current.auth.signOut()
          : current.auth.refreshSession());
      }
      return reply(204);
    });
    expect(await resultError(current.auth.deleteSession(OTHER))).toBeInstanceOf(
      AuthSessionChangedError,
    );
    expect(clearingResult?.error?.status ?? null).toBe(clearing === 'sign out' ? null : 401);
    expect(current.accessToken).toBeNull();
  },
);
