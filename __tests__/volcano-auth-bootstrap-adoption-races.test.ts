/** @jest-environment ./__tests__/node-environment.cjs */
import { beforeEach, describe, expect, it } from '@jest/globals';
import { AuthRefreshDiscardedError, AuthSessionChangedError, VolcanoAuth } from '../src/index.ts';
import { reply, within } from './auth-concurrency-fixtures.ts';
import {
  completeSession,
  deferRequest,
  expectAdoptedSession,
  previousSession,
} from './support/volcano-auth-bootstrap-fixtures.ts';

// Match the prior jsdom suite: its JSON clone path keeps metadata in Jest's realm.
Object.defineProperty(globalThis, 'structuredClone', { configurable: true, value: undefined });

const config = {
  apiUrl: 'https://api.test.com',
  anonKey: 'ak-test-anon-key',
};

let volcano: VolcanoAuth;

function supersedesSessionGrants(): void {
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
    await expectAdoptedSession(volcano);
  });

  it('supersedes an already-running refresh', async () => {
    volcano._setSession(previousSession());
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
    await expectAdoptedSession(volcano);
  });
}

function supersedesSessionChanges(): void {
  it('supersedes an already-running sign-out', async () => {
    volcano._setSession(previousSession());
    const { operation, response } = await deferRequest(() => volcano.auth.signOut());

    await volcano.auth.setSession(completeSession());
    response.resolve(reply(200, {}));

    const result = await within(operation, 'stale sign-out completion');
    expect(AuthSessionChangedError.is(result.error)).toBe(true);
    await expectAdoptedSession(volcano);
  });

  it('supersedes an already-running user update', async () => {
    volcano._setSession(previousSession());
    const { operation, response } = await deferRequest(() => volcano.auth.updateUser({ metadata: { name: 'stale' } }));

    await volcano.auth.setSession(completeSession());
    response.resolve(
      reply(200, {
        user: { id: 'stale-user-id', email: 'fixture@example.com', status: 'active' },
      }),
    );

    const result = await within(operation, 'stale user update completion');
    expect(AuthSessionChangedError.is(result.error)).toBe(true);
    await expectAdoptedSession(volcano);
  });
}

describe('VolcanoAuth', () => {
  beforeEach(() => {
    volcano = new VolcanoAuth(config);
  });

  describe('Authentication - local session adoption', () => {
    supersedesSessionGrants();
    supersedesSessionChanges();
  });
});
