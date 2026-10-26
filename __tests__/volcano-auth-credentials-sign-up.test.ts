/** @jest-environment ./__tests__/node-environment.cjs */
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { VolcanoAuth } from '../src/index.ts';
import { reply } from './auth-concurrency-fixtures.ts';

const fetchMock = jest.mocked(globalThis.fetch);
const config = { apiUrl: 'https://api.test.com', anonKey: 'ak-test-anon-key' };
const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
let volcano: VolcanoAuth;

beforeEach(() => {
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { document: {}, localStorage },
  });
  volcano = new VolcanoAuth(config);
});

afterEach(() => {
  if (previousWindow === undefined) {
    Reflect.deleteProperty(globalThis, 'window');
  } else {
    Object.defineProperty(globalThis, 'window', previousWindow);
  }
});

function storageWriteKeys(): string[] {
  const write: unknown = Reflect.get(localStorage, 'setItem');
  if (!jest.isMockFunction(write)) {
    throw new Error('Missing storage spy');
  }
  return write.mock.calls.flatMap((args) => (typeof args[0] === 'string' ? [args[0]] : []));
}

function acknowledgesSignUps(): void {
  it('should acknowledge a session-less signup without issuing a session', async () => {
    // Session-less signup (VOL-309): the server returns an acknowledgement only.
    const mockResponse = {
      confirmation_required: true,
      message: 'If the account was created, a confirmation email has been sent.',
    };

    fetchMock.mockResolvedValueOnce(reply(200, mockResponse));

    const result = await volcano.auth.signUp({
      email: 'test@example.com',
      password: 'password123',
    });

    expect(result.user).toBeNull();
    expect(result.session).toBeNull();
    expect(result.confirmationRequired).toBe(true);
    expect(result.message).toBe(mockResponse.message);
    expect(result.error).toBeNull();
    // No session is issued, so neither token key is persisted (any value, incl. undefined/null).
    const persistedKeys = storageWriteKeys();
    expect(persistedKeys).not.toContain('volcano_access_token');
    expect(persistedKeys).not.toContain('volcano_refresh_token');
  });

  it('should return error on signup failure', async () => {
    fetchMock.mockResolvedValueOnce(reply(400, { error: 'Email already exists' }));

    const result = await volcano.auth.signUp({
      email: 'test@example.com',
      password: 'password123',
    });

    expect(result.user).toBeNull();
    expect(result.session).toBeNull();
    expect(result.error).toBeDefined();
    expect(result.error?.message).toBe('Email already exists');
  });
}

function reportsSignUpOutcomes(): void {
  it('should include error:null on successful signup', async () => {
    const mockResponse = {
      confirmation_required: false,
      message: 'If the account was created, you can now sign in.',
    };

    fetchMock.mockResolvedValueOnce(reply(200, mockResponse));

    const result = await volcano.auth.signUp({
      email: 'test@example.com',
      password: 'password123',
    });

    expect(result.error).toBeNull();
    expect(result.confirmationRequired).toBe(false);
    expect(result.message).toBe(mockResponse.message);
  });

  it('signs in after signup when confirmation is not required and signInWhenAllowed is set', async () => {
    fetchMock.mockResolvedValueOnce(reply(200, { confirmation_required: false, message: 'ok' })).mockResolvedValueOnce(
      reply(200, {
        user: { id: 'user-123', email: 'test@example.com', status: 'active' },
        access_token: 'access-token-123',
        refresh_token: 'refresh-token-123',
        expires_in: 3600,
      }),
    );

    const result = await volcano.auth.signUp({
      email: 'test@example.com',
      password: 'password123',
      signInWhenAllowed: true,
    });

    // A follow-up signin was issued, establishing and persisting a session.
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(result.confirmationRequired).toBe(false);
    expect(result.user).toEqual({ id: 'user-123', email: 'test@example.com', status: 'active' });
    expect(result.session?.access_token).toBe('access-token-123');
    expect(result.error).toBeNull();
    expect(Reflect.get(localStorage, 'setItem')).toHaveBeenCalledWith('volcano_access_token', 'access-token-123');
  });
}

function guardsSignInAfterSignUp(): void {
  it('does not sign in when confirmation is required, even with signInWhenAllowed', async () => {
    fetchMock.mockResolvedValueOnce(reply(200, { confirmation_required: true, message: 'check your email' }));

    const result = await volcano.auth.signUp({
      email: 'test@example.com',
      password: 'password123',
      signInWhenAllowed: true,
    });

    // Only the signup request is made; no session is established.
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(result.confirmationRequired).toBe(true);
    expect(result.user).toBeNull();
    expect(result.session).toBeNull();
    const persistedKeys = storageWriteKeys();
    expect(persistedKeys).not.toContain('volcano_access_token');
    expect(persistedKeys).not.toContain('volcano_refresh_token');
  });

  it('surfaces the sign-in error when the follow-up sign-in fails', async () => {
    fetchMock
      .mockResolvedValueOnce(reply(200, { confirmation_required: false, message: 'ok' }))
      .mockResolvedValueOnce(reply(429, { error: 'rate limit exceeded' }));

    const result = await volcano.auth.signUp({
      email: 'test@example.com',
      password: 'password123',
      signInWhenAllowed: true,
    });

    expect(result.confirmationRequired).toBe(false);
    expect(result.user).toBeNull();
    expect(result.session).toBeNull();
    expect(result.error).toBeDefined();
    expect(result.error?.message).toBe('rate limit exceeded');
  });
}

describe('VolcanoAuth credentials', () => {
  describe('Authentication - signUp', () => {
    acknowledgesSignUps();
    reportsSignUpOutcomes();
    guardsSignInAfterSignUp();
  });
});
