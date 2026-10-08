/** @jest-environment ./__tests__/node-environment.cjs */
import { expect, jest, test } from '@jest/globals';
import {
  QueryBuilder,
  type QueryClient,
  queryDatabaseSelectTransport,
  queryError,
} from '../src/database-query.ts';

function fixture(
  payload: unknown,
  accessToken: string | null = 'session',
  error: Error | string | null = null,
) {
  const query = jest
    .fn<(database: string, body: unknown, options: unknown) => Promise<{ data: unknown }>>()
    .mockImplementation(() => Promise.resolve({ data: payload }));
  const client: QueryClient = {
    accessToken,
    _oauthExchangeError: error,
    _transport: { queryDatabaseSelect: query },
    _completeOAuthExchange: () => Promise.resolve(),
    _generatedOptions: (mode) => ({ volcanoAuthorization: mode }),
  };
  return { client, query };
}

test.each([undefined, 'application/vnd.volcano+json'])(
  'typed SELECT transport preserves filter JSON and content type %p',
  async (contentType) => {
    const fetchResponse = Response.json(
      { data: [{ id: 1 }] },
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      },
    );
    const generatedFetch = jest
      .fn<
        (
          path: string,
          options: RequestInit,
          mode: 'anon' | 'session',
          timeoutMs?: number,
        ) => Promise<Response>
      >()
      .mockResolvedValue(fetchResponse);
    const client = { _generatedFetch: generatedFetch };
    const date = new Date('2026-09-23T12:00:00.000Z');
    const request = {
      table: 'events',
      filters: [
        { column: 'created_at', operator: 'gte' as const, value: date },
        { column: 'id', operator: 'in' as const, value: [null, 1] },
      ],
    };
    const headers = contentType === undefined ? undefined : { 'Content-Type': contentType };

    await expect(
      queryDatabaseSelectTransport('db%20one', request, {
        volcanoAuthorization: 'session',
        volcanoClient: client,
        ...(headers === undefined ? {} : { headers }),
      }),
    ).resolves.toMatchObject({ data: { data: [{ id: 1 }] } });

    expect(generatedFetch).toHaveBeenCalledWith(
      '/databases/db%20one/query/select',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify(request),
        headers: expect.any(Headers),
      }),
      'session',
      undefined,
    );
    const call = generatedFetch.mock.calls[0];
    expect(new Headers(call?.[1].headers).get('Content-Type')).toBe(
      contentType ?? 'application/json',
    );
  },
);

test('builds a SELECT request with encoded database, projections, filters, order and pagination', async () => {
  const { client, query } = fixture({ data: [{ id: 1 }], count: 2 });
  const builder = new QueryBuilder(client, 'records', 'db ? one');
  builder.select('id, label').order('id', { ascending: false }).limit(0).offset(2);
  builder.filters.push({ column: 'id', operator: 'eq', value: 1 });

  await expect(builder).resolves.toEqual({ data: [{ id: 1 }], error: null, count: 2 });
  expect(query).toHaveBeenCalledWith(
    'db%20%3F%20one',
    {
      table: 'records',
      select: ['id', 'label'],
      filters: [{ column: 'id', operator: 'eq', value: 1 }],
      order: [{ column: 'id', ascending: false }],
      limit: 0,
      offset: 2,
    },
    { volcanoAuthorization: 'session' },
  );
});

test('keeps a bare SELECT body and derives its count from rows', async () => {
  const { client, query } = fixture({ data: [{ id: 1 }] });
  const builder = new QueryBuilder(client, 'records', 'db');
  builder.select('*');
  await expect(builder.execute()).resolves.toEqual({ data: [{ id: 1 }], error: null, count: 1 });
  expect(query).toHaveBeenCalledWith(
    'db',
    { table: 'records' },
    { volcanoAuthorization: 'session' },
  );
});

test('a new builder defaults to all columns and a later wildcard clears an earlier projection', async () => {
  const { client, query } = fixture({ data: [] });
  await new QueryBuilder(client, 'records', 'db').execute();
  expect(query).toHaveBeenLastCalledWith(
    'db',
    { table: 'records' },
    { volcanoAuthorization: 'session' },
  );

  await new QueryBuilder(client, 'records', 'db').select('id').select('*').execute();
  expect(query).toHaveBeenLastCalledWith(
    'db',
    { table: 'records' },
    { volcanoAuthorization: 'session' },
  );
});

test('accepts an array projection and defaults order to ascending', async () => {
  const { client, query } = fixture({ data: [], count: 0 });
  const columns = ['id', 'title'];
  const builder = new QueryBuilder(client, 'records', 'db');
  expect(builder.select(columns)).toBe(builder);
  expect(builder.order('id')).toBe(builder);
  expect(builder.limit(1)).toBe(builder);
  expect(builder.offset(0)).toBe(builder);
  await expect(builder.execute()).resolves.toEqual({ data: [], error: null, count: 0 });
  expect(query).toHaveBeenCalledWith(
    'db',
    {
      table: 'records',
      select: columns,
      order: [{ column: 'id', ascending: true }],
      limit: 1,
      offset: 0,
    },
    { volcanoAuthorization: 'session' },
  );
});

