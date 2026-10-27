/** @jest-environment ./__tests__/node-environment.cjs */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { type AuthStateCallback, VolcanoAuth } from '../src/index.ts';
import { expectInstanceOf } from './support/assertions.ts';
import {
  completeSession,
  expectAdoptedSession,
  previousSession,
  required,
} from './support/volcano-auth-bootstrap-fixtures.ts';

// Match the prior jsdom suite: its JSON clone path keeps metadata in Jest's realm.
Object.defineProperty(globalThis, 'structuredClone', { configurable: true, value: undefined });

const config = {
  apiUrl: 'https://api.test.com',
  anonKey: 'ak-test-anon-key',
};

let volcano: VolcanoAuth;

const invalidSessions: [string, () => unknown][] = [
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
];

function adoptsCompleteSessions(): void {
  it('adopts a complete session into an empty client', async () => {
    const session = completeSession();

    await expect(volcano.auth.setSession(session)).resolves.toEqual({
      data: { session },
      error: null,
    });
    await expectAdoptedSession(volcano);
  });

  it('replaces an existing session', async () => {
    volcano._setSession(previousSession());

    await volcano.auth.setSession(completeSession());

    await expect(volcano.auth.getSession()).resolves.toEqual({ data: { session: completeSession() }, error: null });
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
    expectInstanceOf(preferences, Object);
    Reflect.set(preferences, 'theme', 'blue');

    await expect(volcano.auth.getSession()).resolves.toEqual({ data: { session: completeSession() }, error: null });
  });
}

function rejectsInvalidSessions(): void {
  it.each(invalidSessions)('rejects %s without replacing the current session', async (_name, invalidSession) => {
    await volcano.auth.setSession(completeSession());
    const previous = await volcano.auth.getSession();

    const adopted: unknown = Reflect.apply(volcano.auth.setSession.bind(volcano.auth), undefined, [invalidSession()]);
    await expect(adopted).resolves.toEqual({
      data: { session: null },
      error: expect.any(TypeError),
    });
    await expect(volcano.auth.getSession()).resolves.toEqual(previous);
  });

  it('does not fetch, persist, remove storage, or notify listeners', async () => {
    const listener = jest.fn<AuthStateCallback>();
    volcano.auth.onAuthStateChange(listener);
    listener.mockClear();

    await volcano.auth.setSession(completeSession());

    expect(global.fetch).not.toHaveBeenCalled();
    expect(Reflect.get(localStorage, 'setItem')).not.toHaveBeenCalled();
    expect(Reflect.get(localStorage, 'removeItem')).not.toHaveBeenCalled();
    expect(listener).not.toHaveBeenCalled();
  });
}

describe('VolcanoAuth', () => {
  beforeEach(() => {
    volcano = new VolcanoAuth(config);
  });

  describe('Authentication - local session adoption', () => {
    adoptsCompleteSessions();
    rejectsInvalidSessions();
  });
});
