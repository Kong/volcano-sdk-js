/** @jest-environment ./__tests__/node-environment.cjs */
import { beforeEach, describe, expect, it } from '@jest/globals';
import { VolcanoAuth } from '../src/index.ts';

// Match the prior jsdom suite: its JSON clone path keeps metadata in Jest's realm.
Object.defineProperty(globalThis, 'structuredClone', { configurable: true, value: undefined });

const config = {
  apiUrl: 'https://api.test.com',
  anonKey: 'ak-test-anon-key',
};

let volcano: VolcanoAuth;

// Public auth methods, grouped as the auth surface documents them.
const AUTH_METHODS = [
  // Core auth
  'signUp',
  'signIn',
  'getSession',
  'signOut',
  'getUser',
  'updateUser',
  'refreshSession',
  'onAuthStateChange',
  'user',
  // Anonymous
  'signInAnonymously',
  'convertAnonymous',
  // Email confirmation
  'confirmEmail',
  'resendConfirmation',
  // Password recovery
  'resetPasswordForEmail',
  'resetPassword',
  // Email change
  'requestEmailChange',
  'confirmEmailChange',
  'cancelEmailChange',
  // OAuth
  'signInWithOAuth',
  'signInWithGoogle',
  'signInWithGitHub',
  'signInWithMicrosoft',
  'signInWithApple',
  'linkOAuthProvider',
  'unlinkOAuthProvider',
  'getLinkedOAuthProviders',
  'refreshOAuthToken',
  'getOAuthProviderToken',
  'callOAuthAPI',
  // Session management
  'setSession',
  'getSessions',
  'deleteSession',
  'deleteAllOtherSessions',
] as const satisfies readonly (keyof VolcanoAuth['auth'])[];
// Legacy aliases that the public auth type does not declare.
const UNTYPED_AUTH_ALIASES = ['signUpAnonymous', 'forgotPassword'] as const;

function authMethodTypes(auth: VolcanoAuth['auth']): Record<string, string> {
  return Object.fromEntries([
    ...AUTH_METHODS.map((name) => [name, typeof auth[name]]),
    ...UNTYPED_AUTH_ALIASES.map((name) => [name, typeof Reflect.get(auth, name)]),
  ]);
}

function validatesConfig(): void {
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
}

function rejectsBrowserServiceKeys(): void {
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
}

function acceptsServerAccessTokens(): void {
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
}

function exposesAuthSurface(): void {
  it('should have auth and functions sub-objects', () => {
    expect(volcano.auth).toBeDefined();
    expect(volcano.functions).toBeDefined();
    expect(typeof volcano.auth.signUp).toBe('function');
    expect(typeof volcano.auth.signIn).toBe('function');
    expect(typeof volcano.functions.invoke).toBe('function');
  });

  it('should expose all auth methods', () => {
    expect(authMethodTypes(volcano.auth)).toEqual(
      Object.fromEntries([...AUTH_METHODS, ...UNTYPED_AUTH_ALIASES].map((name) => [name, 'function'])),
    );
  });
}

describe('VolcanoAuth', () => {
  beforeEach(() => {
    volcano = new VolcanoAuth(config);
  });

  describe('Constructor', () => {
    validatesConfig();
    rejectsBrowserServiceKeys();
    acceptsServerAccessTokens();
    exposesAuthSurface();
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
});
