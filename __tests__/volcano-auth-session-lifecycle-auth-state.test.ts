/** @jest-environment ./__tests__/node-environment.cjs */
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { VolcanoAuth } from '../src/index.ts';
import { reply } from './auth-concurrency-fixtures.ts';
import { installWindow, restoreWindow } from './support/volcano-auth-sessions-fixtures.ts';

const fetchMock = jest.mocked(globalThis.fetch);
const config = { apiUrl: 'https://api.test.com', anonKey: 'ak-test-anon-key' };
let volcano: VolcanoAuth;

beforeEach(() => {
  installWindow({ document: {}, localStorage });
  volcano = new VolcanoAuth(config);
});

afterEach(restoreWindow);

function notifiesCallbacks(): void {
  it('should call callback with current user', () => {
    volcano.currentUser = { id: 'user-123', email: 'fixture@example.com', status: 'active' };
    const callback = jest.fn();

    volcano.auth.onAuthStateChange(callback);

    expect(callback).toHaveBeenCalledWith({
      id: 'user-123',
      email: 'fixture@example.com',
      status: 'active',
    });
  });

  it('should call callback on session change', async () => {
    const callback = jest.fn();
    volcano.auth.onAuthStateChange(callback);

    // Clear initial call
    callback.mockClear();

    // Simulate signin
    fetchMock.mockResolvedValueOnce(
      reply(200, {
        user: { id: 'user-456', email: 'fixture@example.com', status: 'active' },
        access_token: 'token',
        refresh_token: 'refresh',
        expires_in: 3600,
      }),
    );

    await volcano.auth.signIn({ email: 'test@test.com', password: 'pass' });

    expect(callback).toHaveBeenCalledWith({
      id: 'user-456',
      email: 'fixture@example.com',
      status: 'active',
    });
  });
}

function unsubscribesCallbacks(): void {
  it('should return unsubscribe function', () => {
    const callback = jest.fn();
    const unsubscribe = volcano.auth.onAuthStateChange(callback);

    expect(typeof unsubscribe).toBe('function');

    // Clear initial call
    callback.mockClear();

    // Unsubscribe
    unsubscribe();

    // Trigger session change
    volcano._setSession({
      user: { id: 'user-789', email: 'fixture@example.com', status: 'active' },
      access_token: 'token',
      refresh_token: 'refresh',
    });

    // Callback should NOT be called since we unsubscribed
    expect(callback).not.toHaveBeenCalled();
  });
}

function notifiesMultipleCallbacks(): void {
  it('should support multiple callbacks', () => {
    const callback1 = jest.fn();
    const callback2 = jest.fn();

    volcano.auth.onAuthStateChange(callback1);
    volcano.auth.onAuthStateChange(callback2);

    // Clear initial calls
    callback1.mockClear();
    callback2.mockClear();

    // Trigger session change
    volcano._setSession({
      user: { id: 'user-multi', email: 'fixture@example.com', status: 'active' },
      access_token: 'token',
      refresh_token: 'refresh',
    });

    expect(callback1).toHaveBeenCalledWith({
      id: 'user-multi',
      email: 'fixture@example.com',
      status: 'active',
    });
    expect(callback2).toHaveBeenCalledWith({
      id: 'user-multi',
      email: 'fixture@example.com',
      status: 'active',
    });
  });
}

function isolatesFailingCallbacks(): void {
  it('should not crash if callback throws error', () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation((...messages: unknown[]) => {
      expect(messages).not.toHaveLength(0);
    });
    const badCallback = jest.fn<(user: unknown) => void>(() => {
      throw new Error('Callback error');
    });
    const goodCallback = jest.fn();

    // Register both callbacks
    volcano.auth.onAuthStateChange(badCallback);
    volcano.auth.onAuthStateChange(goodCallback);

    // Clear initial calls
    badCallback.mockClear();
    goodCallback.mockClear();

    // Trigger session change - should not throw
    expect(() => {
      volcano._setSession({
        user: { id: 'user-err', email: 'fixture@example.com', status: 'active' },
        access_token: 'token',
        refresh_token: 'refresh',
      });
    }).not.toThrow();

    // Bad callback was called (and threw)
    expect(badCallback).toHaveBeenCalled();
    // Good callback still got called despite the error
    expect(goodCallback).toHaveBeenCalledWith({
      id: 'user-err',
      email: 'fixture@example.com',
      status: 'active',
    });
    // Error was logged
    expect(consoleError).toHaveBeenCalled();

    consoleError.mockRestore();
  });
}

function isolatesFailingInitialCallbacks(): void {
  it('should not crash if callback throws error on initial registration', () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation((...messages: unknown[]) => {
      expect(messages).not.toHaveLength(0);
    });
    volcano.currentUser = { id: 'current-user', email: 'fixture@example.com', status: 'active' };

    const badCallback = jest.fn<(user: unknown) => void>(() => {
      throw new Error('Initial callback error');
    });

    // Should not throw when registering
    expect(() => {
      volcano.auth.onAuthStateChange(badCallback);
    }).not.toThrow();

    expect(badCallback).toHaveBeenCalledWith({
      id: 'current-user',
      email: 'fixture@example.com',
      status: 'active',
    });
    expect(consoleError).toHaveBeenCalled();

    consoleError.mockRestore();
  });
}

describe('VolcanoAuth session lifecycle', () => {
  describe('Authentication - onAuthStateChange', () => {
    notifiesCallbacks();
    unsubscribesCallbacks();
    notifiesMultipleCallbacks();
    isolatesFailingCallbacks();
    isolatesFailingInitialCallbacks();
  });
});
