import { isRecord } from './durable-callback.ts';
import type { DurableMessage, DurableMessageList } from './sdk-public-types.ts';

const DIRECTIONS = new Set<unknown>(['in', 'out']);

const STATUSES = new Set<unknown>(['queued', 'delivering', 'delivered', 'dropped', 'published']);

function isSender(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value['type'] === 'string' &&
    (value['user_id'] === null || typeof value['user_id'] === 'string')
  );
}

function isEnvelope(value: Record<string, unknown>): boolean {
  return (
    typeof value['id'] === 'string' &&
    typeof value['execution_id'] === 'string' &&
    DIRECTIONS.has(value['direction']) &&
    typeof value['seq'] === 'number' &&
    typeof value['name'] === 'string'
  );
}

function isDelivery(value: Record<string, unknown>): boolean {
  return (
    isSender(value['sender']) &&
    STATUSES.has(value['status']) &&
    (value['delivered_at'] === null || typeof value['delivered_at'] === 'string') &&
    typeof value['sent_at'] === 'string'
  );
}

export function isDurableMessage(value: unknown): value is DurableMessage {
  return isRecord(value) && isEnvelope(value) && isDelivery(value);
}

export function isDurableMessageList(value: unknown): value is DurableMessageList {
  return (
    isRecord(value) &&
    Array.isArray(value['data']) &&
    value['data'].every(isDurableMessage) &&
    typeof value['has_more'] === 'boolean'
  );
}
