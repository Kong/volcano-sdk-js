/** @jest-environment ./__tests__/node-environment.cjs */
import { afterEach, expect, jest, test } from '@jest/globals';
import {
  type AuthOAuthUrlHost,
  getHostedAuthUrl,
  resolveOAuthRedirectTarget,
  resolveProjectIdForHostedAuth,
  signInWithHostedAuth,
  signInWithOAuth,
} from '../src/auth-oauth-url.ts';

const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');

afterEach(() => {
  if (originalWindow === undefined) {
    Reflect.deleteProperty(globalThis, 'window');
  } else {
    Object.defineProperty(globalThis, 'window', originalWindow);
  }
});

function browser(assign?: (url: string) => void): void {
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      document: {},
      location: {
        origin: 'https://app.example.test',
        pathname: '/callback',
        assign,
      },
    },
  });
}

function fixture(): {
  host: AuthOAuthUrlHost;
  stored: ReturnType<typeof jest.fn<(nonce: string, redirect?: string) => void>>;
} {
  const stored = jest.fn<(nonce: string, redirect?: string) => void>();
  return {
    host: {
      apiUrl: 'https://api.example.test',
      anonKey: 'anon-key',
      _generateAuthStateNonce: () => 'nonce-1',
      _storeAuthState: stored,
      _resolveOAuthRedirectTarget: resolveOAuthRedirectTarget,
      _resolveProjectIdForHostedAuth: () => 'project-1',
      getHostedAuthUrl: () => 'https://api.example.test/projects/project-1/auth/hosted',
      signInWithOAuth: () => 'https://api.example.test/oauth',
    },
    stored,
  };
}

test('OAuth and hosted auth refuse server-side navigation', () => {
  Object.defineProperty(globalThis, 'window', { configurable: true, value: undefined });
  const { host } = fixture();

  expect(() => signInWithOAuth(host, 'google', {})).toThrow('only available in browser');
  expect(() => getHostedAuthUrl(host, {})).toThrow('only available in the browser');
});

test('OAuth preserves application query parameters and binds the nonce', () => {
  const navigate = jest.fn<(url: string) => void>(() => {
    throw new Error('Not implemented: navigation');
  });
  browser(navigate);
  const { host, stored } = fixture();

  const url = new URL(
    signInWithOAuth(host, 'google', {
      redirectTo: 'https://app.example.test/callback?keep=one',
    }),
  );
  const redirect = new URL(url.searchParams.get('redirect_url') ?? '');

  expect(navigate).toHaveBeenCalledWith(url.toString());
  expect(stored).toHaveBeenCalledWith('nonce-1', 'https://app.example.test/callback?keep=one');
  expect(redirect.searchParams.get('keep')).toBe('one');
  expect(redirect.search).toBe('?keep=one&vh_state=nonce-1');
  expect(redirect.searchParams.get('vh_state')).toBe('nonce-1');
  expect(url.searchParams.get('client_state')).toBe('nonce-1');
});

test('a real browser navigation failure is propagated', () => {
  browser(() => {
    throw new Error('navigation blocked');
  });
  const { host } = fixture();

  expect(() => signInWithOAuth(host, 'google', {})).toThrow('navigation blocked');
});

test('OAuth falls back to href in an embedded browser without location.assign', () => {
  browser();
  const { host } = fixture();

  const url = signInWithOAuth(host, 'google', {});

  expect(window.location.href).toBe(url);
});

test('navigation still propagates an error without a string message', () => {
  const failure = new Error('navigation blocked');
  Object.defineProperty(failure, 'message', { value: undefined });
  browser(() => {
    throw failure;
  });
  const { host } = fixture();

  let received: unknown;
  try {
    signInWithHostedAuth(host, {});
  } catch (error) {
    received = error;
  }
  expect(received).toBe(failure);
});

test('navigation prefers an Error message over a custom string representation', () => {
  const failure = new Error('Not implemented: navigation');
  failure.toString = () => 'opaque error';
  browser(() => {
    throw failure;
  });
  const { host } = fixture();

  expect(signInWithHostedAuth(host, {})).toBe(
    'https://api.example.test/projects/project-1/auth/hosted',
  );
});

test('navigation falls back to the Error string when its message is not a string', () => {
  const failure = new Error('navigation blocked');
  Object.defineProperty(failure, 'message', { value: undefined });
  failure.toString = () => 'Not implemented: navigation';
  browser(() => {
    throw failure;
  });
  const { host } = fixture();

  expect(signInWithHostedAuth(host, {})).toBe(
    'https://api.example.test/projects/project-1/auth/hosted',
  );
});

test('hosted auth includes an action only when requested and returns its URL', () => {
  const navigate = jest.fn<(url: string) => void>(() => {
    throw new Error('Not implemented: navigation');
  });
  browser(navigate);
  const { host, stored } = fixture();

  const withAction = new URL(getHostedAuthUrl(host, { action: 'signup' }));
  const withoutAction = new URL(getHostedAuthUrl(host, {}));
  const withEmptyAction = new URL(getHostedAuthUrl(host, { action: '' }));

  expect(withAction.searchParams.get('action')).toBe('signup');
  expect(withoutAction.searchParams.has('action')).toBe(false);
  expect(withEmptyAction.searchParams.has('action')).toBe(false);
  expect(withAction.searchParams.get('state')).toBe('nonce-1');
  expect(stored).toHaveBeenCalledWith('nonce-1');
  expect(signInWithHostedAuth(host, {})).toBe(host.getHostedAuthUrl());
  expect(navigate).toHaveBeenCalled();
});

test('hosted auth uses an explicit project ID and rejects an opaque key without one', () => {
  const { host } = fixture();

  expect(resolveProjectIdForHostedAuth(host, '  explicit-project  ')).toBe('explicit-project');
  expect(() => resolveProjectIdForHostedAuth(host, '  ')).toThrow(
    'Unable to determine project id for hosted auth',
  );
  expect(() => resolveProjectIdForHostedAuth(host, null)).toThrow(
    'Unable to determine project id for hosted auth',
  );
});

test('OAuth redirect defaults on blank input and adds one nonce parameter', () => {
  browser(() => {
    throw new Error('Not implemented: navigation');
  });
  const { host, stored } = fixture();

  const url = new URL(signInWithOAuth(host, 'github', { redirectTo: '  ' }));
  const redirect = new URL(url.searchParams.get('redirect_url') ?? '');

  expect(stored).toHaveBeenCalledWith('nonce-1', 'https://app.example.test/callback');
  expect(redirect.search).toBe('?vh_state=nonce-1');
  expect(resolveOAuthRedirectTarget('  https://app.example.test/other  ')).toBe(
    'https://app.example.test/other',
  );
});