test.each([
  [null, null, 'No active session. Please sign in first.'],
  ['', '', 'No active session. Please sign in first.'],
  [null, 'exchange failed', 'exchange failed'],
] as const)('rejects missing credentials: %p / %p', async (token, error, message) => {
  const { client, query } = fixture({ data: [] }, token, error);
  const builder = new QueryBuilder(client, 'records', 'db');
  await expect(builder.execute()).resolves.toEqual({
    data: null,
    error: new Error(message),
    count: 0,
  });
  expect(query).not.toHaveBeenCalled();
});

test('preserves an authentication Error object', async () => {
  const error = new Error('exchange refused');
  const { client } = fixture({ data: [] }, null, error);
  const builder = new QueryBuilder(client, 'records', 'db');
  await expect(builder.execute()).resolves.toMatchObject({ data: null, error, count: 0 });
});

test.each([null, ''])('rejects an absent database: %p', async (databaseName) => {
  const { client, query } = fixture({ data: [] });
  const builder = new QueryBuilder(client, 'records', databaseName);
  await expect(builder.execute()).resolves.toEqual({
    data: null,
    error: new Error('Database name not set. Use .database(databaseName) first.'),
    count: 0,
  });
  expect(query).not.toHaveBeenCalled();
});

test.each(['.', '..', 'main/..', 'main/', 'main/branches/dev'])(
  'rejects the database %p, which is a dot segment or contains "/"',
  async (databaseName) => {
    const { client, query } = fixture({ data: [] });
    const builder = new QueryBuilder(client, 'records', databaseName);
    await expect(builder.execute()).resolves.toEqual({
      data: null,
      error: new Error('Database name cannot contain "/" or be "." or ".."'),
      count: 0,
    });
    expect(query).not.toHaveBeenCalled();
  },
);

test.each([
  [null, 'Query response is not an object'],
  [12, 'Query response is not an object'],
  [{}, 'Query response has no rows'],
  [{ data: null }, 'Query response has no rows'],
] as const)('rejects a malformed SELECT payload: %p', async (payload, expectedMessage) => {
  const { client } = fixture(payload);
  const builder = new QueryBuilder(client, 'records', 'db');
  const result = await builder.execute();
  expect(result.data).toBeNull();
  expect(result.error).toBeInstanceOf(TypeError);
  expect(result.error?.message).toBe(expectedMessage);
  expect(result.count).toBe(0);
});

test.each([undefined, 0, 'bad'])(
  'uses row count for absent or invalid counts: %p',
  async (count) => {
    const { client } = fixture({ data: [{ id: 1 }], count });
    const builder = new QueryBuilder(client, 'records', 'db');
    await expect(builder.execute()).resolves.toEqual({ data: [{ id: 1 }], error: null, count: 1 });
  },
);

test('reports transport errors and preserves their identity', async () => {
  const failure = new Error('offline');
  const { client } = fixture({ data: [] });
  client._transport.queryDatabaseSelect = () => Promise.reject(failure);
  const builder = new QueryBuilder(client, 'records', 'db');
  await expect(builder.execute()).resolves.toMatchObject({ data: null, error: failure, count: 0 });
  expect(queryError(failure)).toBe(failure);
  expect(queryError('network failure')).toEqual(new Error('Query failed'));
});

test('forwards a rejected OAuth exchange to the thenable rejection callback', async () => {
  const failure = new Error('exchange failed');
  const { client } = fixture({ data: [] });
  client._completeOAuthExchange = () => Promise.reject(failure);
  const builder = new QueryBuilder(client, 'records', 'db');
  await expect(builder.then(undefined, (error: unknown) => error)).resolves.toBe(failure);
});

function untypedQuery(client: QueryClient, databaseName: unknown): QueryBuilder {
  const builder: unknown = Reflect.construct(QueryBuilder, [client, 'records', databaseName]);
  if (!(builder instanceof QueryBuilder)) {
    throw new TypeError('Expected a query builder');
  }
  return builder;
}

test.each([
  [' \t', 'Database name must be a non-empty string'],
  ['db\uD800', 'Database name is not well-formed Unicode'],
  [undefined, 'Database name not set. Use .database(databaseName) first.'],
])('rejects the blank or missing database %p as a result', async (name, message) => {
  const { client, query } = fixture({ data: [] });
  await expect(untypedQuery(client, name).execute()).resolves.toEqual({
    data: null,
    error: new Error(message),
    count: 0,
  });
  expect(query).not.toHaveBeenCalled();
});

test('sends a non-string database name as its string form, as before', async () => {
  const { client, query } = fixture({ data: [] });
  await expect(untypedQuery(client, 42).execute()).resolves.toMatchObject({ error: null });
  expect(query).toHaveBeenCalledWith('42', expect.anything(), expect.anything());
});
