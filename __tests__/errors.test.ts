/** @jest-environment node */
import { afterEach, expect, jest, test } from '@jest/globals';
import {
  AuthRefreshDiscardedError,
  AuthSessionChangedError,
  VolcanoSystemError,
} from '../src/errors.ts';

afterEach(() => {
  jest.restoreAllMocks();
});

test.each([
  {
    ErrorType: AuthRefreshDiscardedError,
    code: 'auth_refresh_discarded',
    message: 'Refresh result discarded because the auth session changed',
  },
  {
    ErrorType: AuthSessionChangedError,
    code: 'auth_session_changed',
    message: 'Auth operation discarded because the session changed',
  },
])(
  '$code preserves auth error identity and hidden immutable metadata',
  ({ ErrorType, code, message }) => {
    const error = new ErrorType();
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe(ErrorType.name);
    expect(error.status).toBe(409);
    expect(error.message).toBe(message);
    expect(error.code).toBe(code);
    expect(ErrorType.is(error)).toBe(true);
    expect(Object.getOwnPropertyDescriptor(error, 'code')).toEqual({
      value: error.code,
      writable: false,
      enumerable: false,
      configurable: false,
    });
    expect(JSON.stringify(error)).toBe('{}');
  },
);

test.each([AuthRefreshDiscardedError, AuthSessionChangedError])(
  '%p keeps the inherited constructor signature without adopting its arguments',
  (ErrorType) => {
    const error = new ErrorType('ignored', { cause: new Error('ignored') });
    expect(error.message).toBe(new ErrorType().message);
    expect(Object.hasOwn(error, 'cause')).toBe(false);
    expect(ErrorType).toHaveLength(0);
  },
);

test.each([AuthRefreshDiscardedError, AuthSessionChangedError])(
  '%p recognizes matching errors from another SDK copy',
  (ErrorType) => {
    const error = new ErrorType();
    const copy = { name: error.name, code: error.code, status: error.status };
    expect(ErrorType.is(copy)).toBe(true);
    expect(ErrorType.is({ ...copy, name: 'OtherError' })).toBe(false);
    expect(ErrorType.is({ ...copy, code: 'other_code' })).toBe(false);
    expect(ErrorType.is({ ...copy, status: 500 })).toBe(false);
  },
);

test.each([
  undefined,
  null,
  false,
  true,
  0,
  1,
  '',
  'error',
  0n,
  1n,
  Symbol('error'),
  {},
  new Error('plain'),
])('rejects unrelated values without throwing: %p', (value) => {
  expect(AuthRefreshDiscardedError.is(value)).toBe(false);
  expect(AuthSessionChangedError.is(value)).toBe(false);
  expect(VolcanoSystemError.is(value)).toBe(false);
});

test('creates a system error without optional metadata', () => {
  const error = new VolcanoSystemError('gateway failed');
  expect(error).toBeInstanceOf(Error);
  expect(error.name).toBe('VolcanoSystemError');
  expect(error.message).toBe('gateway failed');
  expect(error.status).toBeNull();
  expect(Object.hasOwn(error, 'code')).toBe(false);
  expect(Object.hasOwn(error, 'retryAfter')).toBe(false);
  expect(Object.hasOwn(error, 'cause')).toBe(false);
  expect(VolcanoSystemError.is(error)).toBe(true);
});

test('preserves system metadata and the native cause without making it enumerable', () => {
  const cause = new Error('network failed');
  const error = new VolcanoSystemError('gateway failed', {
    status: 503,
    code: 'gateway_unavailable',
    retryAfter: 2,
    cause,
  });
  expect(error.status).toBe(503);
  expect(error.code).toBe('gateway_unavailable');
  expect(error.retryAfter).toBe(2);
  expect(error.cause).toBe(cause);
  expect(JSON.stringify(error)).toBe('{}');
});

test('retains an explicit null status and omits an undefined cause', () => {
  const error = new VolcanoSystemError('failed', { status: null, cause: undefined });
  expect(error.status).toBeNull();
  expect(Object.hasOwn(error, 'cause')).toBe(false);
});

test('recognizes the system brand on objects and functions across copies', () => {
  const callable = Object.assign(() => 'branded', { isSystemError: true });
  expect(VolcanoSystemError.is({ isSystemError: true })).toBe(true);
  expect(VolcanoSystemError.is(callable)).toBe(true);
  expect(VolcanoSystemError.is({ isSystemError: 'true' })).toBe(false);
});

test('preserves the receiver when reading an inherited error brand', () => {
  const read = jest.fn(function (this: unknown): boolean {
    return this === 'branded';
  });
  Object.defineProperty(String.prototype, 'isSystemError', { get: read, configurable: true });
  try {
    expect(VolcanoSystemError.is('branded')).toBe(true);
    expect(VolcanoSystemError.is('')).toBe(false);
    expect(read).toHaveBeenCalledTimes(1);
  } finally {
    Reflect.deleteProperty(String.prototype, 'isSystemError');
  }
});

test('propagates property access failures from an error guard', () => {
  const failure = new Error('brand getter failed');
  const candidate = {
    get isSystemError(): never {
      throw failure;
    },
  };
  expect(() => VolcanoSystemError.is(candidate)).toThrow(failure);
});
