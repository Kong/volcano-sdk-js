/** @jest-environment ./__tests__/node-environment.cjs */
import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import { VolcanoClient } from '../src/index.ts';
import * as centrifuge from '../src/realtime-centrifuge.ts';
import { VolcanoRealtime } from '../src/realtime-client.ts';
import type { DurableMessage, DurableMessageList } from '../src/sdk-public-types.ts';
import { deferred, signal } from './auth-concurrency-fixtures.ts';
import { rejectWithForeignValue } from './support/non-error-rejection.ts';

const target = { functionName: 'checkout', executionId: 'exec-1', clientToken: 'ct-1' };

function message(seq: number, overrides: Partial<DurableMessage> = {}): DurableMessage {
  return {
    id: `msg-${String(seq)}`,
    execution_id: 'exec-1',
    direction: 'out',
    seq,
    name: 'progress',
    data: { percent: seq * 10 },
    sender: { type: 'execution', user_id: null },
    status: 'published',
    delivered_at: null,
    sent_at: '2026-10-12T09:30:00Z',
    ...overrides,
  };
}

const sent = message(1, {
  direction: 'in',
  name: 'address-confirmed',
  data: { address_id: 'addr_19' },
  sender: { type: 'anon', user_id: null },
  status: 'delivered',
  delivered_at: '2026-10-12T09:30:01Z',
});

const fetchMock = () => jest.mocked(globalThis.fetch);

function lastRequest() {
  const [url, init] = fetchMock().mock.calls.at(-1) ?? [];
  return { url, method: init?.method, headers: new Headers(init?.headers), body: init?.body };
}

const page = (messages: DurableMessage[], hasMore = false): DurableMessageList => ({
  data: messages,
  has_more: hasMore,
});

type TransportOperation = (...args: unknown[]) => Promise<{ data: unknown; status: number }>;
type TransportMock = jest.Mock<TransportOperation>;

interface MessagesTransport {
  sendDurableMessage: TransportMock;
  sendDurableMessageFromApplication: TransportMock;
  listDurableMessages: TransportMock;
  listDurableMessagesFromApplication: TransportMock;
}

const resolving = (data: unknown, status = 200): TransportMock =>
  jest.fn<TransportOperation>().mockResolvedValue({ data, status });

function messagesTransport(overrides: Partial<MessagesTransport> = {}): MessagesTransport {
  return {
    sendDurableMessage: resolving(sent, 201),
    sendDurableMessageFromApplication: resolving(sent, 201),
    listDurableMessages: resolving(page([sent])),
    listDurableMessagesFromApplication: resolving(page([])),
    ...overrides,
  };
}

function clientWithTransport(
  overrides: Partial<MessagesTransport> = {},
  credentials: { accessToken?: string } = {},
) {
  const transport = messagesTransport(overrides);
  const config = {
    apiUrl: 'https://api.test.com',
    anonKey: 'ak-durable',
    ...credentials,
    transportFactory: () => transport,
  };
  return { volcano: new VolcanoClient(config), transport };
}

const options = (
  volcano: VolcanoClient,
  mode: 'anon' | 'session',
  headers: Record<string, string>,
) => expect.objectContaining({ volcanoAuthorization: mode, volcanoClient: volcano, headers });

const refused = (message: string) => ({ data: null, status: null, error: new Error(message) });

