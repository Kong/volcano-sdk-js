const { recordOutcome, requireSuccessfulOutcome } = require('./contract/world.js');

test('failed contract operations expose status and redact fixture credentials', () => {
  const world = {
    fixture: { service_key: 'fixture-secret-key', user_password: 'fixture-password' },
    client: { accessToken: 'refreshed-secret-token' },
  };
  const error = Object.assign(
    new Error('Cannot start: fixture-secret-key fixture-password refreshed-secret-token'),
    { status: 503, code: 'provider_unavailable', info: { secret: 'body-secret' } },
  );
  recordOutcome(world, null, error);
  expect(() => requireSuccessfulOutcome(world)).toThrow('"status":503');
  expect(() => requireSuccessfulOutcome(world)).toThrow('provider_unavailable');
  let failure;
  try {
    requireSuccessfulOutcome(world);
  } catch (caught) {
    failure = caught;
  }
  expect(failure).toBeInstanceOf(Error);
  expect(failure.message).not.toMatch(
    /fixture-secret-key|fixture-password|refreshed-secret-token|body-secret/,
  );
  expect(failure.message).toContain('[redacted]');
});

test('successful contract operations clear the previous diagnostic', () => {
  const world = { fixture: {} };
  recordOutcome(world, null, Object.assign(new Error('old failure'), { status: 500 }));
  recordOutcome(world, { value: 'success' }, null);
  expect(requireSuccessfulOutcome(world)).toEqual({ value: 'success' });
  expect(world.lastFailure).toBeNull();
});

test('diagnostics redact URLs and bearer tokens without serializing error metadata', () => {
  const world = { fixture: { api_url: 'https://api.test/' } };
  const error = Object.assign(
    new Error('Denied https://api.test/?token=url-secret Bearer header-secret'),
    {
      status: 401,
      code: { secret: 'metadata-secret' },
      response: { headers: { authorization: 'nested-secret' } },
    },
  );
  expect(recordOutcome(world, null, error)).toEqual({
    ok: false,
    category: 'authentication error',
  });
  expect(world.lastFailure).toEqual({
    category: 'authentication error',
    status: 401,
    code: null,
    message: 'Denied [URL] Bearer [redacted]',
  });
});
