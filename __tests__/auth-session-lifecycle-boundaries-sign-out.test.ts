/** @jest-environment ./__tests__/node-environment.cjs */
import { expect, jest, test } from '@jest/globals';
import {
  type AuthContext,
  type RefreshResult,
  revokeAccessSession,
  signOutCaptured,
} from '../src/auth-session-lifecycle.ts';
import { expectPresent } from './support/assertions.ts';
import { fixture, type RequestResult, session } from './support/auth-boundaries-lifecycle-fixtures.ts';

test('sign-out normalizes a rejected concurrent refresh and still clears the session', async () => {
  const { host, context } = fixture();
  context.operations.verifyPair(null);
  const failedRefresh = jest.fn<() => Promise<RefreshResult>>().mockRejectedValue('transport failed');

  expect(await signOutCaptured(host, context, failedRefresh())).toEqual({
    error: new Error('Session revocation failed'),
  });
  expect(Reflect.get(host, '_clearSession')).toHaveBeenCalledWith(context);
  expect(Reflect.get(host, '_anonFetch')).not.toHaveBeenCalled();
});

test('sign-out accepts a completed preceding refresh even when its old pair is unverified', async () => {
  const { host, context } = fixture();
  context.operations.verifyPair(null);
  host._anonFetch = jest.fn(() =>
    Promise.resolve({ ok: true, status: 204, data: null, error: null } satisfies RequestResult),
  );

  await expect(
    signOutCaptured(host, context, Promise.resolve({ ok: true, status: 200, data: session, error: null })),
  ).resolves.toEqual({ error: null });
  expect(Reflect.get(host, '_anonFetch')).toHaveBeenCalledWith('/auth/logout', {
    method: 'POST',
    body: JSON.stringify({ refresh_token: 'refresh' }),
  });
});

test('sign-out clears a session ID by generation without clearing a replacement session', async () => {
  const { host, context } = fixture();
  const accessToken = `x.${Buffer.from(JSON.stringify({ session_id: '00000000-0000-4000-8000-000000000001' })).toString('base64url')}.x`;
  const captured: AuthContext = { ...context, accessToken };
  host._anonFetch = jest.fn(() =>
    Promise.resolve({ ok: true, status: 204, data: null, error: null } satisfies RequestResult),
  );

  await expect(signOutCaptured(host, captured, null)).resolves.toEqual({ error: null });
  expect(Reflect.get(host, '_clearSessionAtGeneration')).toHaveBeenCalledWith(context.generation);
  expect(Reflect.get(host, '_clearSession')).not.toHaveBeenCalled();
});

test('a stale sign-out retains the revocation error as a writable cause', async () => {
  const { host, context } = fixture();
  const revocationError = new Error('revoke failed');
  host._anonFetch = jest.fn(() =>
    Promise.resolve({
      ok: false,
      status: 500,
      data: null,
      error: revocationError,
    } satisfies RequestResult),
  );
  host._clearSession = jest.fn(() => false);

  const result = await signOutCaptured(host, context, null);
  expect(result.error?.name).toBe('AuthSessionChangedError');
  expect(Object.getOwnPropertyDescriptor(result.error, 'cause')).toEqual({
    configurable: true,
    enumerable: false,
    value: revocationError,
    writable: true,
  });
});

test('a stale sign-out without revocation error has no cause', async () => {
  const { host, context } = fixture();
  host._anonFetch = jest.fn(() =>
    Promise.resolve({ ok: true, status: 204, data: null, error: null } satisfies RequestResult),
  );
  host._clearSession = jest.fn(() => false);

  const result = await signOutCaptured(host, context, null);
  expect(result.error?.name).toBe('AuthSessionChangedError');
  expectPresent(result.error);
  expect(Object.hasOwn(result.error, 'cause')).toBe(false);
});

test('sign-out normalizes a nonstandard failure retained from an in-flight refresh', async () => {
  const { host, context } = fixture();
  const accessToken = `x.${Buffer.from(JSON.stringify({ session_id: '00000000-0000-4000-8000-000000000001' })).toString('base64url')}.x`;
  const captured: AuthContext = { ...context, accessToken };
  captured.operations.verifyPair(null);
  const rejection = new Error('transport failed');
  Object.setPrototypeOf(rejection, null);

  await expect(signOutCaptured(host, captured, Promise.reject(rejection))).resolves.toEqual({
    error: new Error('Sign out failed'),
  });
  expect(Reflect.get(host, '_anonFetch')).toHaveBeenCalledTimes(1);
});

test('access-session revocation reports a failed refresh after an unauthorized delete', async () => {
  const { host, context } = fixture();
  const refreshError = new Error('refresh denied');
  host._fetchSessionRefresh = jest.fn(() =>
    Promise.resolve<RefreshResult>({ ok: false, status: 403, data: null, error: refreshError }),
  );

  expect(await revokeAccessSession(host, context, 'session-1', null)).toBe(refreshError);
  expect(Reflect.get(host, '_anonFetch')).toHaveBeenCalledTimes(1);
});

test('access-session revocation keeps the delete failure after a preceding refresh', async () => {
  const { host, context } = fixture();
  const deleteError = new Error('delete unauthorized');
  host._anonFetch = jest.fn(() =>
    Promise.resolve({
      ok: false,
      status: 401,
      data: null,
      error: deleteError,
    } satisfies RequestResult),
  );
  const preceding: RefreshResult = { ok: true, status: 200, data: session, error: null };

  expect(await revokeAccessSession(host, context, 'session-1', preceding)).toBe(deleteError);
  expect(Reflect.get(host, '_fetchSessionRefresh')).not.toHaveBeenCalled();
});

test('access-session revocation falls back to the delete error for an empty prior error', async () => {
  const { host, context } = fixture();
  const deleteError = new Error('delete unauthorized');
  host._anonFetch = jest.fn(() =>
    Promise.resolve({
      ok: false,
      status: 401,
      data: null,
      error: deleteError,
    } satisfies RequestResult),
  );
  const preceding = { ok: false, error: null } satisfies Parameters<typeof revokeAccessSession>[3];

  expect(await revokeAccessSession(host, context, 'session-1', preceding)).toBe(deleteError);
});
