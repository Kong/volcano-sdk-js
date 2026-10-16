import { RealtimeConnectionError } from '../src/realtime';

test('exposes a typed disconnect code without changing JSON or object keys', () => {
  const error = new RealtimeConnectionError('permission denied', 3507);
  expect(error).toBeInstanceOf(Error);
  expect(error.name).toBe('RealtimeConnectionError');
  expect(error.message).toBe('permission denied');
  expect(error.code).toBe(3507);
  expect(error.toString()).toBe('RealtimeConnectionError: permission denied');
  expect(Object.keys(error)).toEqual([]);
  expect(JSON.stringify(error)).toBe('{}');
  expect(Object.getOwnPropertyDescriptor(error, 'code')).toEqual({
    value: 3507,
    enumerable: false,
    writable: false,
    configurable: false,
  });
  expect(RealtimeConnectionError.is(error)).toBe(true);
});

test('omits an unavailable code and recognizes errors across SDK copies', () => {
  const error = new RealtimeConnectionError('Connection disconnected');
  expect(error.code).toBeUndefined();
  expect(error).not.toHaveProperty('code');
  expect(JSON.stringify(error)).toBe('{}');
  expect(RealtimeConnectionError.is(error)).toBe(true);
  expect(RealtimeConnectionError.is({ name: error.name, message: error.message })).toBe(true);
  expect(RealtimeConnectionError.is({ name: error.name, message: error.message, code: 3507 })).toBe(
    true,
  );
});

test.each([
  null,
  undefined,
  3507,
  'permission denied',
  {},
  new Error('permission denied'),
  { name: 'OtherError', message: 'permission denied', code: 3507 },
  { name: 'RealtimeConnectionError', message: 3, code: 3507 },
  { name: 'RealtimeConnectionError', message: 'denied', code: '3507' },
])('does not narrow an unrelated value: %p', (value) => {
  expect(RealtimeConnectionError.is(value)).toBe(false);
});
