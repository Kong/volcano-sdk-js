/** @jest-environment ./__tests__/node-environment.cjs */
import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import { VolcanoClient } from '../src/index.ts';
import { fetchCall } from './auth-concurrency-fixtures.ts';
import { execution, mockClientFactory, type TransportOperation } from './support/durable-executions-fixtures.ts';
import { rejectWithForeignValue } from './support/non-error-rejection.ts';

const clientWithTransport = mockClientFactory(VolcanoClient);
const anon = {};
const stopped = { ...execution, status: 'stopped' };

const foreign = () => jest.fn<TransportOperation>().mockImplementation(() => rejectWithForeignValue(null));

function readsWithTheApplicationCredential(): void {
  test('reads an execution with the anon key and its client token', async () => {
    const { volcano, transport } = clientWithTransport({}, anon);

    await expect(
      volcano.durable.getFromApplication('order pipeline', 'exec-1', { clientToken: 'ct-1' }),
    ).resolves.toEqual({ data: execution, status: 200, error: null });

    expect(transport.getDurableExecutionFromApplication).toHaveBeenCalledWith(
      'order%20pipeline',
      'exec-1',
      expect.objectContaining({
        volcanoAuthorization: 'anon',
        volcanoClient: volcano,
        headers: { 'X-Volcano-Client-Token': 'ct-1' },
      }),
    );
    expect(transport.getDurableExecution).not.toHaveBeenCalled();
  });

  // A user reaches the executions they started without the token, so a call
  // without one sends no header rather than an empty one.
  test('reads as the signed-in user, with no client token header when none is given', async () => {
    const { volcano, transport } = clientWithTransport({}, { accessToken: 'user-token' });

    await volcano.durable.getFromApplication('order-pipeline', 'exec-1');

    const options = transport.getDurableExecutionFromApplication.mock.calls[0]?.[2];
    expect(options).toEqual(expect.objectContaining({ volcanoAuthorization: 'session', volcanoClient: volcano }));
    expect(options).not.toHaveProperty('headers');
  });

  test('an empty stored token reads with the anon key', async () => {
    const { volcano, transport } = clientWithTransport({}, anon);
    expect(Reflect.set(volcano, 'accessToken', '')).toBe(true);

    await volcano.durable.getFromApplication('order-pipeline', 'exec-1', {});

    expect(transport.getDurableExecutionFromApplication.mock.calls[0]?.[2]).toEqual(
      expect.objectContaining({ volcanoAuthorization: 'anon' }),
    );
  });
}

function stopsWithTheApplicationCredential(): void {
  test('stops an execution with the anon key and its client token', async () => {
    const { volcano, transport } = clientWithTransport({}, anon);

    await expect(
      volcano.durable.stopFromApplication('order-pipeline', 'exec#1', { clientToken: 'ct-1' }),
    ).resolves.toEqual({ data: stopped, status: 200, error: null });

    expect(transport.stopDurableExecutionFromApplication).toHaveBeenCalledWith(
      'order-pipeline',
      'exec%231',
      expect.objectContaining({
        volcanoAuthorization: 'anon',
        volcanoClient: volcano,
        headers: { 'X-Volcano-Client-Token': 'ct-1' },
      }),
    );
    expect(transport.stopDurableExecution).not.toHaveBeenCalled();
  });

  test('stops as the signed-in user, carrying the client token it is given', async () => {
    const { volcano, transport } = clientWithTransport({}, { accessToken: 'user-token' });

    await volcano.durable.stopFromApplication('order-pipeline', 'exec-1', { clientToken: 'ct-1' });

    expect(transport.stopDurableExecutionFromApplication.mock.calls[0]?.[2]).toEqual(
      expect.objectContaining({ volcanoAuthorization: 'session', headers: { 'X-Volcano-Client-Token': 'ct-1' } }),
    );
  });
}

