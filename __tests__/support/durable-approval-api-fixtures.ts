import { jest } from '@jest/globals';

export const approval = {
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

export const approved = {
  ...approval,
  status: 'approved',
  decision: {
    comment: 'Address checked',
    decided_by: { id: 'user-1', email: 'owner@example.com' },
    decided_at: '2026-10-06T12:05:00Z',
  },
};

export const page = { data: [approval], page: 1, limit: 20, total: 1, has_more: false };

const counts = { requested: 2, pending: 1, approved: 1, denied: 0, expired: 0, cancelled: 0 };
export const stats = {
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

export type TransportOperation = (...args: unknown[]) => Promise<{ data: unknown; status: number }>;
type TransportMock = jest.Mock<TransportOperation>;

export interface ApprovalsTransport {
  listDurableApprovals: TransportMock;
  getDurableApprovalStats: TransportMock;
  getDurableApproval: TransportMock;
  approveDurableApproval: TransportMock;
  denyDurableApproval: TransportMock;
}

export const resolving = (data: unknown): TransportMock =>
  jest.fn<TransportOperation>().mockResolvedValue({ data, status: 200 });

export function approvalsTransport(overrides: Partial<ApprovalsTransport> = {}): ApprovalsTransport {
  return {
    listDurableApprovals: resolving(page),
    getDurableApprovalStats: resolving(stats),
    getDurableApproval: resolving(approval),
    approveDurableApproval: resolving(approved),
    denyDurableApproval: resolving({ ...approved, status: 'denied' }),
    ...overrides,
  };
}
