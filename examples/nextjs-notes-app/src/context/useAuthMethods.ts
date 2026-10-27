'use client';

/**
 * Authentication Methods Hook
 *
 * The methods AuthProvider exposes. Each wraps a Volcano SDK auth call and
 * mirrors its result into the provider's state.
 */

import type { User, UserMetadata } from '@volcano.dev/sdk';
import { type Dispatch, type SetStateAction, useMemo } from 'react';
import { toError } from '@/lib/errors';
import { volcano } from '@/lib/volcano';

export interface AuthSetters {
  /** Sets the current user */
  setUser: Dispatch<SetStateAction<User | null>>;
  /** Sets the loading flag */
  setLoading: Dispatch<SetStateAction<boolean>>;
  /** Sets the last authentication error */
  setError: Dispatch<SetStateAction<Error | null>>;
}

export interface Credentials {
  /** User's email address */
  email: string;
  /** User's password */
  password: string;
}

export interface SignUpInput extends Credentials {
  /** Optional user metadata (name, etc.) */
  metadata?: UserMetadata | undefined;
}

export interface UserResult {
  user: User | null;
  error: Error | null;
}

export interface ErrorResult {
  error: Error | null;
}

export interface AuthMethods {
  /** Sign in with email/password */
  signIn: (credentials: Credentials) => Promise<UserResult>;
  /** Create new account */
  signUp: (options: SignUpInput) => Promise<UserResult>;
  /** Sign in without an account */
  signInAnonymously: () => Promise<UserResult>;
  /** End current session */
  signOut: () => Promise<ErrorResult>;
  /** Send password reset email */
  resetPassword: (email: string) => Promise<ErrorResult>;
  /** Clear the current error */
  clearError: () => void;
}

/**
 * Sign in with email and password
 *
 * @example
 * const { user, error } = await signIn({
 *   email: 'user@example.com',
 *   password: 'securePassword123'
 * });
 */
async function signIn(
  { setUser, setLoading, setError }: AuthSetters,
  { email, password }: Credentials,
): Promise<UserResult> {
  setError(null);
  setLoading(true);

  try {
    const result = await volcano.auth.signIn({ email, password });

    if (result.error) {
      setError(result.error);
      return { user: null, error: result.error };
    }

    setUser(result.user);
    return { user: result.user, error: null };
  } catch (err) {
    const error = toError(err);
    setError(error);
    return { user: null, error };
  } finally {
    setLoading(false);
  }
}

/**
 * Create a new user account
 *
 * The password must be at least 8 characters.
 *
 * @example
 * const { user, error } = await signUp({
 *   email: 'user@example.com',
 *   password: 'securePassword123',
 *   metadata: { name: 'John Doe' }
 * });
 */
async function signUp(
  { setUser, setLoading, setError }: AuthSetters,
  { email, password, metadata }: SignUpInput,
): Promise<UserResult> {
  setError(null);
  setLoading(true);

  try {
    const result = await volcano.auth.signUp({ email, password, ...(metadata === undefined ? {} : { metadata }) });

    if (result.error) {
      setError(result.error);
      return { user: null, error: result.error };
    }

    setUser(result.user);
    return { user: result.user, error: null };
  } catch (err) {
    const error = toError(err);
    setError(error);
    return { user: null, error };
  } finally {
    setLoading(false);
  }
}

/**
 * Sign in anonymously (no email/password required)
 *
 * Creates a temporary user that can:
 * - Access the app immediately
 * - Create and manage notes
 * - Later upgrade to a full account (link email/password)
 *
 * @example
 * const { user, error } = await signInAnonymously();
 * // User is now signed in with a temporary account
 */
async function signInAnonymously({ setUser, setLoading, setError }: AuthSetters): Promise<UserResult> {
  setError(null);
  setLoading(true);

  try {
    const result = await volcano.auth.signInAnonymously();

    if (result.error) {
      setError(result.error);
      return { user: null, error: result.error };
    }

    setUser(result.user);
    return { user: result.user, error: null };
  } catch (err) {
    const error = toError(err);
    setError(error);
    return { user: null, error };
  } finally {
    setLoading(false);
  }
}

/**
 * Sign out the current user
 *
 * Clears the session from memory and localStorage.
 *
 * @example
 * await signOut();
 * // User is now signed out, redirect to login
 */
async function signOut({ setUser, setError }: AuthSetters): Promise<ErrorResult> {
  setError(null);

  try {
    const result = await volcano.auth.signOut();

    if (result.error) {
      setError(result.error);
      return { error: result.error };
    }

    setUser(null);
    return { error: null };
  } catch (err) {
    const error = toError(err);
    setError(error);
    return { error };
  }
}

/**
 * Send a password reset email
 *
 * @example
 * const { error } = await resetPassword('user@example.com');
 * if (!error) {
 *   alert('Check your email for reset instructions');
 * }
 */
async function resetPassword({ setLoading, setError }: AuthSetters, email: string): Promise<ErrorResult> {
  setError(null);
  setLoading(true);

  try {
    const result = await volcano.auth.resetPasswordForEmail(email);

    if (result.error) {
      setError(result.error);
      return { error: result.error };
    }

    return { error: null };
  } catch (err) {
    const error = toError(err);
    setError(error);
    return { error };
  } finally {
    setLoading(false);
  }
}

/**
 * Bind the authentication methods to AuthProvider's state.
 *
 * State setters never change, so neither do the returned methods.
 */
export function useAuthMethods({ setUser, setLoading, setError }: AuthSetters): AuthMethods {
  return useMemo(() => {
    const setters = { setUser, setLoading, setError };

    return {
      signIn: (credentials: Credentials) => signIn(setters, credentials),
      signUp: (options: SignUpInput) => signUp(setters, options),
      signInAnonymously: () => signInAnonymously(setters),
      signOut: () => signOut(setters),
      resetPassword: (email: string) => resetPassword(setters, email),
      // Clear the current error
      clearError: () => {
        setError(null);
      },
    };
  }, [setUser, setLoading, setError]);
}
