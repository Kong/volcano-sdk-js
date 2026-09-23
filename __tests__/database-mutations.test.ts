/** @jest-environment ./__tests__/node-environment.cjs */
import { expect, jest, test } from '@jest/globals';
import { MutationBuilder, type MutationClient, mutationError } from '../src/database-mutations.ts';

function client(
  accessToken: string | null = 'session',
  error: Error | string | null = null,
): MutationClient {
  return {
    apiUrl: 'https://api.test',
    timeout: 1_000,
    accessToken,
    _oauthExchangeError: error,
    _completeOAuthExchange: () => Promise.resolve(),
    _captureAuthContext: () => ({ accessToken }),
    _refreshSessionForContext: () => Promise.resolve({ error: null }),
    _isAuthContextCurrent: () => true,
  };
}

function mockResponse(status: number, body: unknown): void {
  globalThis.fetch = jest.fn(() => Promise.resolve(Response.json(body, { status })));
}

test('posts encoded mutations with values and filters, and remains awaitable', async () => {
  mockResponse(200, { data: [{ id: 1 }] });
  const builder = new MutationBuilder(client(), 'records', 'db / one', 'update', { label: 'new' });
  builder.filters.push({ column: 'id', operator: 'eq', value: 1 });

  await expect(builder).resolves.toEqual({ data: [{ id: 1 }], error: null });
  expect(globalThis.fetch).toHaveBeenCalledWith(
    'https://api.test/databases/db%20%2F%20one/query/update',
    expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({
        table: 'records',
        values: { label: 'new' },
        filters: [{ column: 'id', operator: 'eq', value: 1 }],
      }),
    }),
  );
});

test('omits values and filters for deletes', async () => {
  mockResponse(200, { data: [] });
  const builder = new MutationBuilder(client(), 'records', 'db', 'delete', null);
  await expect(builder.execute()).resolves.toEqual({ data: [], error: null });
  expect(globalThis.fetch).toHaveBeenCalledWith(
    expect.any(String),
    expect.objectContaining({ body: JSON.stringify({ table: 'records' }) }),
  );
});

test('rejects missing credentials before requesting a mutation', async () => {
  const noSession = new MutationBuilder(client(null), 'records', 'db', 'insert', {});
  const emptySession = new MutationBuilder(client('', ''), 'records', 'db', 'insert', {});
  const messageFailure = new MutationBuilder(
    client(null, 'exchange refused'),
    'records',
    'db',
    'insert',
    {},
  );
  const exchangeFailure = new Error('exchange refused');
  const failedExchange = new MutationBuilder(
    client(null, exchangeFailure),
    'records',
    'db',
    'insert',
    {},
  );
  await expect(noSession.execute()).resolves.toMatchObject({
    data: null,
    error: new Error('No active session. Please sign in first.'),
  });
  await expect(emptySession.execute()).resolves.toMatchObject({
    data: null,
    error: new Error('No active session. Please sign in first.'),
  });
  await expect(messageFailure.execute()).resolves.toMatchObject({
    data: null,
    error: new Error('exchange refused'),
  });
  await expect(failedExchange.execute()).resolves.toMatchObject({
    data: null,
    error: exchangeFailure,
  });
});

test.each([null, ''])('rejects an absent database name: %p', async (databaseName) => {
  const builder = new MutationBuilder(client(), 'records', databaseName, 'insert', {});
  await expect(builder.execute()).resolves.toMatchObject({
    data: null,
    error: new Error('Database name not set. Use .database(databaseName) first.'),
  });
});

test.each([
  [{ error: 'constraint violation' }, 'constraint violation'],
  [{ error: 42 }, '42'],
  [{}, 'insert failed'],
] as const)('reports a failed response: %p', async (body, message) => {
  mockResponse(409, body);
  const builder = new MutationBuilder(client(), 'records', 'db', 'insert', {});
  await expect(builder.execute()).resolves.toMatchObject({ data: null, error: new Error(message) });
});

test('preserves an Error supplied by a failed response', async () => {
  const failure = new Error('constraint violation');
  const response = Response.json({}, { status: 409 });
  response.json = () => Promise.resolve({ error: failure });
  globalThis.fetch = jest.fn(() => Promise.resolve(response));
  const builder = new MutationBuilder(client(), 'records', 'db', 'insert', {});
  await expect(builder.execute()).resolves.toMatchObject({ data: null, error: failure });
});

test.each([{}, 12])('preserves missing data as undefined: %p', async (body) => {
  mockResponse(200, body);
  const builder = new MutationBuilder(client(), 'records', 'db', 'insert', {});
  await expect(builder.execute()).resolves.toEqual({ data: undefined, error: null });
});

test('converts a null response into an error', async () => {
  mockResponse(200, null);
  const builder = new MutationBuilder(client(), 'records', 'db', 'insert', {});
  await expect(builder.execute()).resolves.toMatchObject({
    data: null,
    error: new TypeError('Mutation response is null'),
  });
});

test('returns network errors without changing their identity', async () => {
  const failure = new Error('offline');
  globalThis.fetch = jest.fn(() => Promise.reject(failure));
  const builder = new MutationBuilder(client(), 'records', 'db', 'insert', {});
  await expect(builder.execute()).resolves.toMatchObject({ data: null, error: failure });
});

test('normalizes non-Error failures without hiding Error identity', () => {
  const failure = new Error('offline');
  expect(mutationError(failure, 'insert')).toBe(failure);
  expect(mutationError('network failure', 'delete')).toEqual(new Error('delete failed'));
});

test('forwards the rejection callback of its thenable interface', async () => {
  const failure = new Error('exchange failed');
  const context = client();
  context._completeOAuthExchange = () => Promise.reject(failure);
  const builder = new MutationBuilder(context, 'records', 'db', 'insert', {});
  await expect(builder.then(undefined, (error: unknown) => error)).resolves.toBe(failure);
});
