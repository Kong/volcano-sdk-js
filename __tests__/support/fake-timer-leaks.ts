import { expect, jest } from '@jest/globals';

/** Fails the test that left a fake timer scheduled. Call from `afterEach` before restoring real timers. */
export function expectNoPendingTimers(): void {
  expect(jest.getTimerCount()).toBe(0);
}
