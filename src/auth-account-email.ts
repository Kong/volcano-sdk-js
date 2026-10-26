import type { ContextRequest, RequestResult } from './auth-request.ts';
import { optionalStringField, optionalTokenField, requiredField } from './auth-response.ts';
import type { AuthContext } from './auth-session-lifecycle.ts';
import { assertAuthUser } from './auth-validation.ts';
import { AuthSessionChangedError } from './errors.ts';
import type { User } from './sdk-public-types.ts';

export interface MessageResult {
  message: string | null;
  error: Error | null;
}

interface AccountEmailHost {
  currentUser: User | null;
  _anonFetch(path: string, options: RequestInit): Promise<RequestResult>;
  _authFetchWithContext(
    path: string | (() => string),
    options?: RequestInit | (() => RequestInit),
  ): Promise<ContextRequest>;
  _isAuthContextCurrent(context: AuthContext): boolean;
  forgotPassword(email: string): Promise<MessageResult>;
}

export function adoptedUser(
  host: AccountEmailHost,
  context: AuthContext,
  result: RequestResult,
): { user: User | null; error: Error | null } {
  if (result.ok !== true) {
    return { user: null, error: result.error };
  }
  if (!host._isAuthContextCurrent(context)) {
    return { user: null, error: new AuthSessionChangedError() };
  }
  const user = requiredField(result.data, 'user');
  assertAuthUser(user);
  host.currentUser = user;
  return { user, error: null };
}

async function messageRequest(
  host: AccountEmailHost,
  path: string,
  body: Record<string, unknown>,
): Promise<MessageResult> {
  const result = await host._anonFetch(path, { method: 'POST', body: JSON.stringify(body) });
  return result.ok === true
    ? { message: optionalStringField(result.data, 'message'), error: null }
    : { message: null, error: result.error };
}

export function confirmEmail(host: AccountEmailHost, token: string): Promise<MessageResult> {
  return messageRequest(host, '/auth/confirm', { token });
}

export function resendConfirmation(host: AccountEmailHost, email: string): Promise<MessageResult> {
  return messageRequest(host, '/auth/resend-confirmation', { email });
}

export function forgotPassword(host: AccountEmailHost, email: string): Promise<MessageResult> {
  return messageRequest(host, '/auth/forgot-password', { email });
}

export function resetPasswordForEmail(host: AccountEmailHost, email: string): Promise<MessageResult> {
  return host.forgotPassword(email);
}

export function resetPassword(
  host: AccountEmailHost,
  { token, newPassword }: { token: string; newPassword: string },
): Promise<MessageResult> {
  return messageRequest(host, '/auth/reset-password', { token, new_password: newPassword });
}

interface EmailChangeResult {
  message: string | null;
  newEmail: string | null;
  emailChangeToken?: string | undefined;
  error: Error | null;
}

export async function requestEmailChange(host: AccountEmailHost, newEmail: string): Promise<EmailChangeResult> {
  const { result, context } = await host._authFetchWithContext('/auth/user/change-email', () => ({
    method: 'POST',
    body: JSON.stringify({ new_email: newEmail }),
  }));
  if (result.ok !== true) {
    return { message: null, newEmail: null, error: result.error };
  }
  if (!host._isAuthContextCurrent(context)) {
    return { message: null, newEmail: null, error: new AuthSessionChangedError() };
  }
  return {
    message: optionalStringField(result.data, 'message'),
    newEmail: optionalStringField(result.data, 'new_email'),
    emailChangeToken: optionalTokenField(result.data, 'email_change_token'),
    error: null,
  };
}

export async function confirmEmailChange(
  host: AccountEmailHost,
  emailChangeToken: string,
): Promise<{ user: User | null; error: Error | null }> {
  const { result, context } = await host._authFetchWithContext('/auth/user/confirm-email-change', () => ({
    method: 'POST',
    body: JSON.stringify({ email_change_token: emailChangeToken }),
  }));
  return adoptedUser(host, context, result);
}

export async function cancelEmailChange(host: AccountEmailHost): Promise<MessageResult> {
  const { result, context } = await host._authFetchWithContext('/auth/user/cancel-email-change', {
    method: 'DELETE',
  });
  if (result.ok !== true) {
    return { message: null, error: result.error };
  }
  if (!host._isAuthContextCurrent(context)) {
    return { message: null, error: new AuthSessionChangedError() };
  }
  return { message: optionalStringField(result.data, 'message'), error: null };
}
