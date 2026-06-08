'use client';

/**
 * Authentication Context
 *
 * Provides global authentication state and methods throughout the application.
 * Wraps the Volcano SDK authentication methods with React state management.
 *
 * @example
 * // In a component:
 * const { user, signIn, signOut } = useAuth();
 *
 * if (user) {
 *   return <Dashboard />;
 * }
 */

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { volcano } from '@/lib/volcano';

// ---------------------------------------------------------------------------
// CONTEXT DEFINITION
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} AuthContextValue
 * @property {Object|null} user - Current authenticated user or null
 * @property {boolean} loading - True while checking authentication state
 * @property {Error|null} error - Last authentication error or null
 * @property {boolean} isAnonymous - True if user is anonymous
 * @property {Function} signIn - Sign in with email/password
 * @property {Function} signUp - Create new account
 * @property {Function} signUpAnonymous - Sign up without account
 * @property {Function} signOut - End current session
 * @property {Function} resetPassword - Send password reset email
 * @property {Function} clearError - Clear the current error
 */

const AuthContext = createContext(null);

// ---------------------------------------------------------------------------
// PROVIDER COMPONENT
// ---------------------------------------------------------------------------

/**
 * Authentication Provider
 *
 * Wraps your application to provide authentication state and methods.
 * Should be placed near the root of your component tree.
 *
 * @example
 * // In layout.js:
 * export default function RootLayout({ children }) {
 *   return (
 *     <AuthProvider>
 *       {children}
 *     </AuthProvider>
 *   );
 * }
 */
export function AuthProvider({ children }) {
  // ---------------------------------------------------------------------------
  // STATE
  // ---------------------------------------------------------------------------

  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // ---------------------------------------------------------------------------
  // INITIALIZATION
  // ---------------------------------------------------------------------------

  /**
   * Initialize authentication state on mount.
   * Restores session from localStorage if available.
   */
  useEffect(() => {
    async function initAuth() {
      try {
        // volcano.initialize() restores session from localStorage
        const { user: restoredUser, error: initError } = await volcano.initialize();

        if (initError) {
          console.warn('Session restore failed:', initError.message);
          // Don't set error state - just means no valid session
        }

        setUser(restoredUser);
      } catch (err) {
        console.error('Auth initialization error:', err);
      } finally {
        setLoading(false);
      }
    }

    initAuth();

    // Listen for auth state changes (sign in, sign out, token refresh)
    const unsubscribe = volcano.auth.onAuthStateChange((updatedUser) => {
      setUser(updatedUser);
    });

    // Cleanup listener on unmount to prevent memory leaks
    return () => {
      unsubscribe();
    };
  }, []);

  // ---------------------------------------------------------------------------
  // AUTHENTICATION METHODS
  // ---------------------------------------------------------------------------

  /**
   * Sign in with email and password
   *
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
  const signIn = useCallback(async ({ email, password }) => {
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
  }, []);

  /**
   * Create a new user account
   *
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
  const signUp = useCallback(async ({ email, password, metadata }) => {
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
  }, []);

  /**
   * Sign up anonymously (no email/password required)
   *
   * Creates a temporary user that can:
   * - Access the app immediately
   * - Create and manage notes
   * - Later upgrade to a full account (link email/password)
   *
   * @returns {Promise<{user: Object|null, error: Error|null}>}
   *
   * @example
   * const { user, error } = await signUpAnonymous();
   * // User is now signed in with a temporary account
   */
  const signUpAnonymous = useCallback(async () => {
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
  }, []);

  /**
   * Sign out the current user
   *
   * Clears the session from memory and localStorage.
   *
   * @returns {Promise<{error: Error|null}>}
   *
   * @example
   * await signOut();
   * // User is now signed out, redirect to login
   */
  const signOut = useCallback(async () => {
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
  }, []);

  /**
   * Send a password reset email
   *
   * @param {string} email - User's email address
   * @returns {Promise<{error: Error|null}>}
   *
   * @example
   * const { error } = await resetPassword('user@example.com');
   * if (!error) {
   *   alert('Check your email for reset instructions');
   * }
   */
  const resetPassword = useCallback(async (email) => {
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
  }, []);

  /**
   * Clear the current error
   */
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  // ---------------------------------------------------------------------------
  // COMPUTED VALUES
  // ---------------------------------------------------------------------------

  // Check if user is anonymous (has no email)
  const isAnonymous = user && !user.email;

  // ---------------------------------------------------------------------------
  // CONTEXT VALUE
  // ---------------------------------------------------------------------------

  const value = {
    // State
    user,
    loading,
    error,
    isAnonymous,

    // Methods
    signIn,
    signUp,
    signUpAnonymous,
    signOut,
    resetPassword,
    clearError,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// ---------------------------------------------------------------------------
// HOOK
// ---------------------------------------------------------------------------

/**
 * Access authentication context
 *
 * Must be used within an AuthProvider.
 *
 * @returns {AuthContextValue}
 * @throws {Error} If used outside of AuthProvider
 *
 * @example
 * function MyComponent() {
 *   const { user, signOut } = useAuth();
 *
 *   if (!user) return <Login />;
 *
 *   return (
 *     <div>
 *       Welcome, {user.email}!
 *       <button onClick={signOut}>Sign Out</button>
 *     </div>
 *   );
 * }
 */
export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }

  return context;
}
