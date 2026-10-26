/** @jest-environment ./__tests__/node-environment.cjs */
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { AuthSessionChangedError, VolcanoAuth } from '../src/index.ts';
import { fetchBody, reply, within } from './auth-concurrency-fixtures.ts';
import { legacyAuthCall } from './support/volcano-auth-recovery-fixtures.ts';
import {
  installWindow,
  pendingFetch,
  replacementSession,
  restoreWindow,
} from './support/volcano-auth-sessions-fixtures.ts';

const fetchMock = jest.mocked(globalThis.fetch);
const config = { apiUrl: 'https://api.test.com', anonKey: 'ak-test-anon-key' };
let volcano: VolcanoAuth;

beforeEach(() => {
  installWindow({ document: {}, localStorage });
  volcano = new VolcanoAuth(config);
});

afterEach(restoreWindow);

function anonymousSignupReply(user: Record<string, unknown> = {}): Response {
  return reply(200, {
    user: { id: 'anon-123', is_anonymous: true, ...user, email: 'fixture@example.com', status: 'active' },
    access_token: 'anon-token',
    refresh_token: 'anon-refresh',
    expires_in: 3600,
  });
}

function signsInAnonymously(): void {
  it('should sign in anonymously through the preferred auth method', async () => {
    fetchMock.mockResolvedValueOnce(anonymousSignupReply());

    const result = await volcano.auth.signInAnonymously({ device: 'mobile' });

    expect(result.user).toMatchObject({ is_anonymous: true });
    expect(result.session?.access_token).toBe('anon-token');
    expect(result.error).toBeNull();
    expect(JSON.parse(fetchBody(0))).toEqual({
      user_metadata: { device: 'mobile' },
    });
  });
}

function discardsStaleAnonymousSignups(): void {
  it('discards an anonymous signup after another session wins', async () => {
    const { response, started } = pendingFetch();

    const signup = legacyAuthCall(volcano, 'signUpAnonymous');
    await within(started.promise, 'anonymous signup request');
    volcano._setSession(replacementSession());
    response.resolve(
      reply(200, {
        access_token: 'stale-access',
        refresh_token: 'stale-refresh',
        expires_in: 3600,
        user: {
          id: 'stale-anonymous',
          is_anonymous: true,
          email: 'fixture@example.com',
          status: 'active',
        },
      }),
    );

    const result = await within(signup, 'stale anonymous signup');

    expect(result).toMatchObject({ user: null, session: null });
    expect(AuthSessionChangedError.is(Reflect.get(new Object(result), 'error'))).toBe(true);
    expect(volcano.accessToken).toBe('replacement-access');
    expect(volcano.currentUser).toEqual({
      id: 'replacement-user',
      email: 'fixture@example.com',
      status: 'active',
    });
  });
}

function signsUpAnonymousUsers(): void {
  it('should sign up anonymous user', async () => {
    fetchMock.mockResolvedValueOnce(anonymousSignupReply());

    const result = await legacyAuthCall(volcano, 'signUpAnonymous');

    expect(result).toMatchObject({
      user: { is_anonymous: true },
      session: { access_token: 'anon-token' },
      error: null,
    });
  });

  it('should sign up anonymous user with metadata', async () => {
    fetchMock.mockResolvedValueOnce(anonymousSignupReply({ metadata: { device: 'mobile' } }));

    const result = await legacyAuthCall(volcano, 'signUpAnonymous', { device: 'mobile' });

    expect(result).toMatchObject({ user: { is_anonymous: true } });

    expect(JSON.parse(fetchBody(0))).toEqual({ user_metadata: { device: 'mobile' } });
  });

  it('should return error on anonymous signup failure', async () => {
    fetchMock.mockResolvedValueOnce(reply(400, { error: 'Anonymous signup disabled' }));

    const result = await legacyAuthCall(volcano, 'signUpAnonymous');

    expect(result).toMatchObject({
      user: null,
      session: null,
      error: { message: 'Anonymous signup disabled' },
    });
  });
}

function convertsAnonymousUsers(): void {
  it('should convert anonymous user', async () => {
    volcano.accessToken = 'anon-token';

    fetchMock.mockResolvedValueOnce(
      reply(200, { user: { id: 'user-123', email: 'new@example.com', is_anonymous: false, status: 'active' } }),
    );

    const result = await volcano.auth.convertAnonymous({
      email: 'new@example.com',
      password: 'password123',
    });

    expect(result.user).toMatchObject({ is_anonymous: false });
    expect(result.user?.email).toBe('new@example.com');
    expect(volcano.currentUser).toEqual(result.user);
  });

  it('should return error when converting non-authenticated user', async () => {
    volcano.accessToken = null;

    const result = await volcano.auth.convertAnonymous({
      email: 'new@example.com',
      password: 'password123',
    });

    expect(result.user).toBeNull();
    expect(result.error).toBeDefined();
  });
}

function rejectsFailedConversions(): void {
  it('should return error on convert anonymous failure', async () => {
    volcano.accessToken = 'anon-token';

    fetchMock.mockResolvedValueOnce(reply(400, { error: 'Email already exists' }));

    const result = await volcano.auth.convertAnonymous({
      email: 'existing@example.com',
      password: 'password123',
    });

    expect(result.user).toBeNull();
    expect(result.error?.message).toBe('Email already exists');
  });
}

describe('VolcanoAuth account recovery', () => {
  describe('Anonymous Authentication', () => {
    signsInAnonymously();
    discardsStaleAnonymousSignups();
    signsUpAnonymousUsers();
    convertsAnonymousUsers();
    rejectsFailedConversions();
  });
});
