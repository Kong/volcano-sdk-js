'use client';

/**
 * Dashboard Redirect Hook
 *
 * Wraps an auth method so a successful result continues to the dashboard.
 */

import { useRouter } from 'next/navigation';
import { useCallback } from 'react';

/**
 * @param {Function} action - Auth method that resolves with `{ error }`
 * @returns {Function} Stable handler that calls the method and redirects on success
 */
export function useDashboardRedirect(action) {
  const router = useRouter();

  return useCallback(
    async (input) => {
      const result = await action(input);

      if (!result.error) {
        router.push('/dashboard');
      }

      return result;
    },
    [action, router],
  );
}