const invalidRequests: [string, unknown[], string][] = [
  ['a blank function', ['  ', 'exec-1'], 'functionName must be a non-empty string'],
  ['no execution', ['order-pipeline', undefined], 'executionId must be a non-empty string'],
  [
    'an empty client token',
    ['order-pipeline', 'exec-1', { clientToken: '' }],
    'clientToken must be a non-empty string',
  ],
  [
    'a long client token',
    ['order-pipeline', 'exec-1', { clientToken: 't'.repeat(129) }],
    'clientToken must be at most 128 characters',
  ],
];

function refusesBeforeSending(): void {
  test.each(invalidRequests)('refuses %s before reaching the platform', async (_case, args, message) => {
    const { volcano, transport } = clientWithTransport({}, anon);
    const operations = [
      volcano.durable.getFromApplication.bind(volcano.durable),
      volcano.durable.stopFromApplication.bind(volcano.durable),
    ];

    await Promise.all(
      operations.map((operation) => {
        const result: unknown = Reflect.apply(operation, undefined, args);
        return expect(result).resolves.toMatchObject({
          data: null,
          status: null,
          error: { message: expect.stringContaining(message) },
        });
      }),
    );
    expect(transport.getDurableExecutionFromApplication).not.toHaveBeenCalled();
    expect(transport.stopDurableExecutionFromApplication).not.toHaveBeenCalled();
  });
}

function reportsFailures(): void {
  // An execution the caller may not reach answers 404, as a missing one does.
  test('surfaces a 404 refusal with its status', async () => {
    const refusal = Object.assign(new Error('durable execution not found'), { status: 404 });
    const rejecting = () => jest.fn<TransportOperation>().mockImplementation(() => Promise.reject(refusal));
    const { volcano } = clientWithTransport(
      { getDurableExecutionFromApplication: rejecting(), stopDurableExecutionFromApplication: rejecting() },
      anon,
    );

    const expected = { data: null, status: 404, error: refusal };
    await expect(volcano.durable.getFromApplication('order-pipeline', 'exec-1')).resolves.toEqual(expected);
    await expect(volcano.durable.stopFromApplication('order-pipeline', 'exec-1')).resolves.toEqual(expected);
  });

  test('names the operation when a failure carries no status', async () => {
    const { volcano } = clientWithTransport(
      { getDurableExecutionFromApplication: foreign(), stopDurableExecutionFromApplication: foreign() },
      anon,
    );

    await expect(volcano.durable.getFromApplication('order-pipeline', 'exec-1')).resolves.toMatchObject({
      status: null,
      error: { message: 'Failed to read durable execution' },
    });
    await expect(volcano.durable.stopFromApplication('order-pipeline', 'exec-1')).resolves.toMatchObject({
      status: null,
      error: { message: 'Failed to stop durable execution' },
    });
  });

  test('rejects a payload that is not an execution', async () => {
    const { volcano } = clientWithTransport(
      {
        stopDurableExecutionFromApplication: jest
          .fn<TransportOperation>()
          .mockResolvedValue({ data: { ...execution, status: 'queued' }, status: 200 }),
      },
      anon,
    );

    await expect(volcano.durable.stopFromApplication('order-pipeline', 'exec-1')).resolves.toMatchObject({
      data: null,
      error: new TypeError('Invalid durable response: Failed to stop durable execution'),
    });
  });
}

describe('durable.getFromApplication / durable.stopFromApplication', () => {
  readsWithTheApplicationCredential();
  stopsWithTheApplicationCredential();
  refusesBeforeSending();
  reportsFailures();
});

