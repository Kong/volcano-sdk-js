/** @jest-environment ./__tests__/node-environment.cjs */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { AuthSessionChangedError, type AuthStateCallback, VolcanoAuth } from '../src/index.ts';
import { deferred, reply, signal, within } from './auth-concurrency-fixtures.ts';

const fetchMock = jest.mocked(globalThis.fetch);
const config = { apiUrl: 'https://api.test.com', anonKey: 'ak-test-anon-key' };
let volcano: VolcanoAuth;

beforeEach(() => {
  volcano = new VolcanoAuth(config);
});

const STALE_WRITERS = [
  ['getUser', (client: VolcanoAuth) => client.auth.getUser(), true],
  ['updateUser', (client: VolcanoAuth) => client.auth.updateUser({ metadata: { name: 'stale' } }), false],
  [
    'convertAnonymous',
    (client: VolcanoAuth) =>
      client.auth.convertAnonymous({
        email: 'converted@example.com',
        password: 'password123',
      }),
    false,
  ],
  ['confirmEmailChange', (client: VolcanoAuth) => client.auth.confirmEmailChange('stale-email-change-token'), false],
] as const;

function discardsStaleWriterResponses(): void {
  it.each(STALE_WRITERS)('discards a stale %s response', async (_name, invoke, pendingRedirectNotification) => {
    const response = deferred<Response>();
    const requestStarted = signal();
    const callback = jest.fn<AuthStateCallback>();
    volcano._setSession({
      access_token: 'access-a',
      refresh_token: 'refresh-a',
      user: { id: 'user-a', email: 'fixture@example.com', status: 'active' },
    });
    volcano.auth.onAuthStateChange(callback);
    callback.mockClear();
    volcano._pendingUrlAuthNotify = pendingRedirectNotification;
    fetchMock.mockImplementationOnce(() => {
      requestStarted.resolve();
      return response.promise;
    });

    const operation = invoke(volcano);
    await within(requestStarted.promise, 'profile writer request start');
    volcano._setSession({
      access_token: 'access-b',
      refresh_token: 'refresh-b',
      user: { id: 'user-b', email: 'fixture@example.com', status: 'active' },
    });
    callback.mockClear();
    response.resolve(
      reply(200, {
        user: { id: 'stale-user-a', email: 'fixture@example.com', status: 'active' },
      }),
    );

    const result = await within(operation, 'stale profile writer completion');

    expect(result.user).toBeNull();
    expect(AuthSessionChangedError.is(result.error)).toBe(true);
    expect(volcano.currentUser).toEqual({
      id: 'user-b',
      email: 'fixture@example.com',
      status: 'active',
    });
    expect(volcano.accessToken).toBe('access-b');
    expect(callback).not.toHaveBeenCalled();
    expect(volcano._pendingUrlAuthNotify).toBe(false);
  });
}

describe('VolcanoAuth profile continuity', () => {
  describe('Authentication - current user writer guards', () => {
    discardsStaleWriterResponses();
  });
});
