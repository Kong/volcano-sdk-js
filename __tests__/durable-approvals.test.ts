/** @jest-environment ./__tests__/node-environment.cjs */
import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import { VolcanoClient } from '../src/index.ts';
import { rejectWithForeignValue } from './support/non-error-rejection.ts';

const approval = {
  id: 'apr-1',
  status: 'pending',
  name: 'ship-order',
  title: 'Ship order 42?',
  description: '',
  details: { order_id: 42 },
  function: { id: 'fn-1', name: 'order-pipeline' },
  execution: { id: 'exec-1', name: 'order-42', status: 'running' },
  requested_at: '2026-10-06T12:00:00Z',
  expires_at: null,
  decision: null,
};

const approved = {
  ...approval,
  status: 'approved',
  decision: {
    comment: 'Address checked',
    decided_by: { id: 'user-1', email: 'owner@example.com' },
    decided_at: '2026-10-06T12:05:00Z',
  },
};

const page = { data: [approval], page: 1, limit: 20, total: 1, has_more: false };

const counts = { requested: 2, pending: 1, approved: 1, denied: 0, expired: 0, cancelled: 0 };
const stats = {
  from: '2026-09-06T00:00:00Z',
  to: '2026-10-06T00:00:00Z',
  counts,
  approval_rate: 1,
  median_seconds_to_decision: 300,
  p90_seconds_to_decision: 300,
  functions: [{ function: { id: 'fn-1', name: 'order-pipeline' }, counts }],
  other_functions: { ...counts, requested: 0, pending: 0, approved: 0 },
  daily: [{ date: '2026-10-06', counts }],
};

type TransportOperation = (...args: unknown[]) => Promise<{ data: unknown; status: number }>;
type TransportMock = jest.Mock<TransportOperation>;

interface ApprovalsTransport {
  listDurableApprovals: TransportMock;
  getDurableApprovalStats: TransportMock;
  getDurableApproval: TransportMock;
  approveDurableApproval: TransportMock;
  denyDurableApproval: TransportMock;
}

const resolving = (data: unknown): TransportMock =>
  jest.fn<TransportOperation>().mockResolvedValue({ data, status: 200 });

function approvalsTransport(overrides: Partial<ApprovalsTransport> = {}): ApprovalsTransport {
  return {
    listDurableApprovals: resolving(page),
    getDurableApprovalStats: resolving(stats),
    getDurableApproval: resolving(approval),
    approveDurableApproval: resolving(approved),
    denyDurableApproval: resolving({ ...approved, status: 'denied' }),
    ...overrides,
  };
}

function clientWithTransport(overrides: Partial<ApprovalsTransport> = {}) {
  const transport = approvalsTransport(overrides);
  const options = {
    apiUrl: 'https://api.test.com',
    anonKey: 'ak-durable',
    accessToken: 'owner-token',
    transportFactory: () => transport,
  };
  return { volcano: new VolcanoClient(options), transport };
}

const session = (volcano: VolcanoClient) =>
  expect.objectContaining({ volcanoAuthorization: 'session', volcanoClient: volcano });