describe('durable.messages.send', () => {
  test('sends with the client credential, the client token, and the idempotency key', async () => {
    const { volcano, transport } = clientWithTransport();

    await expect(
      volcano.durable.messages.send(
        target,
        'address-confirmed',
        { address_id: 'addr_19' },
        { idempotencyKey: 'confirm-addr_19' },
      ),
    ).resolves.toEqual({ data: sent, status: 201, error: null });
    expect(transport.sendDurableMessageFromApplication).toHaveBeenCalledWith(
      'checkout',
      'exec-1',
      { name: 'address-confirmed', data: { address_id: 'addr_19' } },
      options(volcano, 'anon', {
        'Idempotency-Key': 'confirm-addr_19',
        'X-Volcano-Client-Token': 'ct-1',
      }),
    );
    expect(transport.sendDurableMessage).not.toHaveBeenCalled();
  });

  test("sends as the signed-in user, leaving out what the caller didn't set", async () => {
    const { volcano, transport } = clientWithTransport({}, { accessToken: 'user-token' });

    await volcano.durable.messages.send({ functionName: 'checkout', executionId: 'exec-1' }, 'go');

    expect(transport.sendDurableMessageFromApplication).toHaveBeenCalledWith(
      'checkout',
      'exec-1',
      { name: 'go' },
      options(volcano, 'session', {}),
    );
    expect(transport.sendDurableMessageFromApplication.mock.calls[0]?.[2]).toStrictEqual({
      name: 'go',
    });
  });

  test.each([null, false, 0, ''])('sends %p data as it is', async (data) => {
    const { volcano, transport } = clientWithTransport();

    await volcano.durable.messages.send(target, 'go', data);

    expect(transport.sendDurableMessageFromApplication.mock.calls[0]?.[2]).toStrictEqual({
      name: 'go',
      data,
    });
  });

  test('sends through the project with the owner session and no client token', async () => {
    const { volcano, transport } = clientWithTransport({}, { accessToken: 'owner-token' });

    await expect(
      volcano.durable.messages.send({ ...target, projectId: 'proj-1' }, 'go', 1, {
        idempotencyKey: 'k',
      }),
    ).resolves.toEqual({ data: sent, status: 201, error: null });
    expect(transport.sendDurableMessage).toHaveBeenCalledWith(
      'proj-1',
      'checkout',
      'exec-1',
      { name: 'go', data: 1 },
      options(volcano, 'session', { 'Idempotency-Key': 'k' }),
    );
    expect(transport.sendDurableMessageFromApplication).not.toHaveBeenCalled();
  });

  test('refuses the project route without a session', async () => {
    const { volcano, transport } = clientWithTransport();

    await expect(
      volcano.durable.messages.send({ ...target, projectId: 'proj-1' }, 'go'),
    ).resolves.toEqual(refused('No active session'));
    await expect(
      volcano.durable.messages.list({ ...target, projectId: 'proj-1' }),
    ).resolves.toEqual(refused('No active session'));
    for (const mock of Object.values(transport)) {
      expect(mock).not.toHaveBeenCalled();
    }
  });

  test.each([
    ['no target', [undefined, 'go'], 'target must be an object'],
    ['a null target', [null, 'go'], 'target must be an object'],
    ['a target that is a list', [['checkout', 'exec-1'], 'go'], 'target must be an object'],
    ['no function', [{ executionId: 'exec-1' }, 'go'], 'functionName must be a non-empty string'],
    [
      'a blank execution',
      [{ functionName: 'checkout', executionId: ' ' }, 'go'],
      'executionId must be a non-empty string',
    ],
    [
      'an empty project',
      [{ ...target, projectId: '' }, 'go'],
      'projectId must be a non-empty string',
    ],
    [
      'an empty client token',
      [{ ...target, clientToken: '' }, 'go'],
      'clientToken must be a non-empty string when provided',
    ],
    [
      'a client token that is not text',
      [{ ...target, clientToken: 7 }, 'go'],
      'clientToken must be a non-empty string when provided',
    ],
    ['no name', [target], 'name must be a non-empty string'],
    ['a blank name', [target, '  '], 'name must be a non-empty string'],
    [
      'an empty idempotency key',
      [target, 'go', null, { idempotencyKey: '' }],
      'idempotencyKey must be a non-empty string when provided',
    ],
    [
      'an idempotency key that is not text',
      [target, 'go', null, { idempotencyKey: 7 }],
      'idempotencyKey must be a non-empty string when provided',
    ],
    [
      'a long idempotency key',
      [target, 'go', null, { idempotencyKey: 'k'.repeat(256) }],
      'idempotencyKey must be at most 255 characters',
    ],
  ])('refuses %s before reaching the platform', async (_case, args, error) => {
    const { volcano, transport } = clientWithTransport();
    const { messages } = volcano.durable;

    const result: unknown = Reflect.apply(messages.send.bind(messages), undefined, args);

    await expect(result).resolves.toEqual(refused(error));
    for (const mock of Object.values(transport)) {
      expect(mock).not.toHaveBeenCalled();
    }
  });

  test('accepts the longest idempotency key', async () => {
    const { volcano, transport } = clientWithTransport();

    await volcano.durable.messages.send(target, 'go', null, { idempotencyKey: 'k'.repeat(255) });

    expect(transport.sendDurableMessageFromApplication).toHaveBeenCalledTimes(1);
  });

  test('escapes every segment it puts in the path', async () => {
    const { volcano, transport } = clientWithTransport({}, { accessToken: 'owner-token' });
    const escaped = { functionName: 'check?out', executionId: 'exec#1' };

    await volcano.durable.messages.send(escaped, 'go');
    await volcano.durable.messages.send({ ...escaped, projectId: 'proj/1' }, 'go');
    await volcano.durable.messages.list({ ...escaped, projectId: 'proj 1' });

    expect(transport.sendDurableMessageFromApplication.mock.calls[0]?.slice(0, 2)).toEqual([
      'check%3Fout',
      'exec%231',
    ]);
    expect(transport.sendDurableMessage).not.toHaveBeenCalled();
    expect(transport.listDurableMessages.mock.calls[0]?.slice(0, 3)).toEqual([
      'proj%201',
      'check%3Fout',
      'exec%231',
    ]);
  });

  test('refuses a message the platform answered with a malformed body', async () => {
    const { volcano } = clientWithTransport({
      sendDurableMessageFromApplication: resolving({ ...sent, seq: '1' }, 201),
    });

    await expect(volcano.durable.messages.send(target, 'go')).resolves.toEqual({
      data: null,
      status: null,
      error: new TypeError('Invalid durable response: Failed to send durable message'),
    });
  });

  test('reports a transport failure that carries no status', async () => {
    const { volcano } = clientWithTransport({
      sendDurableMessageFromApplication: jest
        .fn<TransportOperation>()
        .mockImplementation(() => rejectWithForeignValue('socket hang up')),
    });

    await expect(volcano.durable.messages.send(target, 'go')).resolves.toMatchObject({
      data: null,
      status: null,
      error: { message: 'Failed to send durable message', cause: 'socket hang up' },
    });
  });
});

