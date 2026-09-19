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

test('diagnostics redact equivalent form and percent encodings', () => {
  const world = { fixture: { storage_path: 'private value/part', user_password: 'secret+plus' } };
  recordOutcome(
    world,
    null,
    new Error(
      'Rejected private+value%2fpart private%20value%2Fpart %70rivate+value%2fpart secret+plus secret%2bplus',
    ),
  );
  expect(world.lastFailure.message).toBe(
    'Rejected [redacted] [redacted] [redacted] [redacted] [redacted]',
  );
});

test('diagnostics preserve encoded URL boundaries when decoding whitespace', () => {
  const world = { fixture: {} };
  recordOutcome(
    world,
    null,
    new Error('Denied https%3A%2F%2Fapi.test%2F%3Fnote%3Dhello%20world%26token%3Durl-secret'),
  );
  expect(world.lastFailure.message).toBe('Denied [URL]');
});

test('diagnostics normalize literal percent credentials and repeatedly encoded URLs', () => {
  const world = { fixture: { user_password: 'secret%2Fpath' } };
  const encodedURL = encodeURIComponent(
    encodeURIComponent('https://api.test/?note=hello world&token=url-secret'),
  );
  recordOutcome(world, null, new Error(`Denied secret%252Fpath secret%2Fpath ${encodedURL}`));
  expect(world.lastFailure.message).toBe('Denied [redacted] [redacted] [URL]');
});

test('diagnostics redact valid encoded credentials beside malformed bytes', () => {
  const world = { fixture: { user_password: 'secret' } };
  recordOutcome(world, null, new Error('Denied %73%65%63%72%65%74%FF'));
  expect(world.lastFailure.message).toBe('Denied [redacted]\uFFFD');
});

test('diagnostics omit oversized input and excessive encoding depth', () => {
  const world = { fixture: {} };
  recordOutcome(world, null, new Error('x'.repeat(32_768)));
  expect(world.lastFailure.message).toBe('[diagnostic omitted: oversized input]');
  recordOutcome(world, null, new Error(`Denied %${'25'.repeat(32)}41`));
  expect(world.lastFailure.message).toBe('Denied [redacted]');
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
