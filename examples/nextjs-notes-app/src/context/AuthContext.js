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

import { createContext, useContext, useMemo, useState } from 'react';
import { useAuthMethods } from './useAuthMethods';
import { useAuthSession } from './useAuthSession';

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

  // Restore the session on mount and follow auth state changes
  useAuthSession({ setUser, setLoading });

  // Sign in, sign up, sign out, and password reset
  const { signIn, signUp, signUpAnonymous, signOut, resetPassword, clearError } = useAuthMethods({
    setUser,
    setLoading,
    setError,
  });

  // Check if user is anonymous (has no email)
  const isAnonymous = user && !user.email;

  // ---------------------------------------------------------------------------
  // CONTEXT VALUE
  // ---------------------------------------------------------------------------

  // Memoised so consumers re-render only when auth state or a method changes
  const value = useMemo(
    () => ({
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
    }),
    [user, loading, error, isAnonymous, signIn, signUp, signUpAnonymous, signOut, resetPassword, clearError],
  );

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