describe('durable.messages.list', () => {
  test('forwards only the filters the caller set', async () => {
    const { volcano, transport } = clientWithTransport();

    await expect(volcano.durable.messages.list(target)).resolves.toEqual({
      data: page([]),
      status: 200,
      error: null,
    });
    expect(transport.listDurableMessagesFromApplication).toHaveBeenCalledWith(
      'checkout',
      'exec-1',
      {},
      options(volcano, 'anon', { 'X-Volcano-Client-Token': 'ct-1' }),
    );
    expect(transport.listDurableMessagesFromApplication.mock.calls[0]?.[2]).toStrictEqual({});

    const filters: Record<string, unknown> = {
      direction: 'out',
      name: 'progress',
      after: 3,
      limit: 50,
      status: 'published',
    };
    await volcano.durable.messages.list(target, filters);
    expect(transport.listDurableMessagesFromApplication.mock.calls[1]?.[2]).toStrictEqual({
      direction: 'out',
      name: 'progress',
      after: 3,
      limit: 50,
    });
  });

  test('lists through the project with the owner session', async () => {
    const { volcano, transport } = clientWithTransport({}, { accessToken: 'owner-token' });

    await expect(
      volcano.durable.messages.list({ ...target, projectId: 'proj-1' }, { direction: 'in' }),
    ).resolves.toEqual({ data: page([sent]), status: 200, error: null });
    expect(transport.listDurableMessages).toHaveBeenCalledWith(
      'proj-1',
      'checkout',
      'exec-1',
      { direction: 'in' },
      options(volcano, 'session', {}),
    );
  });

  test('refuses an invalid target before reaching the platform', async () => {
    const { volcano, transport } = clientWithTransport();

    await expect(
      volcano.durable.messages.list({ functionName: '', executionId: 'exec-1' }),
    ).resolves.toEqual(refused('functionName must be a non-empty string'));
    expect(transport.listDurableMessagesFromApplication).not.toHaveBeenCalled();
  });

  test('accepts every status and sender user', async () => {
    const statuses = ['queued', 'delivering', 'delivered', 'dropped', 'published'] as const;
    const messages = statuses.map((status, index) =>
      message(index + 1, { status, sender: { type: 'user', user_id: 'user-1' } }),
    );
    const { volcano } = clientWithTransport({
      listDurableMessagesFromApplication: resolving(page(messages, true)),
    });

    const { data, error } = await volcano.durable.messages.list(target);

    expect(error).toBeNull();
    expect(data?.data.map((entry) => entry.status)).toEqual(statuses);
    expect(data?.has_more).toBe(true);
  });

  test.each([
    ['no body', null],
    ['entries that are not a list', { data: {}, has_more: false }],
    ['no has_more', { data: [] }],
    ['a has_more that is text', { data: [], has_more: 'no' }],
    ['an entry that is not an object', { data: ['msg-1'], has_more: false }],
    [
      'an entry with a list for a sender',
      { data: [{ ...message(1), sender: [] }], has_more: false },
    ],
    ...(
      [
        ['an id', { id: 1 }],
        ['an execution', { execution_id: null }],
        ['a known direction', { direction: 'sideways' }],
        ['a seq', { seq: '1' }],
        ['a name', { name: undefined }],
        ['a sender', { sender: null }],
        ['a sender type', { sender: { user_id: null } }],
        ['a sender user that is a string or null', { sender: { type: 'user', user_id: 7 } }],
        ['a known status', { status: 'sent' }],
        ['a delivery time that is a string or null', { delivered_at: 0 }],
        ['a send time', { sent_at: null }],
      ] as const
    ).map(([field, change]): [string, unknown] => [
      `an entry without ${field}`,
      { data: [message(1), { ...message(2), ...change }], has_more: false },
    ]),
  ])('refuses a page with %s', async (_case, body) => {
    const { volcano } = clientWithTransport({
      listDurableMessagesFromApplication: resolving(body),
    });

    await expect(volcano.durable.messages.list(target)).resolves.toEqual({
      data: null,
      status: null,
      error: new TypeError('Invalid durable response: Failed to list durable messages'),
    });
  });
});

