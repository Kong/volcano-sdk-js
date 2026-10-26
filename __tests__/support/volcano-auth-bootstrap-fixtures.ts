import { expect } from '@jest/globals';
import type { VolcanoAuth } from '../../src/index.ts';
import type { CompleteSession, User } from '../../src/sdk-public-types.ts';
import { within } from '../auth-concurrency-fixtures.ts';
import { type PendingFetch, pendingFetch } from './volcano-auth-sessions-fixtures.ts';

interface SessionFixture extends CompleteSession {
  user: User & { user_metadata: { preferences: { theme: string } } };
}

export function required<Value>(value: Value | null | undefined): Value {
  if (value === null || value === undefined) {
    throw new Error('Expected value to be present');
  }
  return value;
}

export async function deferRequest<Result>(
  invoke: () => Promise<Result>,
): Promise<{ operation: Promise<Result>; response: PendingFetch['response'] }> {
  const { response, started } = pendingFetch();
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

export function completeSession(): SessionFixture {
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

export function previousSession(): CompleteSession {
  return {
    access_token: 'previous-access-token',
    refresh_token: 'previous-refresh-token',
    user: { id: 'previous-user-id', email: 'fixture@example.com', status: 'active' },
  };
}

export async function expectAdoptedSession(volcano: VolcanoAuth): Promise<void> {
  await expect(volcano.auth.getSession()).resolves.toEqual({
    data: { session: completeSession() },
    error: null,
  });
}
