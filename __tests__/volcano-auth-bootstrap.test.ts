/** @jest-environment ./__tests__/node-environment.cjs */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { AuthRefreshDiscardedError, AuthSessionChangedError, VolcanoAuth } from '../src/index.js';
import type { CompleteSession, User } from '../src/sdk-public-types.ts';
import { deferred, reply, signal, within } from './auth-concurrency-fixtures.ts';
import { sessionToken } from './session-fixtures.ts';

function base64UrlEncode(value: string): string {
  return Buffer.from(value)
    .toString('base64')
    .replaceAll('=', '')
    .replaceAll('+', '-')
    .replaceAll('/', '_');
}

function createTestJwtToken(projectId: string, extraClaims: Record<string, unknown> = {}): string {
  const header = base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = base64UrlEncode(JSON.stringify({ project_id: projectId, ...extraClaims }));
  return `${header}.${payload}.test-signature`;
}

const fetchMock = jest.mocked(globalThis.fetch);

// Match the prior jsdom suite: its JSON clone path keeps metadata in Jest's realm.
Object.defineProperty(globalThis, 'structuredClone', { configurable: true, value: undefined });

function required<Value>(value: Value | null | undefined): Value {
  if (value === null || value === undefined) {
    throw new Error('Expected value to be present');
  }
  return value;
}

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') {
    return input;
  }
  return input instanceof URL ? input.href : input.url;
}

async function deferRequest<Result>(invoke: () => Promise<Result>) {
  const response = deferred<Response>();
  const started = signal();
  fetchMock.mockImplementationOnce(() => {
    started.resolve();
    return response.promise;
  });
  const operation = invoke();
  const state = await within(
    Promise.race([
      started.promise.then(() => 'started' as const),
      operation.then(
        () => 'completed' as const,
        (error: unknown) => {
          throw error;
        },
      ),
    ]),
    'adoption request start',
  );
  if (state !== 'started') {
    throw new Error('Adoption operation completed before the request started');
  }
  return { operation, response };
}

