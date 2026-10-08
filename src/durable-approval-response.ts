import { isPageMetadata } from './durable-response.ts';
import type {
  DurableApproval,
  DurableApprovalStats,
  PaginatedDurableApprovals,
} from './sdk-public-types.ts';

const APPROVAL_STATUSES = new Set<unknown>([
  'pending',
  'approved',
  'denied',
  'expired',
  'cancelled',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isRequest(value: Record<string, unknown>): boolean {
  return (
    typeof value['id'] === 'string' &&
    typeof value['name'] === 'string' &&
    typeof value['title'] === 'string' &&
    typeof value['requested_at'] === 'string'
  );
}

function isState(value: Record<string, unknown>): boolean {
  return (
    APPROVAL_STATUSES.has(value['status']) &&
    isRecord(value['function']) &&
    isRecord(value['execution']) &&
    (value['decision'] === null || isRecord(value['decision']))
  );
}

export function isDurableApproval(value: unknown): value is DurableApproval {
  return isRecord(value) && isRequest(value) && isState(value);
}

export function isDurableApprovalPage(value: unknown): value is PaginatedDurableApprovals {
  return (
    isRecord(value) &&
    Array.isArray(value['data']) &&
    value['data'].every(isDurableApproval) &&
    isPageMetadata(value)
  );
}

function isBreakdown(value: Record<string, unknown>): boolean {
  return (
    isRecord(value['counts']) && Array.isArray(value['functions']) && Array.isArray(value['daily'])
  );
}

export function isDurableApprovalStats(value: unknown): value is DurableApprovalStats {
  return (
    isRecord(value) &&
    typeof value['from'] === 'string' &&
    typeof value['to'] === 'string' &&
    isBreakdown(value)
  );
}
