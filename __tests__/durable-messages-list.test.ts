/** @jest-environment ./__tests__/node-environment.cjs */
import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import { VolcanoClient } from '../src/index.ts';
import {
  message,
  mockClientFactory,
  options,
  page,
  refused,
  resolving,
  sent,
  target,
} from './support/durable-messages-fixtures.ts';

const clientWithTransport = mockClientFactory(VolcanoClient);

const fetchMock = () => jest.mocked(globalThis.fetch);

function lastRequest() {
  const [url, init] = fetchMock().mock.calls.at(-1) ?? [];
  return { url, method: init?.method, headers: new Headers(init?.headers), body: init?.body };
}

function forwardsOnlyTheFiltersSet(): void {
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
}

function validatesListTargetsAndFilters(): void {
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

    await expect(volcano.durable.messages.list({ functionName: '', executionId: 'exec-1' })).resolves.toEqual(
      refused('functionName must be a non-empty string'),
    );
    expect(transport.listDurableMessagesFromApplication).not.toHaveBeenCalled();
  });

  test.each<[string, Record<string, unknown>, string]>([
    ['an unknown direction', { direction: 'both' }, "direction must be 'in' or 'out'"],
    ['a name with a tab', { name: 'pro\tgress' }, 'name must be at most 237 printable ASCII characters'],
    ['a negative after', { after: -1 }, 'after must be a non-negative integer'],
    ['a fractional after', { after: 1.5 }, 'after must be a non-negative integer'],
    ['an after that is text', { after: '3' }, 'after must be a non-negative integer'],
    ['a zero limit', { limit: 0 }, 'limit must be an integer between 1 and 500'],
    ['a limit over a page', { limit: 501 }, 'limit must be an integer between 1 and 500'],
    ['a fractional limit', { limit: 1.5 }, 'limit must be an integer between 1 and 500'],
    ['a limit that is text', { limit: '50' }, 'limit must be an integer between 1 and 500'],
  ])('refuses %s before reaching the platform', async (_case, filters, error) => {
    const { volcano, transport } = clientWithTransport();

    await expect(volcano.durable.messages.list(target, filters)).resolves.toEqual(refused(error));
    expect(transport.listDurableMessagesFromApplication).not.toHaveBeenCalled();
  });
}

function pagesAndReadsEveryStatus(): void {
  test.each([
    [0, 1],
    [7, 500],
  ])('pages from after %p with a limit of %p', async (after, limit) => {
    const { volcano, transport } = clientWithTransport();

    await volcano.durable.messages.list(target, { after, limit });

    expect(transport.listDurableMessagesFromApplication.mock.calls[0]?.[2]).toStrictEqual({
      after,
      limit,
    });
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
}

function refusesMalformedPages(): void {
  test.each([
    ['no body', null],
    ['entries that are not a list', { data: {}, has_more: false }],
    ['no has_more', { data: [] }],
    ['a has_more that is text', { data: [], has_more: 'no' }],
    ['an entry that is not an object', { data: ['msg-1'], has_more: false }],
    ['an entry with a list for a sender', { data: [{ ...message(1), sender: [] }], has_more: false }],
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
}

function sendsAndListsOverTheWire(): void {
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

    await volcano.durable.messages.list({ ...target, projectId: 'proj-1' }, { direction: 'out', after: 3, limit: 5 });

    expect(lastRequest()).toMatchObject({
      url: 'https://api.test.com/projects/proj-1/durable-functions/checkout/executions/exec-1/messages?direction=out&after=3&limit=5',
      method: 'GET',
    });
    expect(lastRequest().headers.get('authorization')).toBe('Bearer owner-token');
    expect(lastRequest().headers.has('x-volcano-client-token')).toBe(false);
  });
}

function surfacesRefusalsOverTheWire(): void {
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
}

describe('durable.messages.list', () => {
  forwardsOnlyTheFiltersSet();
  validatesListTargetsAndFilters();
  pagesAndReadsEveryStatus();
  refusesMalformedPages();
});

// The transport tests above settle the credential and the validation; the
// route, the method, the headers, and how a refusal reads are the real
// transport's work.
describe('durable.messages over the wire', () => {
  beforeEach(() => {
    fetchMock().mockReset();
  });

  sendsAndListsOverTheWire();
  surfacesRefusalsOverTheWire();
});