function readsAndStopsOverTheWire(): void {
  test('reads the execution on the data-plane route with the anon key and client token', async () => {
    jest.mocked(globalThis.fetch).mockResolvedValue(Response.json(execution));
    const volcano = new VolcanoClient({ apiUrl: 'https://api.test.com', anonKey: 'ak-durable' });

    const { data, error } = await volcano.durable.getFromApplication('order-pipeline', 'exec-1', {
      clientToken: 'ct-1',
    });

    expect(error).toBeNull();
    expect(data).toEqual(execution);
    const [url, init] = fetchCall(0);
    expect(url).toBe('https://api.test.com/durable-functions/order-pipeline/executions/exec-1');
    expect(init?.method).toBe('GET');
    const headers = new Headers(init?.headers);
    expect(headers.get('authorization')).toBe('Bearer ak-durable');
    expect(headers.get('x-volcano-client-token')).toBe('ct-1');
  });

  test('posts a stop with the user session and no client token', async () => {
    jest.mocked(globalThis.fetch).mockResolvedValue(Response.json(stopped));
    const volcano = new VolcanoClient({
      apiUrl: 'https://api.test.com',
      anonKey: 'ak-durable',
      accessToken: 'user-token',
    });

    const { data } = await volcano.durable.stopFromApplication('order-pipeline', 'exec-1');

    expect(data).toEqual(stopped);
    const [url, init] = fetchCall(0);
    expect(url).toBe('https://api.test.com/durable-functions/order-pipeline/executions/exec-1/stop');
    expect(init?.method).toBe('POST');
    const headers = new Headers(init?.headers);
    expect(headers.get('authorization')).toBe('Bearer user-token');
    expect(headers.has('x-volcano-client-token')).toBe(false);
  });
}

function surfacesRefusalsOverTheWire(): void {
  test('surfaces a 404 with its status and message', async () => {
    jest
      .mocked(globalThis.fetch)
      .mockResolvedValue(Response.json({ error: 'durable execution not found' }, { status: 404 }));
    const volcano = new VolcanoClient({ apiUrl: 'https://api.test.com', anonKey: 'ak-durable' });

    const result = await volcano.durable.getFromApplication('order-pipeline', 'exec-1', { clientToken: 'ct-1' });

    expect(result.data).toBeNull();
    expect(result.status).toBe(404);
    expect(result.error).toMatchObject({ status: 404, message: 'durable execution not found' });
  });
}

// A service key scoped without `*` reaches an execution only with its client
// token, so the header goes out beside the key.
function sendsTheClientTokenWithAServiceKey(): void {
  test('sends a service key and the client token together', async () => {
    jest.mocked(globalThis.fetch).mockImplementation(() => Promise.resolve(Response.json(execution)));
    const volcano = new VolcanoClient({ apiUrl: 'https://api.test.com', anonKey: 'sk-scoped' });

    await volcano.durable.getFromApplication('order-pipeline', 'exec-1', { clientToken: 'ct-1' });
    await volcano.durable.stopFromApplication('order-pipeline', 'exec-1', { clientToken: 'ct-1' });

    for (const index of [0, 1]) {
      const headers = new Headers(fetchCall(index)[1]?.headers);
      expect(headers.get('authorization')).toBe('Bearer sk-scoped');
      expect(headers.get('x-volcano-client-token')).toBe('ct-1');
    }
  });
}

// A throttled read of the execution's state answers 503 with Retry-After, and
// a stop answered that way may already have been sent.
function surfacesThrottlingOverTheWire(): void {
  test.each([
    ['read', 'getFromApplication'],
    ['stop', 'stopFromApplication'],
  ] as const)('surfaces a throttled %s with its retry delay', async (_operation, method) => {
    jest
      .mocked(globalThis.fetch)
      .mockResolvedValue(
        Response.json(
          { error: 'durable execution reads are throttled' },
          { status: 503, headers: { 'Retry-After': '3' } },
        ),
      );
    const volcano = new VolcanoClient({ apiUrl: 'https://api.test.com', anonKey: 'ak-durable' });

    const result = await volcano.durable[method]('order-pipeline', 'exec-1', { clientToken: 'ct-1' });

    expect(result.data).toBeNull();
    expect(result.status).toBe(503);
    expect(result.error).toMatchObject({ status: 503, retryAfter: 3 });
  });
}

// The transport tests above settle the credential and the validation; the
// route, the method, and the headers are the real transport's work.
describe('durable application reads and stops over the wire', () => {
  beforeEach(() => {
    jest.mocked(globalThis.fetch).mockReset();
  });

  readsAndStopsOverTheWire();
  sendsTheClientTokenWithAServiceKey();
  surfacesRefusalsOverTheWire();
  surfacesThrottlingOverTheWire();
});