// The transport tests above settle the credential and the validation; the
// route, the method, the headers, and how a refusal reads are the real
// transport's work.
describe('durable.messages over the wire', () => {
  beforeEach(() => {
    fetchMock().mockReset();
  });

  test('sends to the execution with the anon key and client token', async () => {
    fetchMock().mockResolvedValueOnce(Response.json(sent, { status: 201 }));
    const volcano = new VolcanoClient({ apiUrl: 'https://api.test.com', anonKey: 'ak-durable' });

    const { data, status } = await volcano.durable.messages.send(
      target,
      'address-confirmed',
      { address_id: 'addr_19' },
      { idempotencyKey: 'confirm-addr_19' },
    );

    expect(status).toBe(201);
    expect(data).toEqual(sent);
    expect(lastRequest()).toMatchObject({
      url: 'https://api.test.com/durable-functions/checkout/executions/exec-1/messages',
      method: 'POST',
      body: JSON.stringify({ name: 'address-confirmed', data: { address_id: 'addr_19' } }),
    });
    expect(lastRequest().headers.get('authorization')).toBe('Bearer ak-durable');
    expect(lastRequest().headers.get('idempotency-key')).toBe('confirm-addr_19');
    expect(lastRequest().headers.get('x-volcano-client-token')).toBe('ct-1');
    expect(lastRequest().headers.get('content-type')).toBe('application/json');
  });

  test('lists through the project with its filters', async () => {
    fetchMock().mockResolvedValueOnce(Response.json(page([sent])));
    const volcano = new VolcanoClient({
      apiUrl: 'https://api.test.com',
      anonKey: 'ak-durable',
      accessToken: 'owner-token',
    });

    await volcano.durable.messages.list(
      { ...target, projectId: 'proj-1' },
      { direction: 'out', after: 3, limit: 5 },
    );

    expect(lastRequest()).toMatchObject({
      url: 'https://api.test.com/projects/proj-1/durable-functions/checkout/executions/exec-1/messages?direction=out&after=3&limit=5',
      method: 'GET',
    });
    expect(lastRequest().headers.get('authorization')).toBe('Bearer owner-token');
    expect(lastRequest().headers.has('x-volcano-client-token')).toBe(false);
  });

  // A refusal is a result, not an exception, and keeps the platform's code.
  test.each([
    [404, undefined, 'durable execution not found'],
    [409, 'execution_not_running', 'execution has ended'],
    [409, 'too_many_queued_messages', 'too many queued messages'],
  ])('surfaces a %d refusal with its status and code', async (status, code, error) => {
    fetchMock().mockResolvedValueOnce(Response.json({ error, code }, { status }));
    const volcano = new VolcanoClient({ apiUrl: 'https://api.test.com', anonKey: 'ak-durable' });

    const result = await volcano.durable.messages.send(target, 'go');

    expect(result.data).toBeNull();
    expect(result.status).toBe(status);
    expect(result.error).toMatchObject({
      status,
      message: error,
      ...(code === undefined ? {} : { code }),
    });
  });
});

type Listener = (context: unknown) => void;

