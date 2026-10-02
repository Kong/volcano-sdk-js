/** @jest-environment ./__tests__/node-environment.cjs */
import { afterEach, expect, jest, test } from '@jest/globals';
import {
  generateAuthStateNonce,
  getStorageItem,
  hasOAuthCallbackInUrl,
  hasSessionInUrl,
  peekAuthRedirectUrl,
  peekAuthState,
  removeOAuthResponseParams,
  removeStorageItem,
  setStorageItem,
  storeAuthState,
  stripAuthHashFromUrl,
  stripOAuthQueryFromUrl,
  takeAuthRedirectUrl,
  takeAuthState,
} from '../src/auth-browser.ts';

const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
const originalCrypto = Object.getOwnPropertyDescriptor(globalThis, 'crypto');

function setGlobal(name: string, value: unknown): void {
  Object.defineProperty(globalThis, name, { configurable: true, value });
}

function restoreGlobal(name: string, original: PropertyDescriptor | undefined): void {
  if (original === undefined) {
    Reflect.deleteProperty(globalThis, name);
  } else {
    Object.defineProperty(globalThis, name, original);
  }
}

afterEach(() => {
  restoreGlobal('window', originalWindow);
  restoreGlobal('crypto', originalCrypto);
  jest.restoreAllMocks();
});

function browser(overrides: Record<string, unknown> = {}): void {
  setGlobal('window', {
    document: {},
    location: {
      href: 'https://app.example.com/callback?code=one&state=nonce',
      hash: '#access_token=token&state=nonce',
      pathname: '/callback',
      search: '',
    },
    history: { state: null, replaceState: jest.fn() },
    sessionStorage: { getItem: jest.fn(() => null), setItem: jest.fn(), removeItem: jest.fn() },
    localStorage: { getItem: jest.fn(() => null), setItem: jest.fn(), removeItem: jest.fn() },
    ...overrides,
  });
}

const unavailableStorage = {
  getItem(): never {
    throw new Error('Storage blocked');
  },
  setItem(): never {
    throw new Error('Storage blocked');
  },
  removeItem(): never {
    throw new Error('Storage blocked');
  },
};

test('server-side browser helpers leave state untouched', () => {
  setGlobal('window', undefined);
  storeAuthState('nonce');
  expect(takeAuthState()).toBeNull();
  expect(peekAuthState()).toBeNull();
  expect(takeAuthRedirectUrl()).toBeNull();
  expect(peekAuthRedirectUrl()).toBeNull();
  expect(getStorageItem('token')).toBeNull();
  setStorageItem('token', 'value');
  removeStorageItem('token');
  expect(hasSessionInUrl()).toBe(false);
  expect(hasOAuthCallbackInUrl('https://app.example.com/callback', true)).toBe(false);
});

test('server-like globals with a window do not read browser storage or location', () => {
  const getItem = jest.fn(() => 'nonce');
  const setItem = jest.fn();
  const removeItem = jest.fn();
  setGlobal('window', {
    sessionStorage: { getItem, setItem, removeItem },
    localStorage: { getItem, setItem, removeItem },
    location: {
      href: 'https://app.example.com/callback?code=one&state=nonce',
      hash: '#access_token=token',
    },
  });

  storeAuthState('nonce', 'https://app.example.com/callback');
  expect(takeAuthState()).toBeNull();
  expect(peekAuthState()).toBeNull();
  expect(takeAuthRedirectUrl()).toBeNull();
  expect(peekAuthRedirectUrl()).toBeNull();
  expect(getStorageItem('token')).toBeNull();
  setStorageItem('token', 'value');
  removeStorageItem('token');
  expect(hasSessionInUrl()).toBe(false);
  expect(hasOAuthCallbackInUrl('https://app.example.com/callback', true)).toBe(false);
  expect(getItem).not.toHaveBeenCalled();
  expect(setItem).not.toHaveBeenCalled();
  expect(removeItem).not.toHaveBeenCalled();
});

test('nonce generation accepts browser and server Web Crypto and rejects unavailable sources', () => {
  setGlobal('window', undefined);
  setGlobal('crypto', { getRandomValues: (bytes: Uint8Array) => bytes.fill(7) });
  expect(generateAuthStateNonce()).toBe('07'.repeat(16));

  browser({ crypto: { getRandomValues: (bytes: Uint8Array) => bytes.fill(12) } });
  expect(generateAuthStateNonce()).toBe('0c'.repeat(16));

  setGlobal('crypto', null);
  for (const value of [null, 1, {}, { getRandomValues: null }]) {
    browser({ crypto: value });
    expect(() => generateAuthStateNonce()).toThrow('Web Crypto implementation');
  }
});

