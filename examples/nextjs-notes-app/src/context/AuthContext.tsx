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

import type { User } from '@volcano.dev/sdk';
import { createContext, type ReactNode, useContext, useMemo, useState } from 'react';
import { type AuthMethods, useAuthMethods } from './useAuthMethods';
import { useAuthSession } from './useAuthSession';

// ---------------------------------------------------------------------------
// CONTEXT DEFINITION
// ---------------------------------------------------------------------------

export interface AuthContextValue extends AuthMethods {
  /** Current authenticated user or null */
  user: User | null;
  /** True while checking authentication state */
  loading: boolean;
  /** Last authentication error or null */
  error: Error | null;
  /** True if user is anonymous */
  isAnonymous: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

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
 * // In layout.tsx:
 * export default function RootLayout({ children }) {
 *   return (
 *     <AuthProvider>
 *       {children}
 *     </AuthProvider>
 *   );
 * }
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  // ---------------------------------------------------------------------------
  // STATE
  // ---------------------------------------------------------------------------

  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Restore the session on mount and follow auth state changes
  useAuthSession({ setUser, setLoading });

  // Sign in, sign up, sign out, and password reset
  const { signIn, signUp, signInAnonymously, signOut, resetPassword, clearError } = useAuthMethods({
    setUser,
    setLoading,
    setError,
  });

  // Check if user is anonymous (has no email)
  const isAnonymous = user !== null && !user.email;

  // ---------------------------------------------------------------------------
  // CONTEXT VALUE
  // ---------------------------------------------------------------------------

  // Memoised so consumers re-render only when auth state or a method changes
  const value = useMemo<AuthContextValue>(
    () => ({
      // State
      user,
      loading,
      error,
      isAnonymous,

      // Methods
      signIn,
      signUp,
      signInAnonymously,
      signOut,
      resetPassword,
      clearError,
    }),
    [user, loading, error, isAnonymous, signIn, signUp, signInAnonymously, signOut, resetPassword, clearError],
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
export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }

  return context;
}
