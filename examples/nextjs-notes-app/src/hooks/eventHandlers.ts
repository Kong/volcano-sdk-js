'use client';

/**
 * Event Handler Hooks
 *
 * Stable handlers for the form inputs and buttons the components render.
 */

import { type ChangeEvent, useCallback } from 'react';

/**
 * Return a change handler that stores an input's value
 */
export function useInputChange(
  setValue: (value: string) => void,
): (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void {
  return useCallback(
    (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setValue(e.target.value);
    },
    [setValue],
  );
}

/**
 * Return an event handler that starts an async action. React ignores what an
 * event handler returns, so the action's promise is deliberately not awaited.
 */
export function useAsyncHandler<Args extends unknown[]>(
  action: (...args: Args) => Promise<unknown>,
): (...args: Args) => void {
  return useCallback(
    (...args: Args) => {
      void action(...args);
    },
    [action],
  );
}
