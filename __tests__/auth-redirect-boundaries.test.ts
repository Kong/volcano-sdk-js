/** @jest-environment ./__tests__/node-environment.cjs */
import { afterEach, expect, jest, test } from '@jest/globals';
import {
  completeOAuthExchange,
  consumeOAuthCodeFromUrl,
  consumeSessionFromUrl,
  type OAuthRedirectHost,
  replaceSessionFromUrl,
} from '../src/auth-redirect.ts';
import { AuthSessionOperations } from '../src/auth-session.ts';

const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
const session = {
  access_token: 'access',
  refresh_token: 'refresh',
  user: { id: 'user-1' },
};

function setWindow(location: unknown): void {
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { document: {}, location },
  });
}

afterEach(() => {
  if (originalWindow === undefined) {
    Reflect.deleteProperty(globalThis, 'window');
  } else {
    Object.defineProperty(globalThis, 'window', originalWindow);
  }
  jest.restoreAllMocks();
});

function host(): OAuthRedirectHost {
  return {
    _urlSessionConsumed: false,
    _sessionGeneration: 0,
    _sessionOperations: new AuthSessionOperations(),
    accessToken: null,
    refreshToken: null,
    currentUser: null,
    _hasSessionInUrl: jest.fn(() => true),
    _takeAuthState: jest.fn(() => 'nonce'),
    _takeAuthRedirectURL: jest.fn(() => null),
    _replaceSessionFromUrl: jest.fn(),
    _stripAuthHashFromUrl: jest.fn(),
    _setStorageItem: jest.fn(),
    _removeStorageItem: jest.fn(),
    _oauthExchangeError: null,
    _oauthExchangePromise: null,
    _stripOAuthQueryFromUrl: jest.fn(),
    _anonFetch: jest.fn(() => Promise.resolve({ ok: true, data: session, error: null })),
    _setSession: jest.fn(() => true),
  };
}

test('fragment handoff stops after consumption or when no token exists', () => {
  const client = host();
  client._urlSessionConsumed = true;
  expect(consumeSessionFromUrl(client)).toBe(false);
  client._urlSessionConsumed = false;
  client._hasSessionInUrl = jest.fn(() => false);
  expect(consumeSessionFromUrl(client)).toBe(false);
  client._hasSessionInUrl = jest.fn(() => true);
  setWindow({ hash: '#state=nonce' });
  expect(consumeSessionFromUrl(client)).toBe(false);
  expect(Reflect.get(client, '_takeAuthState')).not.toHaveBeenCalled();
});

test('fragment handoff fails closed if the location getter throws', () => {
  const client = host();
  setWindow({
    get hash(): never {
      throw new Error('Location blocked');
    },
  });
  expect(consumeSessionFromUrl(client)).toBe(false);
  expect(Reflect.get(client, '_takeAuthState')).not.toHaveBeenCalled();
});

test('fragment handoff rejects a missing state without adopting tokens', () => {
  const client = host();
  setWindow({ hash: '#access_token=token' });
  expect(consumeSessionFromUrl(client)).toBe(false);
  expect(client._urlSessionConsumed).toBe(true);
  expect(Reflect.get(client, '_replaceSessionFromUrl')).not.toHaveBeenCalled();
  expect(Reflect.get(client, '_stripAuthHashFromUrl')).toHaveBeenCalledTimes(1);
});

test('token-only handoff clears an old refresh credential', () => {
  const client = host();
  client.refreshToken = 'old-refresh';
  replaceSessionFromUrl(client, 'new-access', '');
  expect(client.refreshToken).toBeNull();
  expect(Reflect.get(client, '_removeStorageItem')).toHaveBeenCalledWith('volcano_refresh_token');
  expect(client._sessionGeneration).toBe(1);
});

test('OAuth callback rejects missing state and malformed locations', async () => {
  const client = host();
  setWindow({ href: 'https://app.example.com/callback?code=one' });
  expect(await consumeOAuthCodeFromUrl(client)).toBe(false);
  setWindow({
    get href(): never {
      throw new Error('Location blocked');
    },
  });
  expect(await consumeOAuthCodeFromUrl(client)).toBe(false);
  expect(Reflect.get(client, '_takeAuthState')).not.toHaveBeenCalled();
});

test('OAuth exchange uses the current callback URL when no redirect was stored', async () => {
  const client = host();
  setWindow({ href: 'https://app.example.com/callback?code=one&state=nonce' });
  expect(await consumeOAuthCodeFromUrl(client)).toBe(true);
  expect(Reflect.get(client, '_anonFetch')).toHaveBeenCalledWith('/auth/oauth/exchange', {
    method: 'POST',
    body: JSON.stringify({
      code: 'one',
      redirect_url: 'https://app.example.com/callback?code=one&state=nonce',
    }),
  });
  expect(Reflect.get(client, '_setSession')).toHaveBeenCalledWith(session, 0);
});

test('OAuth exchange records a useful error for an empty transport failure', async () => {
  const client = host();
  client._anonFetch = jest.fn(() => Promise.resolve({ ok: false, data: null, error: null }));
  setWindow({ href: 'https://app.example.com/callback?code=one&state=nonce' });
  expect(await consumeOAuthCodeFromUrl(client)).toBe(false);
  expect(client._oauthExchangeError).toEqual(new Error('OAuth code exchange failed'));
});

test('OAuth exchange rejects malformed successful payloads', async () => {
  const client = host();
  client._anonFetch = jest.fn(() => Promise.resolve({ ok: true, data: {}, error: null }));
  setWindow({ href: 'https://app.example.com/callback?code=one&state=nonce' });
  expect(await consumeOAuthCodeFromUrl(client)).toBe(false);
  expect(client._oauthExchangeError).toEqual(
    new TypeError('Session access_token must be a non-empty string'),
  );
  expect(Reflect.get(client, '_setSession')).not.toHaveBeenCalled();
});

test('complete exchange ignores no pending work and retains a replacement promise', async () => {
  const client = host();
  await completeOAuthExchange(client);
  const replacement = Promise.resolve(true);
  client._oauthExchangePromise = Promise.resolve(true).then(() => {
    client._oauthExchangePromise = replacement;
    return true;
  });
  await completeOAuthExchange(client);
  expect(client._oauthExchangePromise).toBe(replacement);
});

test.each([new Error('exchange failed'), new TypeError('exchange failed')])(
  'complete exchange captures a rejected callback: %p',
  async (error) => {
    const client = host();
    client._oauthExchangePromise = Promise.reject(error);
    await completeOAuthExchange(client);
    expect(client._oauthExchangeError).toEqual(error);
    expect(client._oauthExchangePromise).toBeNull();
  },
);

test('complete exchange normalizes a non-Error transport rejection', async () => {
  const client = host();
  const externalCallback = jest.fn<() => Promise<boolean>>().mockRejectedValue('failed');
  client._oauthExchangePromise = externalCallback();
  await completeOAuthExchange(client);
  expect(client._oauthExchangeError).toEqual(new Error('OAuth code exchange failed'));
  expect(client._oauthExchangePromise).toBeNull();
});