describe('durable.approvals', () => {
  test('lists approvals, forwarding only the filters the caller set', async () => {
    const { volcano, transport } = clientWithTransport();

    await expect(volcano.durable.approvals.list('proj-1')).resolves.toEqual({
      data: page,
      status: 200,
      error: null,
    });
    expect(transport.listDurableApprovals).toHaveBeenCalledWith('proj-1', {}, session(volcano));
    // Strict, because a key carrying undefined is a query parameter the caller
    // never asked for.
    expect(transport.listDurableApprovals.mock.calls[0]?.[1]).toStrictEqual({});

    await volcano.durable.approvals.list('proj-1', {
      status: 'pending',
      function: 'order-pipeline',
      executionId: 'exec-1',
      from: '2026-10-01T00:00:00Z',
      to: '2026-10-06T00:00:00Z',
      page: 2,
      limit: 50,
    });
    expect(transport.listDurableApprovals.mock.calls[1]?.[1]).toStrictEqual({
      status: 'pending',
      function: 'order-pipeline',
      execution_id: 'exec-1',
      from: '2026-10-01T00:00:00Z',
      to: '2026-10-06T00:00:00Z',
      page: 2,
      limit: 50,
    });
  });

  test('reads one approval', async () => {
    const { volcano, transport } = clientWithTransport();

    await expect(volcano.durable.approvals.get('proj-1', 'apr-1')).resolves.toEqual({
      data: approval,
      status: 200,
      error: null,
    });
    expect(transport.getDurableApproval).toHaveBeenCalledWith('proj-1', 'apr-1', session(volcano));
  });

  test('reads stats over the window the caller set', async () => {
    const { volcano, transport } = clientWithTransport();

    await expect(volcano.durable.approvals.stats('proj-1')).resolves.toEqual({
      data: stats,
      status: 200,
      error: null,
    });
    expect(transport.getDurableApprovalStats.mock.calls[0]?.[1]).toStrictEqual({});

    // status is a list filter, not a stats one, so it stays out of the query.
    const options: Record<string, string> = {
      function: 'fn-1',
      from: '2026-09-01T00:00:00Z',
      to: '2026-10-01T00:00:00Z',
      status: 'pending',
    };
    await volcano.durable.approvals.stats('proj-1', options);
    expect(transport.getDurableApprovalStats).toHaveBeenLastCalledWith(
      'proj-1',
      { function: 'fn-1', from: '2026-09-01T00:00:00Z', to: '2026-10-01T00:00:00Z' },
      session(volcano),
    );
  });

  test('approves and denies with the comment, or an empty body without one', async () => {
    const { volcano, transport } = clientWithTransport();

    await expect(
      volcano.durable.approvals.approve('proj-1', 'apr-1', { comment: 'Address checked' }),
    ).resolves.toEqual({ data: approved, status: 200, error: null });
    expect(transport.approveDurableApproval).toHaveBeenCalledWith(
      'proj-1',
      'apr-1',
      { comment: 'Address checked' },
      session(volcano),
    );

    const denied = await volcano.durable.approvals.deny('proj-1', 'apr-1');
    expect(denied).toMatchObject({ data: { status: 'denied' }, status: 200, error: null });
    expect(transport.denyDurableApproval.mock.calls[0]?.[2]).toStrictEqual({});
    expect(transport.approveDurableApproval).toHaveBeenCalledTimes(1);

    await volcano.durable.approvals.approve('proj-1', 'apr-1');
    expect(transport.approveDurableApproval.mock.calls[1]?.[2]).toStrictEqual({});
    await volcano.durable.approvals.deny('proj-1', 'apr-1', { comment: '' });
    expect(transport.denyDurableApproval.mock.calls[1]?.[2]).toStrictEqual({ comment: '' });
    expect(transport.denyDurableApproval).toHaveBeenCalledTimes(2);
  });

  test('refuses a comment the platform would reject, before sending it', async () => {
    const { volcano, transport } = clientWithTransport();

    await expect(
      volcano.durable.approvals.approve('proj-1', 'apr-1', { comment: 'x'.repeat(2001) }),
    ).resolves.toEqual({
      data: null,
      status: null,
      error: new Error('comment must be at most 2000 characters'),
    });
    const notText: unknown = { comment: 42 };
    const { approvals } = volcano.durable;
    const result: unknown = Reflect.apply(approvals.deny.bind(approvals), undefined, [
      'proj-1',
      'apr-1',
      notText,
    ]);
    await expect(result).resolves.toEqual({
      data: null,
      status: null,
      error: new Error('comment must be a string when provided'),
    });
    await volcano.durable.approvals.approve('proj-1', 'apr-1', { comment: 'x'.repeat(2000) });

    expect(transport.approveDurableApproval).toHaveBeenCalledTimes(1);
    expect(transport.denyDurableApproval).not.toHaveBeenCalled();
  });

  // Volcano counts code points; each of these emoji is two UTF-16 units.
  test('counts a comment in characters rather than UTF-16 units', async () => {
    const { volcano, transport } = clientWithTransport();

    await volcano.durable.approvals.approve('proj-1', 'apr-1', { comment: '👍'.repeat(2000) });
    expect(transport.approveDurableApproval).toHaveBeenCalledTimes(1);
    await expect(
      volcano.durable.approvals.deny('proj-1', 'apr-1', { comment: '👎'.repeat(2001) }),
    ).resolves.toMatchObject({ error: new Error('comment must be at most 2000 characters') });
    expect(transport.denyDurableApproval).not.toHaveBeenCalled();
  });

  test('refuses an empty identifier before reaching the platform', async () => {
    const { volcano, transport } = clientWithTransport();
    const { approvals } = volcano.durable;

    const cases: [(...args: never[]) => unknown, unknown[], string][] = [
      [approvals.list.bind(approvals), [''], 'projectId'],
      [approvals.stats.bind(approvals), ['  '], 'projectId'],
      [approvals.get.bind(approvals), [undefined, 'apr-1'], 'projectId'],
      [approvals.get.bind(approvals), ['proj-1', ''], 'approvalId'],
      [approvals.approve.bind(approvals), ['proj-1', 42], 'approvalId'],
      [approvals.deny.bind(approvals), ['proj-1', ' '], 'approvalId'],
    ];
    for (const [operation, args, field] of cases) {
      const result: unknown = Reflect.apply(operation, undefined, args);
      await expect(result).resolves.toEqual({
        data: null,
        status: null,
        error: new Error(`${field} must be a non-empty string`),
      });
    }
    for (const mock of Object.values(transport)) {
      expect(mock).not.toHaveBeenCalled();
    }
  });

  test('escapes every segment it puts in the path', async () => {
    const { volcano, transport } = clientWithTransport();
    const { approvals } = volcano.durable;

    await approvals.get('proj?1', 'apr#1');
    await approvals.approve('proj?1', 'apr#1');
    await approvals.deny('proj?1', 'apr#1');
    await approvals.list('proj?1');
    await approvals.stats('proj?1');
    for (const mock of [
      transport.getDurableApproval,
      transport.approveDurableApproval,
      transport.denyDurableApproval,
    ]) {
      expect(mock.mock.calls[0]?.slice(0, 2)).toEqual(['proj%3F1', 'apr%231']);
    }
    expect(transport.listDurableApprovals.mock.calls[0]?.[0]).toBe('proj%3F1');
    expect(transport.getDurableApprovalStats.mock.calls[0]?.[0]).toBe('proj%3F1');
  });

  // Like durable.get: these routes carry the project's own token, so without
  // a session there is nothing to send.
  test('refuses every call with no session', async () => {
    const transport = approvalsTransport();
    const options = {
      apiUrl: 'https://api.test.com',
      anonKey: 'ak-durable',
      transportFactory: () => transport,
    };
    const volcano = new VolcanoClient(options);
    const { approvals } = volcano.durable;

    for (const call of [
      () => approvals.list('proj-1'),
      () => approvals.stats('proj-1'),
      () => approvals.get('proj-1', 'apr-1'),
      () => approvals.approve('proj-1', 'apr-1'),
      () => approvals.deny('proj-1', 'apr-1'),
    ]) {
      await expect(call()).resolves.toEqual({
        data: null,
        status: null,
        error: new Error('No active session'),
      });
    }
    for (const mock of Object.values(transport)) {
      expect(mock).not.toHaveBeenCalled();
    }
  });

  test('rejects malformed successful payloads', async () => {
    const { volcano } = clientWithTransport({
      listDurableApprovals: resolving({ ...page, data: [{ ...approval, status: 'open' }] }),
      getDurableApprovalStats: resolving({ ...stats, daily: {} }),
      getDurableApproval: resolving({ ...approval, decision: 'approved' }),
      approveDurableApproval: resolving({ ...approved, function: null }),
      denyDurableApproval: resolving([approved]),
    });
    const { approvals } = volcano.durable;

    const results = await Promise.all([
      approvals.list('proj-1'),
      approvals.stats('proj-1'),
      approvals.get('proj-1', 'apr-1'),
      approvals.approve('proj-1', 'apr-1'),
      approvals.deny('proj-1', 'apr-1'),
    ]);
    expect(results.map(({ error }) => error?.message)).toEqual([
      'Invalid durable response: Failed to list durable approvals',
      'Invalid durable response: Failed to read durable approval stats',
      'Invalid durable response: Failed to read durable approval',
      'Invalid durable response: Failed to approve durable approval',
      'Invalid durable response: Failed to deny durable approval',
    ]);
    for (const result of results) {
      expect(result).toMatchObject({ data: null, status: null, error: expect.any(TypeError) });
    }
  });

  test.each([
    ['an id', { id: 1 }],
    ['a name', { name: null }],
    ['a title', { title: undefined }],
    ['a request time', { requested_at: 0 }],
    ['an execution', { execution: 'exec-1' }],
    ['a known status', { status: 'open' }],
  ])('rejects an approval without %s', async (_field, change) => {
    const { volcano } = clientWithTransport({
      getDurableApproval: resolving({ ...approval, ...change }),
    });

    const { error } = await volcano.durable.approvals.get('proj-1', 'apr-1');
    expect(error).toEqual(
      new TypeError('Invalid durable response: Failed to read durable approval'),
    );
  });

  test.each([
    ['a start', { from: null }],
    ['an end', { to: 1 }],
    ['counts', { counts: [] }],
    ['per-function counts', { functions: {} }],
  ])('rejects stats without %s', async (_field, change) => {
    const { volcano } = clientWithTransport({
      getDurableApprovalStats: resolving({ ...stats, ...change }),
    });

    const { error } = await volcano.durable.approvals.stats('proj-1');
    expect(error?.message).toBe('Invalid durable response: Failed to read durable approval stats');
  });

  test('accepts every approval status and a page of decided approvals', async () => {
    const statuses = ['pending', 'approved', 'denied', 'expired', 'cancelled'];
    const { volcano } = clientWithTransport({
      listDurableApprovals: resolving({
        ...page,
        data: statuses.map((status) => ({ ...approved, status })),
      }),
    });

    const { data, error } = await volcano.durable.approvals.list('proj-1');
    expect(error).toBeNull();
    expect(data?.data.map((entry) => entry.status)).toEqual(statuses);
  });

  test.each([
    ['malformed metadata', { ...page, has_more: 'no' }],
    ['no body', null],
    ['entries that are not a list', { ...page, data: {} }],
    ['one malformed entry among good ones', { ...page, data: [approval, { ...approval, id: 7 }] }],
  ])('rejects a page with %s', async (_case, body) => {
    const { volcano } = clientWithTransport({ listDurableApprovals: resolving(body) });

    const { error } = await volcano.durable.approvals.list('proj-1');
    expect(error).toEqual(
      new TypeError('Invalid durable response: Failed to list durable approvals'),
    );
  });

  test('reports a transport failure that carries no status', async () => {
    const { volcano } = clientWithTransport({
      denyDurableApproval: jest
        .fn<TransportOperation>()
        .mockImplementation(() => rejectWithForeignValue('socket hang up')),
    });

    await expect(volcano.durable.approvals.deny('proj-1', 'apr-1')).resolves.toMatchObject({
      data: null,
      status: null,
      error: { message: 'Failed to deny durable approval', cause: 'socket hang up' },
    });
  });
});

