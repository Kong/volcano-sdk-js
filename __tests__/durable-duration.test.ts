import { expect, test } from '@jest/globals';
import { assert, integer, property } from 'fast-check';
import { optionalDuration, waitDuration } from '../src/durable-duration.ts';
import { propertyOptions } from './support/property-options.ts';

const normalized: readonly [unknown, Record<string, number>][] = [
  [1, { seconds: 1 }],
  ['30s', { seconds: 30 }],
  ['90m', { hours: 1, minutes: 30, seconds: 0 }],
  ['2h', { hours: 2, minutes: 0, seconds: 0 }],
  ['1d2h3m4s', { days: 1, hours: 2, minutes: 3, seconds: 4 }],
  ['1m  30s', { minutes: 1, seconds: 30 }],
  [' \t1s\n', { seconds: 1 }],
  ['366d', { days: 366, hours: 0, minutes: 0, seconds: 0 }],
];

test.each(normalized)('normalizes whole-second duration %p', (value, expected) => {
  expect(waitDuration(value)).toEqual(expected);
});

test.each([
  { days: 1 },
  { hours: 1 },
  { minutes: 90 },
  { seconds: 1 },
  { days: undefined, hours: 1, minutes: undefined, seconds: 0 },
  Object.freeze({ seconds: 5 }),
])('preserves the validated duration object: %p', (value) => {
  expect(waitDuration(value)).toBe(value);
});

test('accepts inherited duration fields without adding own properties', () => {
  const value: unknown = Object.create({ seconds: 1 });
  expect(waitDuration(value)).toBe(value);
  expect(value).toEqual({});
});

test.each([null, false, true, Symbol('duration'), 1n])(
  'rejects non-duration input: %p',
  (value) => {
    expect(() => waitDuration(value)).toThrow(
      'wait must be a duration string, a number of seconds, or a duration object',
    );
  },
);

test.each([-1, 0.5, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
  'rejects non-whole or negative seconds: %p',
  (value) => {
    expect(() => waitDuration(value)).toThrow(
      'wait must be a non-negative whole number of seconds',
    );
  },
);

test.each(['', ' ', 'soon', '400ms', '1.5h', '-1s', '1', '1S', '1 s', '1s\t2s', '1s!', '1é'])(
  'rejects malformed duration text: %p',
  (value) => {
    expect(() => waitDuration(value)).toThrow('wait must be a duration in whole seconds');
  },
);

test.each([{}, [], { days: undefined }, new Date(0)])(
  'rejects an empty duration object: %p',
  (value) => {
    expect(() => waitDuration(value)).toThrow(
      'wait duration needs one of days, hours, minutes, seconds',
    );
  },
);

test.each([{ milliseconds: 500 }, { seconds: 1, extra: 0 }, [1]])(
  'rejects unknown duration fields: %p',
  (value) => {
    expect(() => waitDuration(value)).toThrow('wait duration takes days, hours, minutes, seconds');
  },
);

test.each([null, false, '1', 1.5, -1, Number.NaN, Number.POSITIVE_INFINITY])(
  'rejects invalid duration parts: %p',
  (seconds) => {
    expect(() => waitDuration({ seconds })).toThrow(
      'wait duration seconds must be a non-negative whole number',
    );
  },
);

test.each([0, '0s', { seconds: 0 }])('rejects a wait below one second: %p', (value) => {
  expect(() => waitDuration(value)).toThrow('wait must be at least 1 second');
});

test.each([31622401, '367d', { days: 367 }, { seconds: Number.MAX_VALUE }])(
  'rejects waits longer than the execution lifetime: %p',
  (value) => {
    expect(() => waitDuration(value)).toThrow('wait must be at most 31622400 seconds (366 days)');
  },
);

test('leaves omitted delays absent and lets the engine bound retry delays', () => {
  expect(optionalDuration(undefined, 'interval')).toBeUndefined();
  expect(optionalDuration(0, 'interval')).toEqual({ seconds: 0 });
  expect(optionalDuration('367d', 'interval')).toEqual({
    days: 367,
    hours: 0,
    minutes: 0,
    seconds: 0,
  });
});

test('names the invalid configuration field', () => {
  expect(() => optionalDuration('400ms', 'maxDelay')).toThrow('maxDelay must be a duration');
});

test('numeric and textual durations preserve the same whole seconds', () => {
  assert(
    property(integer({ min: 1, max: 31622400 }), (seconds) => {
      expect(waitDuration(`${String(seconds)}s`)).toEqual(waitDuration(seconds));
    }),
    propertyOptions(),
  );
});

test('rejects numeric overflow in duration text before constructing engine fields', () => {
  expect(() => waitDuration(`${'9'.repeat(400)}s`)).toThrow(
    'wait must be a duration in whole seconds',
  );
  expect(() => optionalDuration(`${'9'.repeat(400)}d`, 'interval')).toThrow(
    'interval must be a duration in whole seconds',
  );
});