class Emitter {
  readonly listeners = new Map<string, Set<Listener>>();

  on(event: string, listener: Listener): void {
    const listeners = this.listeners.get(event) ?? new Set<Listener>();
    listeners.add(listener);
    this.listeners.set(event, listeners);
  }

  off(event: string, listener: Listener): void {
    this.listeners.get(event)?.delete(listener);
  }

  emit(event: string, context: unknown): void {
    for (const listener of this.listeners.get(event) ?? []) {
      listener(context);
    }
  }
}

class FakeSubscription extends Emitter {
  state = 'unsubscribed';
  readyResult: Promise<void> = Promise.resolve();

  constructor(
    readonly channel: string,
    readonly options: Record<string, unknown> | undefined,
  ) {
    super();
  }

  subscribe(): void {
    this.move('subscribed');
  }

  unsubscribe(): void {
    this.move('unsubscribed');
  }

  ready(): Promise<void> {
    return this.readyResult;
  }

  publish(): Promise<unknown> {
    return Promise.resolve();
  }

  move(state: string): void {
    this.state = state;
    this.emit('state', { newState: state });
  }
}

const transports: FakeTransport[] = [];
let nextReady: Promise<void> = Promise.resolve();

class FakeTransport extends Emitter {
  readonly subscriptions: FakeSubscription[] = [];

  constructor() {
    super();
    transports.push(this);
  }

  connect(): void {
    this.emit('connected', { client: 'connected', latency: 1 });
  }

  disconnect(): void {
    this.emit('disconnected', { reason: 'manual' });
  }

  newSubscription(channel: string, options?: Record<string, unknown>): FakeSubscription {
    const subscription = new FakeSubscription(channel, options);
    subscription.readyResult = nextReady;
    this.subscriptions.push(subscription);
    return subscription;
  }

  getSubscription(): unknown {
    return undefined;
  }

  removeSubscription(): void {
    // Nothing is retained.
  }

  presence(): Promise<unknown> {
    return Promise.resolve({ clients: {} });
  }

  publication(data: unknown, channel = 'proj-1:durable:exec-1'): void {
    this.emit('publication', { channel, data });
  }
}

function latestTransport(): FakeTransport {
  const latest = transports.at(-1);
  if (latest === undefined) {
    throw new Error('transport was not constructed');
  }
  return latest;
}

function latestSubscription(): FakeSubscription {
  const latest = latestTransport().subscriptions.at(-1);
  if (latest === undefined) {
    throw new Error('subscription was not created');
  }
  return latest;
}

async function connectedRealtime(): Promise<VolcanoRealtime> {
  jest.spyOn(centrifuge, 'loadCentrifuge').mockResolvedValue(FakeTransport);
  const realtime = new VolcanoRealtime({
    apiUrl: 'https://api.test.com',
    anonKey: 'ak-durable',
    webSocket: WebSocket,
  });
  await realtime.connect();
  return realtime;
}

const settled = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

async function until(condition: () => boolean): Promise<void> {
  while (!condition()) {
    await settled();
  }
}

const listed = (data: DurableMessageList) => Promise.resolve({ data, status: 200 });

