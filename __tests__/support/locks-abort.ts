import { abortReason } from './locks-fixtures.ts';

/** Stays pending until `signal` aborts, then rejects with its reason; rejects at once if it already has. */
export function rejectOnAbort(signal: AbortSignal): Promise<never> {
  return new Promise<never>((_resolve, reject) => {
    const rejectWithReason = (): void => {
      reject(abortReason(signal));
    };
    if (signal.aborted) {
      rejectWithReason();
      return;
    }
    signal.addEventListener('abort', rejectWithReason, { once: true });
  });
}
