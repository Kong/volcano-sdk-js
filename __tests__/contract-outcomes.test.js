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

test('diagnostics redact WebSocket endpoints including query credentials', () => {
  const world = { fixture: {} };
  recordOutcome(
    world,
    null,
    new Error('Failed ws://local.test/?token=secret-one wss://live.test/?token=secret-two'),
  );
  expect(world.lastFailure.message).toBe('Failed [URL] [URL]');
});

test('diagnostics redact nested fixture strings and their encoded forms', () => {
  const world = {
    fixture: {
      fixture_row: { name: 'private fixture value' },
      mutation_rows: [{ value: 'private mutation value' }],
    },
  };
  recordOutcome(
    world,
    null,
    new Error('Rejected private fixture value private%20mutation%20value'),
  );
  expect(world.lastFailure.message).toBe('Rejected [redacted] [redacted]');
});

test('diagnostics redact session snapshots after client credentials are cleared', () => {
  const world = {
    fixture: {},
    client: { accessToken: null, refreshToken: null },
    previousSession: { access_token: 'previous-access', refresh_token: 'previous-refresh' },
    refreshedSession: { access_token: 'refreshed-access', refresh_token: 'refreshed-refresh' },
    signedOutSession: { access_token: 'signed-out-access', refresh_token: 'signed-out-refresh' },
  };
  recordOutcome(
    world,
    null,
    new Error(
      'Rejected previous-access previous-refresh refreshed-access refreshed-refresh signed-out-access signed-out-refresh',
    ),
  );
  expect(world.lastFailure.message).toBe(
    'Rejected [redacted] [redacted] [redacted] [redacted] [redacted] [redacted]',
  );
});
