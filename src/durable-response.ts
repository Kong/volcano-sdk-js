import type { DurableExecution, PaginatedDurableExecutions } from './sdk-public-types.ts';

const DURABLE_STATUSES = new Set<unknown>([
  'pending',
  'running',
  'succeeded',
  'failed',
  'timed_out',
  'stopped',
  'unknown',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function optionalString(value: unknown): boolean {
  return value === undefined || typeof value === 'string';
}

function optionalBoolean(value: unknown): boolean {
  return value === undefined || typeof value === 'boolean';
}

function isExecutionIdentity(value: Record<string, unknown>): boolean {
  return (
    typeof value['id'] === 'string' &&
    typeof value['function_id'] === 'string' &&
    typeof value['name'] === 'string' &&
    DURABLE_STATUSES.has(value['status'])
  );
}

function isExecutionState(value: Record<string, unknown>): boolean {
  return (
    typeof value['region'] === 'string' &&
    typeof value['created_at'] === 'string' &&
    optionalString(value['completed_at']) &&
    optionalBoolean(value['result_expired'])
  );
}

function isExecutionError(value: unknown): boolean {
  return (
    isRecord(value) &&
    optionalString(value['type']) &&
    optionalString(value['message'])
  );
}

export function isDurableExecution(value: unknown): value is DurableExecution {
  return (
    isRecord(value) &&
    isExecutionIdentity(value) &&
    isExecutionState(value) &&
    (value['error'] === undefined || isExecutionError(value['error']))
  );
}

function isPageMetadata(value: Record<string, unknown>): boolean {
  return (
    typeof value['page'] === 'number' &&
    typeof value['limit'] === 'number' &&
    typeof value['total'] === 'number' &&
    typeof value['has_more'] === 'boolean'
  );
}

export function isDurablePage(value: unknown): value is PaginatedDurableExecutions {
  return (
    isRecord(value) &&
    Array.isArray(value['data']) &&
    value['data'].every(isDurableExecution) &&
    isPageMetadata(value)
  );
}