describe('durable.messages.subscribe', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    transports.length = 0;
    nextReady = Promise.resolve();
  });

  test('catches up on what was published before, then delivers live messages once each, in order', async () => {
    const realtime = await connectedRealtime();
    const list = jest
      .fn<TransportOperation>()
      .mockImplementationOnce(() => listed(page([message(1), message(2)], true)))
      .mockImplementationOnce(() => listed(page([message(3)])));
    const { volcano, transport } = clientWithTransport({
      listDurableMessagesFromApplication: list,
    });
    const received: number[] = [];

    const result = await volcano.durable.messages.subscribe(
      target,
      (delivered) => received.push(delivered.seq),
      { realtime },
    );

    expect(result).toEqual({
      data: { unsubscribe: expect.any(Function) },
      status: 200,
      error: null,
    });
    expect(received).toEqual([1, 2, 3]);
    expect(latestSubscription().channel).toBe('durable:exec-1');
    expect(latestSubscription().options).toEqual({
      joinLeave: false,
      data: { client_token: 'ct-1' },
    });
    expect(list.mock.calls.map((call) => call[2])).toEqual([
      { direction: 'out', after: 0 },
      { direction: 'out', after: 2 },
    ]);
    expect(list.mock.calls[0]?.[3]).toEqual(
      options(volcano, 'anon', { 'X-Volcano-Client-Token': 'ct-1' }),
    );

    const live = latestTransport();
    live.publication(message(3));
    live.publication(message(5));
    live.publication(message(4));
    live.publication(message(6, { direction: 'in' }));
    live.publication({ seq: 7 });
    live.publication(message(8), 'proj-1:durable:exec-2');
    live.publication(message(9));
    expect(received).toEqual([1, 2, 3, 5, 9]);
    expect(transport.listDurableMessagesFromApplication).toHaveBeenCalledTimes(2);

    await result.data?.unsubscribe();
    live.publication(message(10));
    expect(received).toEqual([1, 2, 3, 5, 9]);
    expect(realtime._channels.has('durable:exec-1')).toBe(false);
    realtime.disconnect();
  });

  test('holds live messages that arrive during the catch-up and delivers them after it', async () => {
    const realtime = await connectedRealtime();
    const first = deferred<{ data: unknown; status: number }>();
    const list = jest.fn<TransportOperation>().mockImplementationOnce(() => first.promise);
    const { volcano } = clientWithTransport({ listDurableMessagesFromApplication: list });
    const received: number[] = [];

    const pending = volcano.durable.messages.subscribe(
      { functionName: 'checkout', executionId: 'exec-1' },
      (delivered) => received.push(delivered.seq),
      { realtime },
    );
    await until(() => list.mock.calls.length > 0);
    latestTransport().publication(message(4));
    latestTransport().publication(message(2));
    latestTransport().publication(message(3));
    expect(received).toEqual([]);
    first.resolve({ data: page([message(1), message(2)]), status: 200 });
    await pending;

    expect(received).toEqual([1, 2, 3, 4]);
    expect(latestSubscription().options).toStrictEqual({ joinLeave: false });
    realtime.disconnect();
  });

  test('catches up again after resubscribing, holding live messages until it has', async () => {
    const realtime = await connectedRealtime();
    const reread = deferred<{ data: unknown; status: number }>();
    const list = jest
      .fn<TransportOperation>()
      .mockImplementationOnce(() => listed(page([message(1)])))
      .mockImplementationOnce(() => reread.promise);
    const { volcano } = clientWithTransport({ listDurableMessagesFromApplication: list });
    const received: number[] = [];
    await volcano.durable.messages.subscribe(target, (delivered) => received.push(delivered.seq), {
      realtime,
    });

    const subscription = latestSubscription();
    subscription.move('subscribing');
    latestTransport().publication(message(4));
    await settled();
    expect(received).toEqual([1]);
    expect(list).toHaveBeenCalledTimes(1);
    subscription.move('subscribed');
    latestTransport().publication(message(5));
    await until(() => list.mock.calls.length > 1);
    expect(list.mock.calls[1]?.[2]).toEqual({ direction: 'out', after: 1 });
    expect(received).toEqual([1]);
    reread.resolve({ data: page([message(2), message(3)]), status: 200 });
    await settled();

    expect(received).toEqual([1, 2, 3, 4, 5]);
    latestTransport().publication(message(6));
    expect(received).toEqual([1, 2, 3, 4, 5, 6]);
    expect(list).toHaveBeenCalledTimes(2);
    realtime.disconnect();
  });

  test('holds live messages that arrive before the channel is subscribed', async () => {
    const realtime = await connectedRealtime();
    const ready = signal();
    nextReady = ready.promise;
    const list = jest
      .fn<TransportOperation>()
      .mockImplementationOnce(() => listed(page([message(1), message(2)])));
    const { volcano } = clientWithTransport({ listDurableMessagesFromApplication: list });
    const received: number[] = [];

    const pending = volcano.durable.messages.subscribe(
      target,
      (delivered) => received.push(delivered.seq),
      { realtime },
    );
    await until(() => latestTransport().subscriptions.length > 0);
    latestTransport().publication(message(2));
    ready.resolve();
    await pending;

    expect(received).toEqual([1, 2]);
    realtime.disconnect();
  });

  test('releases held messages only once every pending catch-up has read', async () => {
    const realtime = await connectedRealtime();
    const first = deferred<{ data: unknown; status: number }>();
    const second = deferred<{ data: unknown; status: number }>();
    const list = jest
      .fn<TransportOperation>()
      .mockImplementationOnce(() => listed(page([message(1)])))
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise);
    const { volcano } = clientWithTransport({ listDurableMessagesFromApplication: list });
    const received: number[] = [];
    await volcano.durable.messages.subscribe(target, (delivered) => received.push(delivered.seq), {
      realtime,
    });

    const subscription = latestSubscription();
    subscription.move('subscribing');
    subscription.move('subscribed');
    subscription.move('subscribing');
    subscription.move('subscribed');
    latestTransport().publication(message(4));
    await until(() => list.mock.calls.length > 1);
    first.resolve({ data: page([message(2)]), status: 200 });
    await until(() => list.mock.calls.length > 2);

    expect(received).toEqual([1, 2]);
    expect(list.mock.calls[2]?.[2]).toEqual({ direction: 'out', after: 2 });
    second.resolve({ data: page([message(3)]), status: 200 });
    await settled();
    expect(received).toEqual([1, 2, 3, 4]);
    realtime.disconnect();
  });

  test('keeps delivering live messages when a later catch-up fails', async () => {
    const realtime = await connectedRealtime();
    const list = jest
      .fn<TransportOperation>()
      .mockImplementationOnce(() => listed(page([message(1)])))
      .mockImplementationOnce(() => Promise.reject(new Error('unavailable')));
    const { volcano } = clientWithTransport({ listDurableMessagesFromApplication: list });
    const received: number[] = [];
    await volcano.durable.messages.subscribe(target, (delivered) => received.push(delivered.seq), {
      realtime,
    });

    latestSubscription().move('subscribing');
    latestTransport().publication(message(3));
    latestSubscription().move('subscribed');
    await settled();
    latestTransport().publication(message(4));

    expect(received).toEqual([1, 3, 4]);
    realtime.disconnect();
  });

  test('survives a handler that throws during a later catch-up', async () => {
    const realtime = await connectedRealtime();
    const list = jest
      .fn<TransportOperation>()
      .mockImplementationOnce(() => listed(page([])))
      .mockImplementationOnce(() => listed(page([message(1)])));
    const { volcano } = clientWithTransport({ listDurableMessagesFromApplication: list });
    const received: number[] = [];
    await volcano.durable.messages.subscribe(
      target,
      (delivered) => {
        received.push(delivered.seq);
        if (delivered.seq === 1) {
          throw new Error('handler failed');
        }
      },
      { realtime },
    );

    latestSubscription().move('subscribing');
    latestSubscription().move('subscribed');
    await until(() => received.length > 0);
    await settled();
    latestTransport().publication(message(2));

    expect(received).toEqual([1, 2]);
    realtime.disconnect();
  });

  test('stops at an empty page even if it claims more', async () => {
    const realtime = await connectedRealtime();
    const list = jest.fn<TransportOperation>().mockImplementation(() => listed(page([], true)));
    const { volcano } = clientWithTransport({ listDurableMessagesFromApplication: list });

    const { error } = await volcano.durable.messages.subscribe(target, jest.fn(), {
      realtime,
    });

    expect(error).toBeNull();
    expect(list).toHaveBeenCalledTimes(1);
    realtime.disconnect();
  });

  test('delivers nothing a catch-up reads after unsubscribing', async () => {
    const realtime = await connectedRealtime();
    const reread = deferred<{ data: unknown; status: number }>();
    const list = jest
      .fn<TransportOperation>()
      .mockImplementationOnce(() => listed(page([])))
      .mockImplementationOnce(() => reread.promise);
    const { volcano } = clientWithTransport({ listDurableMessagesFromApplication: list });
    const received: number[] = [];
    const { data } = await volcano.durable.messages.subscribe(
      target,
      (delivered) => received.push(delivered.seq),
      { realtime },
    );

    latestSubscription().move('subscribing');
    latestTransport().publication(message(2));
    latestSubscription().move('subscribed');
    await data?.unsubscribe();
    reread.resolve({ data: page([message(1)]), status: 200 });
    await settled();

    expect(received).toEqual([]);
  });

  test('lists through the project when the target names one', async () => {
    const realtime = await connectedRealtime();
    const { volcano, transport } = clientWithTransport(
      { listDurableMessages: resolving(page([message(1)])) },
      { accessToken: 'owner-token' },
    );
    const received: number[] = [];

    await volcano.durable.messages.subscribe(
      { ...target, projectId: 'proj-1' },
      (delivered) => received.push(delivered.seq),
      { realtime },
    );

    expect(received).toEqual([1]);
    expect(transport.listDurableMessages.mock.calls[0]?.slice(0, 3)).toEqual([
      'proj-1',
      'checkout',
      'exec-1',
    ]);
    realtime.disconnect();
  });

  test('refuses a second subscription to the same execution until the first ends', async () => {
    const realtime = await connectedRealtime();
    const { volcano } = clientWithTransport();
    const first = await volcano.durable.messages.subscribe(target, jest.fn(), { realtime });

    await expect(
      volcano.durable.messages.subscribe(target, jest.fn(), { realtime }),
    ).resolves.toEqual(
      refused('This realtime client already subscribes to the execution; unsubscribe first'),
    );
    await first.data?.unsubscribe();
    await first.data?.unsubscribe();
    await expect(
      volcano.durable.messages.subscribe(target, jest.fn(), { realtime }),
    ).resolves.toMatchObject({ error: null });
    realtime.disconnect();
  });

  test('ends the subscription and reports the failure when the first catch-up fails', async () => {
    const realtime = await connectedRealtime();
    const { volcano } = clientWithTransport({
      listDurableMessagesFromApplication: jest
        .fn<TransportOperation>()
        .mockRejectedValue(Object.assign(new Error('forbidden'), { status: 403 })),
    });

    await expect(
      volcano.durable.messages.subscribe(target, jest.fn(), { realtime }),
    ).resolves.toEqual({ data: null, status: 403, error: new Error('forbidden') });
    expect(realtime._channels.has('durable:exec-1')).toBe(false);
    realtime.disconnect();
  });

  test.each<[string, unknown]>([
    ['an error', new Error('handler failed')],
    ['a value that is not an error', 'handler failed'],
  ])(
    'ends the subscription when the handler throws %s during the catch-up',
    async (_case, thrown) => {
      const realtime = await connectedRealtime();
      const { volcano } = clientWithTransport({
        listDurableMessagesFromApplication: resolving(page([message(1)])),
      });

      await expect(
        volcano.durable.messages.subscribe(
          target,
          () => {
            throw thrown;
          },
          { realtime },
        ),
      ).resolves.toEqual({ data: null, status: null, error: new Error('handler failed') });
      expect(realtime._channels.has('durable:exec-1')).toBe(false);
      realtime.disconnect();
    },
  );

  test.each([
    ['an error', new Error('Subscription refused'), new Error('Subscription refused')],
    ['a value that is not an error', 'permission denied', new Error('permission denied')],
  ])('ends the subscription when subscribing fails with %s', async (_case, failure, error) => {
    nextReady = rejectWithForeignValue(failure);
    const realtime = await connectedRealtime();
    const { volcano, transport } = clientWithTransport();

    await expect(
      volcano.durable.messages.subscribe(target, jest.fn(), { realtime }),
    ).resolves.toEqual({ data: null, status: null, error });
    expect(realtime._channels.has('durable:exec-1')).toBe(false);
    expect(transport.listDurableMessagesFromApplication).not.toHaveBeenCalled();
    realtime.disconnect();
  });

  test.each([
    [
      'an invalid target',
      [{ functionName: 'checkout' }, jest.fn(), {}],
      'executionId must be a non-empty string',
    ],
    ['no handler', [target, 'handler', {}], 'subscribe requires a handler function'],
    [
      'no options',
      [target, jest.fn()],
      'subscribe requires options.realtime, a connected VolcanoRealtime',
    ],
    [
      'a realtime without durable channels',
      [target, jest.fn(), { realtime: { _durableChannel: () => null } }],
      'subscribe requires options.realtime, a connected VolcanoRealtime',
    ],
    [
      'a realtime that cannot open durable channels',
      [target, jest.fn(), { realtime: { _removeDurableChannel: jest.fn() } }],
      'subscribe requires options.realtime, a connected VolcanoRealtime',
    ],
    [
      'a null realtime',
      [target, jest.fn(), { realtime: null }],
      'subscribe requires options.realtime, a connected VolcanoRealtime',
    ],
    [
      'a realtime that is not an object',
      [target, jest.fn(), { realtime: 'wss://realtime' }],
      'subscribe requires options.realtime, a connected VolcanoRealtime',
    ],
  ])('refuses %s', async (_case, args, error) => {
    const { volcano, transport } = clientWithTransport();
    const { messages } = volcano.durable;

    const result: unknown = Reflect.apply(messages.subscribe.bind(messages), undefined, args);

    await expect(result).resolves.toEqual(refused(error));
    expect(transport.listDurableMessagesFromApplication).not.toHaveBeenCalled();
  });
});
