/** @jest-environment node */
import { expect, test } from '@jest/globals';
import {
  decodeBase64Url,
  extractRequiredProjectIdFromToken,
  extractSessionIdFromToken,
} from '../src/token-claims.ts';

function token(payload: unknown): string {
  return `header.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.signature`;
}

function withoutGlobal<T>(name: string, action: () => T): T {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, name);
  Object.defineProperty(globalThis, name, { configurable: true, value: undefined });
  try {
    return action();
  } finally {
    if (descriptor === undefined) {
      Reflect.deleteProperty(globalThis, name);
    } else {
      Object.defineProperty(globalThis, name, descriptor);
    }
  }
}

test.each([undefined, null, false, 12, {}, ''])('rejects an absent token: %p', (value) => {
  expect(() => extractRequiredProjectIdFromToken(value)).toThrow('No active session');
  expect(extractSessionIdFromToken(value)).toBeNull();
});

test.each(['one', 'one.two', 'one.two.three.four'])('requires three segments: %s', (value) => {
  expect(() => extractRequiredProjectIdFromToken(value, 'refreshToken')).toThrow(
    'refreshToken must be a JWT with project_id claim',
  );
  expect(extractSessionIdFromToken(value)).toBeNull();
});

test.each(['header.!.signature', 'header.eA.signature', 'header..signature'])(
  'handles invalid encoded JSON: %s',
  (value) => {
    expect(() => extractRequiredProjectIdFromToken(value)).toThrow(
      'accessToken must be a valid JWT with project_id claim',
    );
    expect(extractSessionIdFromToken(value)).toBeNull();
  },
);

test.each([null, false, 12, 'value', [], {}, { project_id: 12 }, { project_id: ' ' }])(
  'requires a nonempty project claim: %p',
  (payload) => {
    expect(() => extractRequiredProjectIdFromToken(token(payload))).toThrow(
      'accessToken missing project_id claim',
    );
    expect(extractSessionIdFromToken(token(payload))).toBeNull();
  },
);

test('trims project claims without interpreting header or signature', () => {
  const payload = Buffer.from('{"project_id":" project "}').toString('base64url');
  expect(extractRequiredProjectIdFromToken(`.${payload}.`)).toBe('project');
});

test.each(['ABCDEF01-2345-6789-ABCD-EF0123456789', 'abcdef01-2345-6789-abcd-ef0123456789'])(
  'normalizes a session UUID: %s',
  (sessionId) => {
    expect(extractSessionIdFromToken(token({ session_id: sessionId }))).toBe(
      'abcdef01-2345-6789-abcd-ef0123456789',
    );
  },
);

test.each([null, 12, {}, '', 'not-a-uuid', ' abcdef01-2345-6789-abcd-ef0123456789'])(
  'rejects invalid session claims: %p',
  (sessionId) => {
    expect(extractSessionIdFromToken(token({ session_id: sessionId }))).toBeNull();
  },
);

test.each([
  ['Zg', 'f'],
  ['Zm8', 'fo'],
  ['Zm9v', 'foo'],
  ['Zg==', 'f'],
  ['-_8', '\u00FB\u00FF'],
])('decodes browser base64url input %s', (encoded, expected) => {
  expect(decodeBase64Url(encoded)).toBe(expected);
});

test('uses the Node UTF-8 decoder when atob is unavailable', () => {
  const result = withoutGlobal('atob', () => decodeBase64Url('w6k'));
  expect(result).toBe('é');
});

test('reports when neither platform decoder exists', () => {
  expect(() =>
    withoutGlobal('atob', () => withoutGlobal('Buffer', () => decodeBase64Url('Zg'))),
  ).toThrow('No base64 decoder available');
});
