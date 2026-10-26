import { expect, jest, test } from '@jest/globals';
import {
  type AuthAccountHost,
  cancelEmailChange,
  confirmEmailChange,
  convertAnonymous,
  getUser,
  requestEmailChange,
  updateUser,
} from '../src/auth-account.ts';
import { context, credentials, fixture, user } from './support/auth-boundaries-account-fixtures.ts';
import { recordAuthRequests } from './support/auth-request-recorder.ts';

test.each([
  ['updateUser', (host: AuthAccountHost) => updateUser(host, { metadata: { plan: 'pro' } })],
  ['convertAnonymous', (host: AuthAccountHost) => convertAnonymous(host, { ...credentials, metadata: {} })],
])('%s rejects an incomplete wire user without adopting it', async (_name, action) => {
  const host = fixture();
  host._authFetchWithContext = () =>
    Promise.resolve({
      result: { ok: true, status: 200, data: { user: { id: 'user-1' } }, error: null },
      context,
    });

  await expect(action(host)).rejects.toThrow('Auth user email must be a string');
  expect(host.currentUser).toBeNull();
});

test('getUser rejects a malformed successful response before adopting a user', async () => {
  const host = fixture();
  host._authFetchWithContext = () =>
    Promise.resolve({
      result: { ok: true, status: 200, data: null, error: null },
      context,
    });
  const notify = jest.fn();
  host._notifyAuthCallbacks = notify;

  await expect(getUser(host)).rejects.toThrow('Auth response must be an object');
  expect(notify).not.toHaveBeenCalled();
});

test.each([
  [{ id: 'user-1' }, 'Auth user email must be a string'],
  [{ id: 'user-1', email: 'user@example.com', status: null }, 'Auth user status must be active, banned, or deleted'],
])('getUser rejects incomplete wire users without mutating state', async (candidate, message) => {
  const host = fixture();
  const notify = jest.fn<AuthAccountHost['_notifyAuthCallbacks']>();
  host._notifyAuthCallbacks = notify;
  host._authFetchWithContext = () =>
    Promise.resolve({
      result: { ok: true, status: 200, data: { user: candidate }, error: null },
      context,
    });

  await expect(getUser(host)).rejects.toThrow(message);
  expect(host.currentUser).toBeNull();
  expect(notify).not.toHaveBeenCalled();
});

const authenticatedRequests = [
  { path: '/auth/user', options: undefined },
  {
    path: '/auth/user',
    options: {
      method: 'PUT',
      body: '{"password":"new-password","user_metadata":{"team":"volcano"}}',
    },
  },
  {
    path: '/auth/user/convert-anonymous',
    options: {
      method: 'POST',
      body: '{"email":"user@example.com","password":"password","user_metadata":{"team":"volcano"}}',
    },
  },
  {
    path: '/auth/user/change-email',
    options: { method: 'POST', body: '{"new_email":"new@example.com"}' },
  },
  {
    path: '/auth/user/confirm-email-change',
    options: { method: 'POST', body: '{"email_change_token":"change-token"}' },
  },
  { path: '/auth/user/cancel-email-change', options: { method: 'DELETE' } },
];

test('user and email-change actions send exact authenticated requests', async () => {
  const host = fixture();
  const data = {
    user,
    message: 'sent',
    new_email: 'new@example.com',
    email_change_token: 'change-token',
  };
  const { requests, authFetchWithContext } = recordAuthRequests({
    result: { ok: true, status: 200, data, error: null },
    context,
  });
  host._authFetchWithContext = authFetchWithContext;

  expect(await getUser(host)).toEqual({ user, error: null });
  expect(await updateUser(host, { password: 'new-password', metadata: { team: 'volcano' } })).toEqual({
    user,
    error: null,
  });
  expect(await convertAnonymous(host, { ...credentials, metadata: { team: 'volcano' } })).toEqual({
    user,
    error: null,
  });
  expect(await requestEmailChange(host, 'new@example.com')).toEqual({
    message: 'sent',
    newEmail: 'new@example.com',
    emailChangeToken: 'change-token',
    error: null,
  });
  expect(await confirmEmailChange(host, 'change-token')).toEqual({ user, error: null });
  expect(await cancelEmailChange(host)).toEqual({ message: 'sent', error: null });
  expect(requests).toEqual(authenticatedRequests);
});

test('email-change response rejects a non-string token before returning it', async () => {
  const host = fixture();
  host._authFetchWithContext = () =>
    Promise.resolve({
      result: {
        ok: true,
        status: 200,
        data: { message: 'sent', new_email: 'new@example.com', email_change_token: 42 },
        error: null,
      },
      context,
    });

  await expect(requestEmailChange(host, 'new@example.com')).rejects.toThrow(
    'Auth response email_change_token must be a string',
  );
});
