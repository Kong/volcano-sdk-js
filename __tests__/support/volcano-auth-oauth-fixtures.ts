import { jest } from '@jest/globals';
import type { VolcanoAuth } from '../../src/index.ts';
import { testAccessToken } from '../auth-token-fixtures.ts';

export const TEST_ACCESS_TOKEN = testAccessToken('00000000-0000-0000-0000-000000000001');
export const PROVIDER_REQUEST_LABELS: readonly [string, string] = [
  'OAuth provider request',
  'stale OAuth provider request',
];

export function providerMethod(volcano: VolcanoAuth, name: string, ...args: unknown[]): unknown {
  const method: unknown = Reflect.get(volcano.auth, name);
  if (typeof method !== 'function') {
    throw new TypeError(`Missing OAuth provider method ${name}`);
  }
  const result: unknown = Reflect.apply(method, volcano.auth, args);
  return result;
}

export function asyncProviderMethod(volcano: VolcanoAuth, name: string, ...args: unknown[]): Promise<unknown> {
  return Promise.resolve(providerMethod(volcano, name, ...args));
}

function browserStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear() {
      values.clear();
    },
    getItem(key) {
      return values.get(key) ?? null;
    },
    key(index) {
      return [...values.keys()][index] ?? null;
    },
    removeItem(key) {
      values.delete(key);
    },
    setItem(key, value) {
      values.set(key, value);
    },
  };
}

export function oauthWindow(): object {
  return {
    document: {},
    localStorage,
    sessionStorage: browserStorage(),
    location: { origin: 'https://app.test', pathname: '/auth/callback', assign: jest.fn() },
  };
}
