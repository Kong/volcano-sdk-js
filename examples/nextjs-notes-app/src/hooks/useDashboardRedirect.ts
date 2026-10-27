'use client';

/**
 * Dashboard Redirect Hook
 *
 * Wraps an auth method so a successful result continues to the dashboard.
 */

import { useRouter } from 'next/navigation';
import { useCallback } from 'react';

/**
 * Return a stable handler that calls an auth method, which resolves with
 * `{ error }`, and redirects on success
 */
export function useDashboardRedirect<Args extends unknown[], Result extends { error: Error | null }>(
  action: (...args: Args) => Promise<Result>,
): (...args: Args) => Promise<Result> {
  const router = useRouter();

  return useCallback(
    async (...args: Args) => {
      const result = await action(...args);

      if (result.error === null) {
        router.push('/dashboard');
      }

      return result;
    },
    [action, router],
  );
}