// The transport tests above settle the credential and the validation; the
// route, the method, the query, and how a refusal reads are the real
// transport's work.
function realClient() {
  return new VolcanoClient({
    apiUrl: 'https://api.test.com',
    anonKey: 'ak-durable',
    accessToken: 'owner-token',
  });
}

function lastRequest() {
  const [url, init] = jest.mocked(globalThis.fetch).mock.calls.at(-1) ?? [];
  return { url, method: init?.method, headers: new Headers(init?.headers), body: init?.body };
}

describe('durable.approvals over the wire', () => {
  beforeEach(() => {
    jest.mocked(globalThis.fetch).mockReset();
  });

  test('lists approvals from the project collection with its filters', async () => {
    jest.mocked(globalThis.fetch).mockResolvedValue(Response.json(page));

    const { data, error } = await realClient().durable.approvals.list('proj-1', {
      status: 'pending',
      executionId: 'exec-1',
      limit: 5,
    });

    expect(error).toBeNull();
    expect(data).toEqual(page);
    expect(lastRequest()).toMatchObject({
      url: 'https://api.test.com/projects/proj-1/durable-approvals?status=pending&execution_id=exec-1&limit=5',
      method: 'GET',
    });
    expect(lastRequest().headers.get('authorization')).toBe('Bearer owner-token');
  });

  test('reads stats and one approval', async () => {
    jest.mocked(globalThis.fetch).mockResolvedValueOnce(Response.json(stats));
    await realClient().durable.approvals.stats('proj-1', { function: 'order-pipeline' });
    expect(lastRequest()).toMatchObject({
      url: 'https://api.test.com/projects/proj-1/durable-approvals/stats?function=order-pipeline',
      method: 'GET',
    });

    jest.mocked(globalThis.fetch).mockResolvedValueOnce(Response.json(approval));
    await realClient().durable.approvals.get('proj-1', 'apr-1');
    expect(lastRequest()).toMatchObject({
      url: 'https://api.test.com/projects/proj-1/durable-approvals/apr-1',
      method: 'GET',
    });
    expect(lastRequest().headers.get('authorization')).toBe('Bearer owner-token');
  });

  test('posts a decision with its comment as JSON', async () => {
    jest.mocked(globalThis.fetch).mockResolvedValueOnce(Response.json(approved));
    const { data, status } = await realClient().durable.approvals.approve('proj-1', 'apr-1', {
      comment: 'Address checked',
    });
    expect(status).toBe(200);
    expect(data).toEqual(approved);
    expect(lastRequest()).toMatchObject({
      url: 'https://api.test.com/projects/proj-1/durable-approvals/apr-1/approve',
      method: 'POST',
      body: JSON.stringify({ comment: 'Address checked' }),
    });
    expect(lastRequest().headers.get('content-type')).toBe('application/json');
    expect(lastRequest().headers.get('authorization')).toBe('Bearer owner-token');

    jest
      .mocked(globalThis.fetch)
      .mockResolvedValueOnce(Response.json({ ...approved, status: 'denied' }));
    await realClient().durable.approvals.deny('proj-1', 'apr-1');
    expect(lastRequest()).toMatchObject({
      url: 'https://api.test.com/projects/proj-1/durable-approvals/apr-1/deny',
      method: 'POST',
      body: '{}',
    });
  });

  // A refusal is a result, not an exception, and keeps the platform's code so
  // a caller can tell a decision that lost a race from one it may not make.
  test.each([
    [
      403,
      undefined,
      'project access tokens cannot decide durable approvals; a person decides in the dashboard or with a platform token',
    ],
    [404, undefined, 'durable approval not found'],
    [409, 'approval_decided', 'approval was already denied'],
    [409, 'approval_expired', 'approval expired'],
  ])('surfaces a %d refusal with its status and code', async (status, code, message) => {
    jest
      .mocked(globalThis.fetch)
      .mockResolvedValueOnce(Response.json({ error: message, code }, { status }));

    const result = await realClient().durable.approvals.approve('proj-1', 'apr-1');

    expect(result.data).toBeNull();
    expect(result.status).toBe(status);
    expect(result.error).toBeInstanceOf(Error);
    expect(result.error).toMatchObject({
      status,
      message,
      ...(code === undefined ? {} : { code }),
    });
  });
});
