import type { ContextRequest, RequestResult } from './auth-request.ts';
import { optionalField, requiredField } from './auth-response.ts';
import type { AuthContext } from './auth-session-lifecycle.ts';
import {
  assertCompleteSession,
  type CompleteSessionFields,
  validateCompleteSession,
} from './auth-validation.ts';
import { AuthSessionChangedError } from './errors.ts';
import type { authSignin } from './generated/client.ts';
import { cloneJsonValue } from './json-clone.ts';

export interface AuthAccountHost {
  _sessionGeneration: number;
  _pendingUrlAuthNotify: boolean;
  currentUser: unknown;
  accessToken: string | null;
  refreshToken: string | null;
  _authCallbacks: ((user: unknown) => void)[];
  readonly _transport: { authSignin: typeof authSignin };
  _generatedOptions(authorization: 'anon'): Parameters<typeof authSignin>[1];
  _anonFetch(path: string, options: RequestInit): Promise<RequestResult>;
  _authFetchWithContext(
    path: string | (() => string),
    options?: RequestInit | (() => RequestInit),
  ): Promise<ContextRequest>;
  _setSession(data: unknown, expectedGeneration: number): boolean;
  _adoptSessionInMemory(data: CompleteSessionFields): void;
  _consumeSessionFromUrl(): boolean;
  _isAuthContextCurrent(context: AuthContext): boolean;
  _notifyAuthCallbacks(user: unknown): void;
  signIn(options: { email: string; password: string }): Promise<AuthResult>;
  signInAnonymously(metadata?: Record<string, unknown>): Promise<AuthResult>;
  forgotPassword(email: string): Promise<MessageResult>;
  getSession(): Promise<CurrentSessionResult>;
}

interface AuthResult {
  user: unknown;
  session: { access_token: string; refresh_token: string | undefined; expires_in: unknown } | null;
  error: Error | null;
}

interface CurrentSessionResult {
  data: { session: { access_token: string; refresh_token: string | null; user: unknown } | null };
  error: Error | null;
}

interface MessageResult {
  message: unknown;
  error: Error | null;
}

function userId(user: unknown): unknown {
  return optionalField(user, 'id');
}

export async function signUp(
  host: AuthAccountHost,
  options: {
    email: string;
    password: string;
    metadata?: Record<string, unknown>;
    signInWhenAllowed?: boolean;
  },
): Promise<{
  user: unknown;
  session: AuthResult['session'];
  confirmationRequired: boolean;
  message: unknown;
  error: Error | null;
}> {
  const { email, password, metadata = {} } = options;
  const result = await host._anonFetch('/auth/signup', {
    method: 'POST',
    body: JSON.stringify({ email, password, user_metadata: metadata }),
  });
  if (result.ok !== true) {
    return {
      user: null,
      session: null,
      confirmationRequired: false,
      message: null,
      error: result.error,
    };
  }
  return finishSignUp(host, options, result.data);
}

async function finishSignUp(
  host: AuthAccountHost,
  options: { email: string; password: string; signInWhenAllowed?: boolean },
  data: unknown,
): ReturnType<typeof signUp> {
  // The signup response is deliberately session-less to avoid account enumeration.
  const confirmationRequired = Boolean(optionalField(data, 'confirmation_required'));
  const message = optionalField(data, 'message') ?? null;
  if (options.signInWhenAllowed === true && !confirmationRequired) {
    const signedIn = await host.signIn({ email: options.email, password: options.password });
    return {
      user: signedIn.user,
      session: signedIn.session,
      confirmationRequired,
      message,
      error: signedIn.error,
    };
  }
  return { user: null, session: null, confirmationRequired, message, error: null };
}

export async function signIn(
  host: AuthAccountHost,
  { email, password }: { email: string; password: string },
): Promise<AuthResult> {
  const expectedGeneration = host._sessionGeneration;
  let response: Awaited<ReturnType<typeof authSignin>>;
  try {
    response = await host._transport.authSignin(
      { email, password },
      host._generatedOptions('anon'),
    );
  } catch (error) {
    return {
      user: null,
      session: null,
      error: error instanceof Error ? error : new Error('Sign in failed'),
    };
  }
  if (!host._setSession(response.data, expectedGeneration)) {
    return { user: null, session: null, error: new AuthSessionChangedError() };
  }
  if (response.data === undefined) {
    throw new TypeError('Sign in returned no session');
  }
  return {
    user: response.data.user,
    session: {
      access_token: response.data.access_token,
      refresh_token: response.data.refresh_token,
      expires_in: response.data.expires_in,
    },
    error: null,
  };
}

