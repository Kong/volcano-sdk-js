/** @jest-environment ./__tests__/node-environment.cjs */
import { describe, expect, test } from '@jest/globals';
import { VolcanoClient } from '../src/index.ts';
import {
  approval,
  type ApprovalsTransport,
  approvalsTransport,
  approved,
  page,
  stats,
} from './support/durable-approval-api-fixtures.ts';

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

function readsApprovals(): void {
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
}

function readsStats(): void {
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
}

function decides(): void {
  test('approves and denies with the comment, or an empty body without one', async () => {
    const { volcano, transport } = clientWithTransport();

    await expect(volcano.durable.approvals.approve('proj-1', 'apr-1', { comment: 'Address checked' })).resolves.toEqual(
      { data: approved, status: 200, error: null },
    );
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
}

function checksTheComment(): void {
  test('refuses a comment the platform would reject, before sending it', async () => {
    const { volcano, transport } = clientWithTransport();

    await expect(volcano.durable.approvals.approve('proj-1', 'apr-1', { comment: 'x'.repeat(2001) })).resolves.toEqual({
      data: null,
      status: null,
      error: new Error('comment must be at most 2000 characters'),
    });
    const notText: unknown = { comment: 42 };
    const { approvals } = volcano.durable;
    const result: unknown = Reflect.apply(approvals.deny.bind(approvals), undefined, ['proj-1', 'apr-1', notText]);
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
}

function checksIdentifiers(): void {
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
    await Promise.all(
      cases.map(([operation, args, field]) => {
        const result: unknown = Reflect.apply(operation, undefined, args);
        return expect(result).resolves.toEqual({
          data: null,
          status: null,
          error: new Error(`${field} must be a non-empty string`),
        });
      }),
    );
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
}

describe('durable.approvals', () => {
  readsApprovals();
  readsStats();
  decides();
  checksTheComment();
  checksIdentifiers();
});
