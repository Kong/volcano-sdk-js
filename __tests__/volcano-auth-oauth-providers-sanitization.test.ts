/** @jest-environment ./__tests__/node-environment.cjs */
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { VolcanoAuth } from '../src/index.ts';
import { reply } from './auth-concurrency-fixtures.ts';
import {
  asyncProviderMethod,
  oauthWindow,
  providerMethod,
  TEST_ACCESS_TOKEN,
} from './support/volcano-auth-oauth-fixtures.ts';
import { installWindow, restoreWindow } from './support/volcano-auth-sessions-fixtures.ts';

const config = { apiUrl: 'https://api.test.com', anonKey: 'ak-test-anon-key' };
const fetchMock = jest.mocked(globalThis.fetch);
let volcano: VolcanoAuth;

beforeEach(() => {
  installWindow(oauthWindow());
  volcano = new VolcanoAuth(config);
});

afterEach(restoreWindow);

function sanitizesSignInProviders(): void {
  it('should throw error for invalid provider format in signInWithOAuth', () => {
    // Empty string should fail
    expect(() => providerMethod(volcano, 'signInWithOAuth', '')).toThrow('Provider must be a non-empty string');
    // Uppercase should fail (sanitization)
    expect(() => providerMethod(volcano, 'signInWithOAuth', 'Google')).toThrow(
      'Provider must be a non-empty string containing only lowercase letters, numbers, and hyphens',
    );
    // Special characters should fail
    expect(() => providerMethod(volcano, 'signInWithOAuth', 'my_provider')).toThrow(
      'Provider must be a non-empty string containing only lowercase letters, numbers, and hyphens',
    );
  });

  it('should accept any valid-format provider (backend validates whitelist)', () => {
    // SDK accepts any valid format - backend validates if provider is supported
    expect(() => providerMethod(volcano, 'signInWithOAuth', 'google')).not.toThrow();
    expect(() => providerMethod(volcano, 'signInWithOAuth', 'github')).not.toThrow();
    // SDK passes, backend may reject
    expect(() => providerMethod(volcano, 'signInWithOAuth', 'facebook')).not.toThrow();
    expect(() => providerMethod(volcano, 'signInWithOAuth', 'custom-provider')).not.toThrow();
  });
}

function sanitizesAuthenticatedProviders(): void {
  it('should throw error for invalid format in linkOAuthProvider', async () => {
    volcano.accessToken = TEST_ACCESS_TOKEN;
    // Empty or invalid format fails
    await expect(asyncProviderMethod(volcano, 'linkOAuthProvider', '')).rejects.toThrow(
      'Provider must be a non-empty string',
    );
    await expect(asyncProviderMethod(volcano, 'linkOAuthProvider', 'My_Provider')).rejects.toThrow(
      'Provider must be a non-empty string containing only lowercase letters, numbers, and hyphens',
    );
  });

  it('should accept valid format in linkOAuthProvider (backend validates whitelist)', async () => {
    volcano.accessToken = TEST_ACCESS_TOKEN;
    fetchMock.mockResolvedValueOnce(reply(200, { authorization_url: 'https://example.com' }));
    // 'unknown-provider' has valid format, backend will validate if supported
    const result = await asyncProviderMethod(volcano, 'linkOAuthProvider', 'unknown-provider');
    expect(result).toMatchObject({ error: null });
  });

  it.each(['unlinkOAuthProvider', 'refreshOAuthToken', 'getOAuthProviderToken'])(
    'should throw error for invalid format in %s',
    async (method) => {
      volcano.accessToken = TEST_ACCESS_TOKEN;
      await expect(asyncProviderMethod(volcano, method, '')).rejects.toThrow('Provider must be a non-empty string');
    },
  );

  it('should throw error for invalid format in callOAuthAPI', async () => {
    volcano.accessToken = TEST_ACCESS_TOKEN;
    await expect(asyncProviderMethod(volcano, 'callOAuthAPI', '', { endpoint: '/test' })).rejects.toThrow(
      'Provider must be a non-empty string',
    );
  });
}

describe('VolcanoAuth OAuth provider operations', () => {
  describe('Security - Provider Sanitization', () => {
    // SDK now sanitizes provider format (lowercase letters, numbers, hyphens only)
    // but does NOT validate against a whitelist - backend handles provider validation
    sanitizesSignInProviders();
    sanitizesAuthenticatedProviders();
  });
});
