'use client';

/**
 * Authentication Methods Hook
 *
 * The methods AuthProvider exposes. Each wraps a Volcano SDK auth call and
 * mirrors its result into the provider's state.
 */

import { useMemo } from 'react';
import { volcano } from '@/lib/volcano';

/**
 * @typedef {Object} AuthSetters
 * @property {Function} setUser - Sets the current user
 * @property {Function} setLoading - Sets the loading flag
 * @property {Function} setError - Sets the last authentication error
 */

/**
 * Sign in with email and password
 *
 * @param {AuthSetters} setters
 * @param {Object} credentials
 * @param {string} credentials.email - User's email address
 * @param {string} credentials.password - User's password
 * @returns {Promise<{user: Object|null, error: Error|null}>}
 *
 * @example
 * const { user, error } = await signIn({
 *   email: 'user@example.com',
 *   password: 'securePassword123'
 * });
 */
async function signIn({ setUser, setLoading, setError }, { email, password }) {
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
    setError(err);
    return { user: null, error: err };
  } finally {
    setLoading(false);
  }
}

/**
 * Create a new user account
 *
 * @param {AuthSetters} setters
 * @param {Object} options
 * @param {string} options.email - User's email address
 * @param {string} options.password - User's password (min 8 characters)
 * @param {Object} [options.metadata] - Optional user metadata (name, etc.)
 * @returns {Promise<{user: Object|null, error: Error|null}>}
 *
 * @example
 * const { user, error } = await signUp({
 *   email: 'user@example.com',
 *   password: 'securePassword123',
 *   metadata: { name: 'John Doe' }
 * });
 */
async function signUp({ setUser, setLoading, setError }, { email, password, metadata }) {
  setError(null);
  setLoading(true);

  try {
    const result = await volcano.auth.signUp({ email, password, metadata });

    if (result.error) {
      setError(result.error);
      return { user: null, error: result.error };
    }

    setUser(result.user);
    return { user: result.user, error: null };
  } catch (err) {
    setError(err);
    return { user: null, error: err };
  } finally {
    setLoading(false);
  }
}

/**
 * Sign up anonymously (no email/password required)
 *
 * Creates a temporary user that can:
 * - Access the app immediately
 * - Create and manage notes
 * - Later upgrade to a full account (link email/password)
 *
 * @param {AuthSetters} setters
 * @returns {Promise<{user: Object|null, error: Error|null}>}
 *
 * @example
 * const { user, error } = await signUpAnonymous();
 * // User is now signed in with a temporary account
 */
async function signUpAnonymous({ setUser, setLoading, setError }) {
  setError(null);
  setLoading(true);

  try {
    const result = await volcano.auth.signUpAnonymous();

    if (result.error) {
      setError(result.error);
      return { user: null, error: result.error };
    }

    setUser(result.user);
    return { user: result.user, error: null };
  } catch (err) {
    setError(err);
    return { user: null, error: err };
  } finally {
    setLoading(false);
  }
}

/**
 * Sign out the current user
 *
 * Clears the session from memory and localStorage.
 *
 * @param {AuthSetters} setters
 * @returns {Promise<{error: Error|null}>}
 *
 * @example
 * await signOut();
 * // User is now signed out, redirect to login
 */
async function signOut({ setUser, setError }) {
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
    setError(err);
    return { error: err };
  }
}

/**
 * Send a password reset email
 *
 * @param {AuthSetters} setters
 * @param {string} email - User's email address
 * @returns {Promise<{error: Error|null}>}
 *
 * @example
 * const { error } = await resetPassword('user@example.com');
 * if (!error) {
 *   alert('Check your email for reset instructions');
 * }
 */
async function resetPassword({ setLoading, setError }, email) {
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
    setError(err);
    return { error: err };
  } finally {
    setLoading(false);
  }
}

/**
 * Bind the authentication methods to AuthProvider's state.
 *
 * State setters never change, so neither do the returned methods.
 *
 * @param {AuthSetters} setters
 */
export function useAuthMethods({ setUser, setLoading, setError }) {
  return useMemo(() => {
    const setters = { setUser, setLoading, setError };

    return {
      signIn: (credentials) => signIn(setters, credentials),
      signUp: (options) => signUp(setters, options),
      signUpAnonymous: () => signUpAnonymous(setters),
      signOut: () => signOut(setters),
      resetPassword: (email) => resetPassword(setters, email),
      // Clear the current error
      clearError: () => {
        setError(null);
      },
    };
  }, [setUser, setLoading, setError]);
}
