/** @jest-environment ./__tests__/node-environment.cjs */
import { expect, test } from '@jest/globals';
import { recoveryIdentity, sameRecoveryIdentity } from '../src/realtime-identity.ts';

function token(payload: unknown): string {
  return `header.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.signature`;
}

test.each(['', '.signature.extra'])(
  'retains credentials with valid claims but an invalid segment count: %p',
  (suffix) => {
    const payload = Buffer.from(JSON.stringify({ project_id: 'project', sub: 'user' })).toString(
      'base64url',
    );
    const value = `header.${payload}${suffix}`;
    expect(recoveryIdentity(value)).toEqual({ kind: 'credential', token: value });
  },
);

test.each([undefined, null, false, 12, {}, '', 'one', 'one.two', 'one.two.three.four'])(
  'retains an unstructured credential without coercion: %p',
  (value) => {
    expect(recoveryIdentity(value)).toEqual({ kind: 'credential', token: value });
  },
);

test.each(['header.!.signature', 'header.eA.signature', 'header..signature'])(
  'falls back to the credential for invalid encoded JSON: %s',
  (value) => {
    expect(recoveryIdentity(value)).toEqual({ kind: 'credential', token: value });
  },
);

test.each([
  null,
  false,
  12,
  'value',
  [],
  {},
  { project_id: 12, sub: 'user' },
  { project_id: '', sub: 'user' },
  { project_id: 'project' },
  { project_id: 'project', sub: 12 },
  { project_id: 'project', sub: '' },
])('requires both nonempty string claims: %p', (payload) => {
  const value = token(payload);
  expect(recoveryIdentity(value)).toEqual({ kind: 'credential', token: value });
});

test('preserves claim whitespace without authenticating the token', () => {
  expect(recoveryIdentity(token({ project_id: ' project ', sub: ' user ' }))).toEqual({
    kind: 'user',
    projectId: ' project ',
    subject: ' user ',
  });
});

test('retains identity when a token rotates for the same project and subject', () => {
  const left = recoveryIdentity(token({ project_id: 'project', sub: 'user', exp: 1 }));
  const right = recoveryIdentity(token({ project_id: 'project', sub: 'user', exp: 2 }));
  expect(sameRecoveryIdentity(left, right)).toBe(true);
});

test.each([[{ project_id: 'other', sub: 'user' }], [{ project_id: 'project', sub: 'other' }]])(
  'isolates distinct user identities: %p',
  (payload) => {
    const left = recoveryIdentity(token({ project_id: 'project', sub: 'user' }));
    expect(sameRecoveryIdentity(left, recoveryIdentity(token(payload)))).toBe(false);
  },
);

test('never equates a user identity with a credential identity in either direction', () => {
  const user = recoveryIdentity(token({ project_id: 'project', sub: 'user' }));
  const credential = recoveryIdentity('service-key');
  const absentToken = new Map<string, unknown>().get('missing');
  expect(sameRecoveryIdentity(user, credential)).toBe(false);
  expect(sameRecoveryIdentity(credential, user)).toBe(false);
  expect(sameRecoveryIdentity(user, recoveryIdentity(absentToken))).toBe(false);
  expect(sameRecoveryIdentity(recoveryIdentity(absentToken), user)).toBe(false);
});

test('uses the identity kind even when a credential has user-shaped extra fields', () => {
  const user = recoveryIdentity(token({ project_id: 'project', sub: 'user' }));
  const credentialWithFields: Parameters<typeof sameRecoveryIdentity>[1] & {
    projectId: string;
    subject: string;
  } = { kind: 'credential', token: 'service-key', projectId: 'project', subject: 'user' };
  expect(sameRecoveryIdentity(user, credentialWithFields)).toBe(false);
});

test('compares fallback credentials by strict identity', () => {
  const value = {};
  expect(sameRecoveryIdentity(recoveryIdentity(value), recoveryIdentity(value))).toBe(true);
  expect(sameRecoveryIdentity(recoveryIdentity(value), recoveryIdentity({}))).toBe(false);
  expect(sameRecoveryIdentity(recoveryIdentity('first'), recoveryIdentity('second'))).toBe(false);
});
