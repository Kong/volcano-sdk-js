'use client';

/**
 * Session Restore Hook
 *
 * Restores the session from localStorage on mount and keeps AuthProvider's
 * user in step with sign in, sign out, and token refresh.
 */

import { useEffect } from 'react';
import { volcano } from '@/lib/volcano';

/**
 * @param {Object} setters - AuthProvider's state setters
 * @param {Function} setters.setUser
 * @param {Function} setters.setLoading
 */
export function useAuthSession({ setUser, setLoading }) {
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
  }, [setUser, setLoading]);
}