describe('VolcanoAuth', () => {
  const config = {
    apiUrl: 'https://api.test.com',
    anonKey: 'ak-test-anon-key',
  };

  let volcano: VolcanoAuth;

  beforeEach(() => {
    volcano = new VolcanoAuth(config);
  });

  describe('Constructor', () => {
    it('should initialize with config', () => {
      expect(volcano.apiUrl).toBe(config.apiUrl);
      expect(volcano.anonKey).toBe(config.anonKey);
    });

    it('should use default apiUrl when not provided', () => {
      const v = new VolcanoAuth({ anonKey: 'ak-test-key' });
      expect(v.apiUrl).toBe('https://api.volcano.dev');
    });

    it('should throw error if anonKey is missing', () => {
      expect(() => {
        const result: unknown = Reflect.construct(VolcanoAuth, [{ apiUrl: 'test' }]);
        return result;
      }).toThrow('anonKey is required');
    });

    it('should throw error if anonKey is missing even without apiUrl', () => {
      expect(() => {
        const result: unknown = Reflect.construct(VolcanoAuth, [{}]);
        return result;
      }).toThrow('anonKey is required');
    });

    it('rejects an explicitly empty anon key', () => {
      expect(() => new VolcanoAuth({ anonKey: '' })).toThrow(
        'anonKey is required. Get your anon key from project settings.',
      );
    });

    it('should throw error if service key used in browser', () => {
      Object.defineProperty(globalThis, 'window', {
        configurable: true,
        value: { document: {} },
      });
      try {
        expect(
          () =>
            new VolcanoAuth({
              apiUrl: 'test',
              anonKey: 'sk-service-key',
            }),
        ).toThrow(
          '[VOLCANO SECURITY ERROR] Service keys (sk-*) cannot be used in client-side code. ' +
            'Service keys bypass Row Level Security and expose your database to unauthorized access. ' +
            'Use an anon key (ak-*) for browser/client-side applications. ' +
            'Service keys should only be used in secure server-side environments. ' +
            'See: https://docs.volcano.hosting/security/keys',
        );
      } finally {
        Reflect.deleteProperty(globalThis, 'window');
      }
    });

    it('should accept accessToken for server-side use', () => {
      const v = new VolcanoAuth({
        apiUrl: 'https://api.test.com',
        anonKey: 'ak-test-key',
        accessToken: 'server-side-token-123',
        refreshToken: 'server-side-refresh-456',
      });

      expect(v.accessToken).toBe('server-side-token-123');
      expect(v.refreshToken).toBe('server-side-refresh-456');
    });

    it('should use accessToken instead of localStorage when provided', () => {
      // Set up localStorage values
      localStorage.setItem('volcano_access_token', 'stored-token');
      localStorage.setItem('volcano_refresh_token', 'stored-refresh');

      const v = new VolcanoAuth({
        apiUrl: 'https://api.test.com',
        anonKey: 'ak-test-key',
        accessToken: 'constructor-token',
      });

      // Should use constructor value, not localStorage
      expect(v.accessToken).toBe('constructor-token');
    });

    it('should allow accessToken without refreshToken', () => {
      const v = new VolcanoAuth({
        apiUrl: 'https://api.test.com',
        anonKey: 'ak-test-key',
        accessToken: 'server-token-only',
      });

      expect(v.accessToken).toBe('server-token-only');
      expect(v.refreshToken).toBeNull();
    });

    it('should have auth and functions sub-objects', () => {
      expect(volcano.auth).toBeDefined();
      expect(volcano.functions).toBeDefined();
      expect(typeof volcano.auth.signUp).toBe('function');
      expect(typeof volcano.auth.signIn).toBe('function');
      expect(typeof volcano.functions.invoke).toBe('function');
    });

    it('should expose all auth methods', () => {
      // Core auth
      expect(typeof volcano.auth.signUp).toBe('function');
      expect(typeof volcano.auth.signIn).toBe('function');
      expect(typeof volcano.auth.getSession).toBe('function');
      expect(typeof volcano.auth.signOut).toBe('function');
      expect(typeof volcano.auth.getUser).toBe('function');
      expect(typeof volcano.auth.updateUser).toBe('function');
      expect(typeof volcano.auth.refreshSession).toBe('function');
      expect(typeof volcano.auth.onAuthStateChange).toBe('function');
      expect(typeof volcano.auth.user).toBe('function');

      // Anonymous
      expect(typeof volcano.auth.signInAnonymously).toBe('function');
      expect(typeof Reflect.get(volcano.auth, 'signUpAnonymous')).toBe('function');
      expect(typeof volcano.auth.convertAnonymous).toBe('function');

      // Email confirmation
      expect(typeof volcano.auth.confirmEmail).toBe('function');
      expect(typeof volcano.auth.resendConfirmation).toBe('function');

      // Password recovery
      expect(typeof volcano.auth.resetPasswordForEmail).toBe('function');
      expect(typeof Reflect.get(volcano.auth, 'forgotPassword')).toBe('function');
      expect(typeof volcano.auth.resetPassword).toBe('function');

      // Email change
      expect(typeof volcano.auth.requestEmailChange).toBe('function');
      expect(typeof volcano.auth.confirmEmailChange).toBe('function');
      expect(typeof volcano.auth.cancelEmailChange).toBe('function');

      // OAuth
      expect(typeof volcano.auth.signInWithOAuth).toBe('function');
      expect(typeof volcano.auth.signInWithGoogle).toBe('function');
      expect(typeof volcano.auth.signInWithGitHub).toBe('function');
      expect(typeof volcano.auth.signInWithMicrosoft).toBe('function');
      expect(typeof volcano.auth.signInWithApple).toBe('function');
      expect(typeof volcano.auth.linkOAuthProvider).toBe('function');
      expect(typeof volcano.auth.unlinkOAuthProvider).toBe('function');
      expect(typeof volcano.auth.getLinkedOAuthProviders).toBe('function');
      expect(typeof volcano.auth.refreshOAuthToken).toBe('function');
      expect(typeof volcano.auth.getOAuthProviderToken).toBe('function');
      expect(typeof volcano.auth.callOAuthAPI).toBe('function');

      // Session management
      expect(typeof volcano.auth.setSession).toBe('function');
      expect(typeof volcano.auth.getSessions).toBe('function');
      expect(typeof volcano.auth.deleteSession).toBe('function');
      expect(typeof volcano.auth.deleteAllOtherSessions).toBe('function');
    });
  });

  describe('auth.user()', () => {
    it('should return current user', () => {
      volcano.currentUser = { id: 'user-123', email: 'test@example.com', status: 'active' };
      expect(volcano.auth.user()).toEqual({
        id: 'user-123',
        email: 'test@example.com',
        status: 'active' as const,
      });
    });

    it('should return null when not authenticated', () => {
      expect(volcano.auth.user()).toBeNull();
    });
  });

  describe('auth.getSession()', () => {
    it('returns an empty successful result without a session or request', async () => {
      await expect(volcano.auth.getSession()).resolves.toEqual({
        data: { session: null },
        error: null,
      });
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('returns a detached snapshot of the established session', async () => {
      const user = {
        id: 'user-123',
        email: 'test@example.com',
        user_metadata: { theme: 'dark' },
        created_at: '2026-08-28T00:00:00Z',
        updated_at: '2026-08-28T00:00:00Z',
        status: 'active' as const,
      };
      volcano.accessToken = 'access-token';
      volcano.refreshToken = 'refresh-token';
      volcano.currentUser = user;

      const first = await volcano.auth.getSession();
      const session = required(first.data.session);
      const metadata = required(required(session.user).user_metadata);
      session.access_token = 'changed';
      metadata['theme'] = 'light';
      const second = await volcano.auth.getSession();

      expect(second).toEqual({
        data: {
          session: {
            access_token: 'access-token',
            refresh_token: 'refresh-token',
            user,
          },
        },
        error: null,
      });
      expect(volcano.accessToken).toBe('access-token');
      expect(volcano.currentUser).toMatchObject({ user_metadata: { theme: 'dark' } });
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('allows an access-token-only session', async () => {
      const client = new VolcanoAuth({ ...config, accessToken: 'access-token' });

      await expect(client.auth.getSession()).resolves.toEqual({
        data: {
          session: {
            access_token: 'access-token',
            refresh_token: null,
            user: null,
          },
        },
        error: null,
      });
      expect(global.fetch).not.toHaveBeenCalled();
    });
  });

  describe('Authentication - token-only bootstrap', () => {
    it.each([204, 401, 503])(
      'revokes a token-only session and clears locally after status %s',
      async (status) => {
        const token = createTestJwtToken('project-id', {
          session_id: '00000000-0000-4000-8000-000000000011',
        });
        const client = new VolcanoAuth({ ...config, accessToken: token });
        fetchMock.mockResolvedValueOnce(reply(status, { error: 'revocation failed' }));
        const result = await client.auth.signOut();
        expect(global.fetch).toHaveBeenCalledTimes(1);
        expect(global.fetch).toHaveBeenCalledWith(
          `${config.apiUrl}/auth/user/sessions/00000000-0000-4000-8000-000000000011`,
          expect.objectContaining({
            method: 'DELETE',
            headers: expect.objectContaining({ Authorization: `Bearer ${token}` }),
          }),
        );
        expect(Boolean(result.error)).toBe(status !== 204);
        expect(client.accessToken).toBeNull();
      },
    );

    it('preserves a replacement made while token-only revocation is in flight', async () => {
      const token = createTestJwtToken('project-id', {
        session_id: '00000000-0000-4000-8000-000000000011',
      });
      const client = new VolcanoAuth({ ...config, accessToken: token });
      fetchMock.mockImplementationOnce(async () => {
        await client.auth.setSession({
          access_token: 'replacement',
          refresh_token: 'refresh',
          user: { id: 'other-user', email: 'fixture@example.com', status: 'active' },
        });
        return reply(204);
      });
      const result = await client.auth.signOut();
      expect(result.error).toBeInstanceOf(AuthSessionChangedError);
      expect(client.accessToken).toBe('replacement');
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it('does not replay a rejected request under another user after refresh', async () => {
      const client = new VolcanoAuth({
        ...config,
        accessToken: sessionToken(),
        refreshToken: 'supplied-refresh',
      });
      const user = { id: 'user-123', email: 'test@example.com', status: 'active' };
      fetchMock
        .mockResolvedValueOnce(reply(200, { user }))
        .mockResolvedValueOnce(reply(401, { error: 'Expired' }))
        .mockResolvedValueOnce(
          reply(200, {
            access_token: sessionToken(undefined, true),
            refresh_token: 'other-refresh',
            user: { id: 'other-user', email: 'fixture@example.com', status: 'active' },
            expires_in: 3600,
          }),
        );
      await client.auth.getUser();

      const result = await client.auth.getUser();
      expect(result.user).toBeNull();
      expect(result.error).toBeTruthy();
      expect(client.currentUser).toEqual(user);
      expect(client.accessToken).toBe(sessionToken());
      expect(global.fetch).toHaveBeenCalledTimes(3);
    });

    it.each([false, true])(
      'rejects a refresh for another user with concurrent profile enrichment: %s',
      async (enrichDuringRefresh) => {
        const client = new VolcanoAuth({
          ...config,
          accessToken: createTestJwtToken('project-id', {
            session_id: '00000000-0000-4000-8000-000000000012',
          }),
          refreshToken: 'supplied-refresh',
        });
        const profile = { id: 'user-123', email: 'test@example.com', status: 'active' };
        fetchMock.mockImplementation(async (url) => {
          if (requestUrl(url).endsWith('/auth/user')) {
            return reply(200, { user: profile });
          }
          if (enrichDuringRefresh) {
            await client.auth.getUser();
          }
          return reply(200, {
            access_token: createTestJwtToken('project-id', {
              session_id: '00000000-0000-4000-8000-000000000012',
            }),
            refresh_token: 'other-refresh',
            user: { id: 'other-user', email: 'fixture@example.com', status: 'active' },
            expires_in: 3600,
          });
        });
        if (!enrichDuringRefresh) {
          await client.auth.getUser();
        }

        const refreshed = await client.auth.refreshSession();
        expect(refreshed.error).toMatchObject({
          message: expect.stringContaining('different user'),
        });
        expect(client.currentUser).toEqual(profile);
        expect(client.accessToken).toBe(
          createTestJwtToken('project-id', { session_id: '00000000-0000-4000-8000-000000000012' }),
        );
      },
    );

    it.each(['getUser', 'updateUser'])(
      'discards a stale %s profile when refresh wins first',
      async (method) => {
        const client = new VolcanoAuth({
          ...config,
          accessToken: createTestJwtToken('project-id', {
            session_id: '00000000-0000-4000-8000-000000000012',
          }),
          refreshToken: 'refresh-b',
        });
        const pending = deferred<Response>();
        const started = signal();
        fetchMock.mockImplementationOnce(() => {
          started.resolve();
          return pending.promise;
        });
        const profile =
          method === 'getUser'
            ? client.auth.getUser()
            : client.auth.updateUser({ metadata: { name: 'example' } });
        await within(started.promise, 'profile request start');
        fetchMock.mockResolvedValueOnce(
          reply(200, {
            access_token: createTestJwtToken('project-id', {
              session_id: '00000000-0000-4000-8000-000000000012',
              renewed: true,
            }),
            refresh_token: 'rotated-b',
            user: { id: 'user-b', email: 'fixture@example.com', status: 'active' },
            expires_in: 3600,
          }),
        );
        const refreshed = await within(client.auth.refreshSession(), 'refresh completion');
        expect(refreshed.error).toBeNull();
        pending.resolve(
          reply(200, {
            user: { id: 'user-a', email: 'fixture@example.com', status: 'active' },
          }),
        );
        const profileResult = await within(profile, 'stale profile completion');
        expect(profileResult.error).toBeInstanceOf(AuthSessionChangedError);
        expect(client.currentUser?.id).toBe('user-b');
        expect(client.accessToken).toBe(
          createTestJwtToken('project-id', {
            session_id: '00000000-0000-4000-8000-000000000012',
            renewed: true,
          }),
        );
      },
    );

    it('revokes the access-token session when the supplied refresh token belongs elsewhere', async () => {
      const token = createTestJwtToken('project-id', {
        session_id: '00000000-0000-4000-8000-000000000011',
      });
      const client = new VolcanoAuth({
        ...config,
        accessToken: token,
        refreshToken: 'different-session-refresh',
      });
      fetchMock.mockResolvedValueOnce(reply(204));
      const signedOut = await client.auth.signOut();
      expect(signedOut.error).toBeNull();
      expect(global.fetch).toHaveBeenCalledWith(
        `${config.apiUrl}/auth/user/sessions/00000000-0000-4000-8000-000000000011`,
        expect.objectContaining({
          method: 'DELETE',
          headers: expect.objectContaining({ Authorization: `Bearer ${token}` }),
        }),
      );
      expect(global.fetch).toHaveBeenCalledTimes(1);
      expect(client.accessToken).toBeNull();
    });

    it('validates and caches the profile without inventing refresh credentials', async () => {
      const client = new VolcanoAuth({ ...config, accessToken: 'supplied-access' });
      const initial = await client.auth.getSession();
      const user = { id: 'user-123', email: 'test@example.com', status: 'active' };
      expect(global.fetch).not.toHaveBeenCalled();
      fetchMock.mockResolvedValueOnce(reply(200, { user }));

      await expect(client.auth.getUser()).resolves.toEqual({ user, error: null });
      expect(global.fetch).toHaveBeenCalledWith(
        `${config.apiUrl}/auth/user`,
        expect.objectContaining({
          headers: expect.objectContaining({ Authorization: 'Bearer supplied-access' }),
        }),
      );
      const current = await client.auth.getSession();
      expect(current.data.session).toEqual({
        access_token: 'supplied-access',
        refresh_token: null,
        user,
      });
      expect(initial.data.session?.user).toBeNull();
    });

    it('preserves a rejected access token until local sign-out without refresh or revocation', async () => {
      const client = new VolcanoAuth({ ...config, accessToken: 'supplied-access' });
      fetchMock.mockResolvedValueOnce(reply(401, { error: 'Expired supplied token' }));

      const profile = await client.auth.getUser();
      expect(profile.error).toBeTruthy();
      const refresh = await client.auth.refreshSession();
      expect(refresh.error).toMatchObject({ message: 'No refresh token' });
      expect(client.accessToken).toBe('supplied-access');
      await expect(client.auth.signOut()).resolves.toEqual({ error: null });
      await expect(client.auth.getSession()).resolves.toEqual({
        data: { session: null },
        error: null,
      });
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });
  });
  describe('Authentication - local session adoption', () => {
    interface SessionFixture extends CompleteSession {
      user: User & { user_metadata: { preferences: { theme: string } } };
    }

    function completeSession(): SessionFixture {
      return {
        access_token: 'adopted-access-token',
        refresh_token: 'adopted-refresh-token',
        user: {
          id: 'adopted-user-id',
          email: 'adopted@example.com',
          user_metadata: { preferences: { theme: 'dark' } },
          created_at: '2026-08-28T00:00:00Z',
          updated_at: '2026-08-28T00:00:00Z',
          status: 'active',
        },
      };
    }

    async function expectAdoptedSession() {
      await expect(volcano.auth.getSession()).resolves.toEqual({
        data: { session: completeSession() },
        error: null,
      });
    }

    it('adopts a complete session into an empty client', async () => {
      const session = completeSession();

      await expect(volcano.auth.setSession(session)).resolves.toEqual({
        data: { session },
        error: null,
      });
      await expectAdoptedSession();
    });

    it('replaces an existing session', async () => {
      volcano._setSession({
        access_token: 'previous-access-token',
        refresh_token: 'previous-refresh-token',
        user: { id: 'previous-user-id', email: 'fixture@example.com', status: 'active' },
      });

      await volcano.auth.setSession(completeSession());

      await expectAdoptedSession();
    });

    it('owns the supplied session and returned snapshot deeply', async () => {
      const session = completeSession();
      const result = await volcano.auth.setSession(session);

      session.access_token = 'mutated-input-token';
      session.user.id = 'mutated-input-user';
      session.user.user_metadata.preferences.theme = 'light';
      const snapshot = required(result.data.session);
      snapshot.refresh_token = 'mutated-result-token';
      const metadata = required(required(snapshot.user).user_metadata);
      const preferences: unknown = metadata['preferences'];
      if (typeof preferences !== 'object' || preferences === null) {
        throw new Error('Expected nested user preferences');
      }
      Reflect.set(preferences, 'theme', 'blue');

      await expectAdoptedSession();
    });

    it.each([
      ['a null session', () => null],
      ['a non-object session', () => 'session'],
      ['an array session', () => []],
      ['an empty access token', () => ({ ...completeSession(), access_token: ' ' })],
      [
        'a missing refresh token',
        () => {
          const session = completeSession();
          Reflect.deleteProperty(session, 'refresh_token');
          return session;
        },
      ],
      ['an empty refresh token', () => ({ ...completeSession(), refresh_token: '' })],
      ['a null user', () => ({ ...completeSession(), user: null })],
      [
        'a missing user ID',
        () => {
          const session = completeSession();
          Reflect.deleteProperty(session.user, 'id');
          return session;
        },
      ],
      [
        'an empty user ID',
        () => ({
          ...completeSession(),
          user: {
            ...completeSession().user,
            id: ' ',
            email: 'fixture@example.com',
            status: 'active',
          },
        }),
      ],
      [
        'an unclonable session',
        () => {
          const session = completeSession();
          Object.defineProperty(session, 'access_token', {
            enumerable: true,
            get() {
              throw new Error('access token getter failed');
            },
          });
          return session;
        },
      ],
    ])('rejects %s without replacing the current session', async (_name, invalidSession) => {
      await volcano.auth.setSession(completeSession());
      const previous = await volcano.auth.getSession();

      const adopted: unknown = Reflect.apply(
        volcano.auth.setSession.bind(volcano.auth),
        undefined,
        [invalidSession()],
      );
      await expect(adopted).resolves.toEqual({
        data: { session: null },
        error: expect.any(TypeError),
      });
      await expect(volcano.auth.getSession()).resolves.toEqual(previous);
    });

    it('does not fetch, persist, remove storage, or notify listeners', async () => {
      const listener = jest.fn();
      volcano.auth.onAuthStateChange(listener);
      listener.mockClear();

      await volcano.auth.setSession(completeSession());

      expect(global.fetch).not.toHaveBeenCalled();
      expect(Reflect.get(localStorage, 'setItem')).not.toHaveBeenCalled();
      expect(Reflect.get(localStorage, 'removeItem')).not.toHaveBeenCalled();
      expect(listener).not.toHaveBeenCalled();
    });

    it('supersedes an already-running sign-in', async () => {
      const { operation, response } = await deferRequest(() =>
        volcano.auth.signIn({ email: 'stale@example.com', password: 'password123' }),
      );

      await volcano.auth.setSession(completeSession());
      response.resolve(
        reply(200, {
          access_token: 'stale-access-token',
          refresh_token: 'stale-refresh-token',
          user: { id: 'stale-user-id', email: 'fixture@example.com', status: 'active' },
          expires_in: 3600,
        }),
      );

      const result = await within(operation, 'stale sign-in completion');
      expect(AuthSessionChangedError.is(result.error)).toBe(true);
      await expectAdoptedSession();
    });

    it('supersedes an already-running refresh', async () => {
      volcano._setSession({
        access_token: 'previous-access-token',
        refresh_token: 'previous-refresh-token',
        user: { id: 'previous-user-id', email: 'fixture@example.com', status: 'active' },
      });
      const { operation, response } = await deferRequest(() => volcano.auth.refreshSession());

      await volcano.auth.setSession(completeSession());
      response.resolve(
        reply(200, {
          access_token: 'stale-access-token',
          refresh_token: 'stale-refresh-token',
          user: { id: 'stale-user-id', email: 'fixture@example.com', status: 'active' },
          expires_in: 3600,
        }),
      );

      const result = await within(operation, 'stale refresh completion');
      expect(AuthRefreshDiscardedError.is(result.error)).toBe(true);
      await expectAdoptedSession();
    });

    it('supersedes an already-running sign-out', async () => {
      volcano._setSession({
        access_token: 'previous-access-token',
        refresh_token: 'previous-refresh-token',
        user: { id: 'previous-user-id', email: 'fixture@example.com', status: 'active' },
      });
      const { operation, response } = await deferRequest(() => volcano.auth.signOut());

      await volcano.auth.setSession(completeSession());
      response.resolve(reply(200, {}));

      const result = await within(operation, 'stale sign-out completion');
      expect(AuthSessionChangedError.is(result.error)).toBe(true);
      await expectAdoptedSession();
    });

    it('supersedes an already-running user update', async () => {
      volcano._setSession({
        access_token: 'previous-access-token',
        refresh_token: 'previous-refresh-token',
        user: { id: 'previous-user-id', email: 'fixture@example.com', status: 'active' },
      });
      const { operation, response } = await deferRequest(() =>
        volcano.auth.updateUser({ metadata: { name: 'stale' } }),
      );

      await volcano.auth.setSession(completeSession());
      response.resolve(
        reply(200, {
          user: { id: 'stale-user-id', email: 'fixture@example.com', status: 'active' },
        }),
      );

      const result = await within(operation, 'stale user update completion');
      expect(AuthSessionChangedError.is(result.error)).toBe(true);
      await expectAdoptedSession();
    });
  });
});
