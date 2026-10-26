/** @jest-environment ./__tests__/node-environment.cjs */
import { describe, expect, jest, test } from '@jest/globals';
import { VolcanoClient } from '../src/index.ts';
import {
  approval,
  type ApprovalsTransport,
  approvalsTransport,
  approved,
  page,
  resolving,
  stats,
  type TransportOperation,
} from './support/durable-approval-api-fixtures.ts';
import { rejectWithForeignValue } from './support/non-error-rejection.ts';

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

function failsWithoutAStatus(): void {
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
}

function rejectsMalformedApprovals(): void {
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
    expect(error).toEqual(new TypeError('Invalid durable response: Failed to read durable approval'));
  });
}

function rejectsMalformedStatsAndPages(): void {
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
    expect(error).toEqual(new TypeError('Invalid durable response: Failed to list durable approvals'));
  });
}

describe('durable.approvals', () => {
  failsWithoutAStatus();
  rejectsMalformedApprovals();
  rejectsMalformedStatsAndPages();
});