test('storage errors fail closed while a default redirect is removed', () => {
  browser({ sessionStorage: unavailableStorage, localStorage: unavailableStorage });
  storeAuthState('nonce');
  expect(takeAuthState()).toBeNull();
  expect(peekAuthState()).toBeNull();
  expect(takeAuthRedirectUrl()).toBeNull();
  expect(peekAuthRedirectUrl()).toBeNull();
  expect(getStorageItem('token')).toBeNull();
  setStorageItem('token', 'value');
  removeStorageItem('token');

  const removeItem = jest.fn();
  browser({ sessionStorage: { getItem: jest.fn(() => null), setItem: jest.fn(), removeItem } });
  storeAuthState('nonce');
  expect(removeItem).toHaveBeenCalledWith('volcano_auth_redirect_url');
});

test('URL cleanup keeps application fragments and handles unavailable history', () => {
  const replaceState = jest.fn();
  browser({
    location: { href: 'https://app.example.com/', pathname: '', search: '?keep=one', hash: '' },
    history: { state: null, replaceState },
  });
  stripOAuthQueryFromUrl(new URL('https://app.example.com?code=one#application'));
  expect(replaceState).toHaveBeenCalledWith(null, '', '/#application');
  stripOAuthQueryFromUrl(new URL('custom:'));
  expect(replaceState).toHaveBeenLastCalledWith(null, '', '/');
  stripAuthHashFromUrl(new URLSearchParams('access_token=token&state=nonce'));
  expect(replaceState).toHaveBeenLastCalledWith(null, '', '/?keep=one');

  browser({ history: null });
  expect(() => {
    stripAuthHashFromUrl(new URLSearchParams('access_token=token'));
  }).not.toThrow();
  browser({ history: {} });
  expect(() => {
    stripAuthHashFromUrl(new URLSearchParams('access_token=token'));
  }).not.toThrow();
  browser({ history: { replaceState: 1 } });
  expect(() => {
    stripAuthHashFromUrl(new URLSearchParams('access_token=token'));
  }).not.toThrow();
  browser({ history: unavailableStorage });
  expect(() => {
    stripOAuthQueryFromUrl(new URL('https://app.example.com?code=one'));
  }).not.toThrow();
});

test('OAuth cleanup strips every protocol response parameter and preserves application query', () => {
  const url = new URL(
    'https://app.example.com/callback?keep=one&code=c&state=s&error=e&error_description=d&error_uri=u&iss=i&vh_state=v#app',
  );
  removeOAuthResponseParams(url, false);
  expect(url.toString()).toBe('https://app.example.com/callback?keep=one#app');
  removeOAuthResponseParams(url);
  expect(url.toString()).toBe('https://app.example.com/callback?keep=one');
});

test('auth hash cleanup accepts provider errors as authentication fragments', () => {
  const replaceState = jest.fn();
  browser({ history: { state: null, replaceState } });
  stripAuthHashFromUrl(new URLSearchParams('error=denied&error_description=cancelled'));
  expect(replaceState).toHaveBeenCalledWith(null, '', '/callback');
});

test('broken location getters fail closed for session and OAuth callback peeks', () => {
  browser({
    location: {
      get hash(): never {
        throw new Error('Location blocked');
      },
      get href(): never {
        throw new Error('Location blocked');
      },
    },
  });
  expect(hasSessionInUrl()).toBe(false);
  expect(hasOAuthCallbackInUrl('https://app.example.com/callback', true)).toBe(false);
});

test('OAuth callback matching rejects malformed redirect targets and absent state', () => {
  browser();
  expect(hasOAuthCallbackInUrl('https://app.example.com/callback', true)).toBe(true);
  expect(hasOAuthCallbackInUrl('https://app.example.com/callback', false)).toBe(false);
  expect(hasOAuthCallbackInUrl('not a URL', true)).toBe(false);
  expect(hasOAuthCallbackInUrl('', true)).toBe(false);
  expect(hasOAuthCallbackInUrl(null, true)).toBe(false);
  browser({ location: { href: 'https://app.example.com/callback?state=nonce' } });
  expect(hasOAuthCallbackInUrl('https://app.example.com/callback', true)).toBe(false);
  for (const query of ['?code=&state=nonce', '?error=&state=nonce', '?code=one&state=']) {
    browser({ location: { href: `https://app.example.com/callback${query}` } });
    expect(hasOAuthCallbackInUrl('https://app.example.com/callback', true)).toBe(false);
  }
});