export function getSession(host: AuthAccountHost): Promise<CurrentSessionResult> {
  if (host.accessToken === null || host.accessToken === '') {
    return Promise.resolve({ data: { session: null }, error: null });
  }
  const user = host.currentUser === null ? null : cloneJsonValue(host.currentUser);
  return Promise.resolve({
    data: {
      session: {
        access_token: host.accessToken,
        refresh_token: host.refreshToken,
        user,
      },
    },
    error: null,
  });
}

export function setSession(host: AuthAccountHost, session: unknown): Promise<CurrentSessionResult> {
  let ownedSession: unknown;
  try {
    ownedSession = cloneJsonValue(session);
  } catch {
    return Promise.resolve({
      data: { session: null },
      error: new TypeError('Session must be cloneable'),
    });
  }
  const validationError = validateCompleteSession(ownedSession);
  if (validationError !== null) {
    return Promise.resolve({ data: { session: null }, error: validationError });
  }
  assertCompleteSession(ownedSession);
  host._adoptSessionInMemory(ownedSession);
  return host.getSession();
}

function isUserResponseCurrent(
  host: AuthAccountHost,
  context: AuthContext,
  user: unknown,
): boolean {
  const currentId = userId(host.currentUser);
  return host._isAuthContextCurrent(context) && (!Boolean(currentId) || userId(user) === currentId);
}

export function onAuthStateChange(
  host: AuthAccountHost,
  callback: (user: unknown) => void,
): () => void {
  host._authCallbacks.push(callback);
  try {
    callback(host.currentUser);
  } catch (error) {
    console.error('[VolcanoAuth] Error in auth state callback:', error);
  }
  return () => {
    host._authCallbacks = host._authCallbacks.filter((registered) => registered !== callback);
  };
}

export async function getUser(
  host: AuthAccountHost,
): Promise<{ user: unknown; error: Error | null }> {
  const adoptedFromUrl = host._consumeSessionFromUrl();
  const { result, context } = await host._authFetchWithContext('/auth/user');
  if (result.ok !== true) {
    return { user: null, error: result.error };
  }
  const user = requiredField(result.data, 'user');
  if (!isUserResponseCurrent(host, context, user)) {
    return { user: null, error: new AuthSessionChangedError() };
  }
  host.currentUser = user;
  if (adoptedFromUrl || host._pendingUrlAuthNotify) {
    host._pendingUrlAuthNotify = false;
    host._notifyAuthCallbacks(user);
  }
  return { user, error: null };
}

export async function updateUser(
  host: AuthAccountHost,
  options: { password?: string; metadata?: Record<string, unknown> },
): Promise<{ user: unknown; error: Error | null }> {
  const { result, context } = await host._authFetchWithContext('/auth/user', () => {
    const { password, metadata } = options;
    return { method: 'PUT', body: JSON.stringify({ password, user_metadata: metadata }) };
  });
  if (result.ok !== true) {
    return { user: null, error: result.error };
  }
  const user = requiredField(result.data, 'user');
  if (!isUserResponseCurrent(host, context, user)) {
    return { user: null, error: new AuthSessionChangedError() };
  }
  host.currentUser = user;
  return { user, error: null };
}

export async function signInAnonymously(
  host: AuthAccountHost,
  metadata: Record<string, unknown>,
): Promise<AuthResult> {
  const expectedGeneration = host._sessionGeneration;
  const result = await host._anonFetch('/auth/signup-anonymous', {
    method: 'POST',
    body: JSON.stringify({ user_metadata: metadata }),
  });
  if (result.ok !== true) {
    return { user: null, session: null, error: result.error };
  }
  assertCompleteSession(result.data);
  if (!host._setSession(result.data, expectedGeneration)) {
    return { user: null, session: null, error: new AuthSessionChangedError() };
  }
  return {
    user: result.data.user,
    session: {
      access_token: result.data.access_token,
      refresh_token: result.data.refresh_token,
      expires_in: requiredField(result.data, 'expires_in'),
    },
    error: null,
  };
}

