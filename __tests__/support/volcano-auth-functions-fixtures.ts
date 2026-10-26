import { afterEach, beforeEach, expect, jest } from '@jest/globals';
import type { VolcanoAuth } from '../../src/index.ts';
import { reply } from '../auth-concurrency-fixtures.ts';

type SessionInput = Parameters<VolcanoAuth['_setSession']>[0];
type FetchStep = readonly [url: string, method: string];

export const fetchMock = jest.mocked(globalThis.fetch);
export const config = { apiUrl: 'https://api.test.com', anonKey: 'ak-test-anon-key' };
const FUNCTION_ID = '3cd3e058-e3ff-42a5-ae4d-650ef9b45746';

export function withBrowserWindow(): void {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  beforeEach(() => {
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: { document: {}, localStorage },
    });
  });
  afterEach(() => {
    if (previousWindow === undefined) {
      Reflect.deleteProperty(globalThis, 'window');
    } else {
      Object.defineProperty(globalThis, 'window', previousWindow);
    }
  });
}

export function resolvedFunction(name: string, functionId = FUNCTION_ID): Response {
  return reply(200, {
    name,
    function_id: functionId,
    invoke_url: `https://${functionId}.functions.test.run/`,
    cache_ttl_seconds: 300,
  });
}

export function session(accessToken: string, refreshToken: string, userId: string): SessionInput {
  return {
    access_token: accessToken,
    refresh_token: refreshToken,
    user: { id: userId, email: 'fixture@example.com', status: 'active' },
  };
}

export function expectFetchSequence(steps: readonly FetchStep[]): void {
  for (const [index, [url, method]] of steps.entries()) {
    expect(fetch).toHaveBeenNthCalledWith(index + 1, url, expect.objectContaining({ method }));
  }
}
