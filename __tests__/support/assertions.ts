import { expect } from '@jest/globals';

/** Fails the test unless `value` is present, and narrows it for the steps that follow. */
export function expectPresent<T>(value: T): asserts value is NonNullable<T> {
  expect(value).not.toBeNull();
  expect(value).not.toBeUndefined();
}

/** Fails the test unless `value` is an instance of `type`, and narrows it for the steps that follow. */
export function expectInstanceOf<T>(value: unknown, type: abstract new (...args: never[]) => T): asserts value is T {
  expect(value).toBeInstanceOf(type);
}