export function signUpAnonymous(
  host: AuthAccountHost,
  metadata: Record<string, unknown>,
): Promise<AuthResult> {
  return host.signInAnonymously(metadata);
}

export async function convertAnonymous(
  host: AuthAccountHost,
  options: { email: string; password: string; metadata?: Record<string, unknown> },
): Promise<{ user: unknown; error: Error | null }> {
  const { result, context } = await host._authFetchWithContext(
    '/auth/user/convert-anonymous',
    () => {
      const { email, password, metadata = {} } = options;
      return {
        method: 'POST',
        body: JSON.stringify({ email, password, user_metadata: metadata }),
      };
    },
  );
  return adoptedUser(host, context, result);
}

function adoptedUser(
  host: AuthAccountHost,
  context: AuthContext,
  result: RequestResult,
): { user: unknown; error: Error | null } {
  if (result.ok !== true) {
    return { user: null, error: result.error };
  }
  if (!host._isAuthContextCurrent(context)) {
    return { user: null, error: new AuthSessionChangedError() };
  }
  const user = requiredField(result.data, 'user');
  host.currentUser = user;
  return { user, error: null };
}

async function messageRequest(
  host: AuthAccountHost,
  path: string,
  body: Record<string, unknown>,
): Promise<MessageResult> {
  const result = await host._anonFetch(path, { method: 'POST', body: JSON.stringify(body) });
  return result.ok === true
    ? { message: optionalField(result.data, 'message') ?? null, error: null }
    : { message: null, error: result.error };
}

export function confirmEmail(host: AuthAccountHost, token: string): Promise<MessageResult> {
  return messageRequest(host, '/auth/confirm', { token });
}

export function resendConfirmation(host: AuthAccountHost, email: string): Promise<MessageResult> {
  return messageRequest(host, '/auth/resend-confirmation', { email });
}

export function forgotPassword(host: AuthAccountHost, email: string): Promise<MessageResult> {
  return messageRequest(host, '/auth/forgot-password', { email });
}

export function resetPasswordForEmail(
  host: AuthAccountHost,
  email: string,
): Promise<MessageResult> {
  return host.forgotPassword(email);
}

export function resetPassword(
  host: AuthAccountHost,
  { token, newPassword }: { token: string; newPassword: string },
): Promise<MessageResult> {
  return messageRequest(host, '/auth/reset-password', { token, new_password: newPassword });
}

interface EmailChangeResult {
  message: unknown;
  newEmail: unknown;
  emailChangeToken?: unknown;
  error: Error | null;
}

export async function requestEmailChange(
  host: AuthAccountHost,
  newEmail: string,
): Promise<EmailChangeResult> {
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
    message: optionalField(result.data, 'message') ?? null,
    newEmail: optionalField(result.data, 'new_email') ?? null,
    emailChangeToken: optionalField(result.data, 'email_change_token'),
    error: null,
  };
}

export async function confirmEmailChange(
  host: AuthAccountHost,
  emailChangeToken: string,
): Promise<{ user: unknown; error: Error | null }> {
  const { result, context } = await host._authFetchWithContext(
    '/auth/user/confirm-email-change',
    () => ({
      method: 'POST',
      body: JSON.stringify({ email_change_token: emailChangeToken }),
    }),
  );
  return adoptedUser(host, context, result);
}

export async function cancelEmailChange(host: AuthAccountHost): Promise<MessageResult> {
  const { result, context } = await host._authFetchWithContext('/auth/user/cancel-email-change', {
    method: 'DELETE',
  });
  if (result.ok !== true) {
    return { message: null, error: result.error };
  }
  if (!host._isAuthContextCurrent(context)) {
    return { message: null, error: new AuthSessionChangedError() };
  }
  return { message: optionalField(result.data, 'message') ?? null, error: null };
}
