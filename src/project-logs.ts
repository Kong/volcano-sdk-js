import type {
  JsonValue,
  LogActivityBucket,
  LogActivityResponse,
  LogDeployment,
  LogResource,
  LogSearchEvent,
  LogSearchResponse,
  LogsResponse,
} from './sdk-public-types.ts';

const LOG_LEVELS = new Set<unknown>(['trace', 'debug', 'info', 'warn', 'error', 'fatal']);
const LOG_RESOURCE_TYPES = new Set<unknown>(['function', 'frontend', 'database']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function optionalString(value: unknown): boolean {
  return value === undefined || typeof value === 'string';
}

function isJsonScalar(value: unknown): boolean {
  return (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  );
}

function isJsonValue(value: unknown): value is JsonValue {
  if (isJsonScalar(value)) {
    return true;
  }
  if (Array.isArray(value)) {
    return value.every(isJsonValue);
  }
  return isRecord(value) && Object.values(value).every(isJsonValue);
}

function isLogResource(value: unknown): value is LogResource {
  if (!isRecord(value)) {
    return false;
  }
  return (
    LOG_RESOURCE_TYPES.has(value['type']) &&
    typeof value['id'] === 'string' &&
    optionalString(value['name'])
  );
}

function isLogDeployment(value: unknown): value is LogDeployment {
  return (
    isRecord(value) &&
    typeof value['id'] === 'string' &&
    optionalString(value['stage'])
  );
}

function isLogLevel(value: unknown): boolean {
  return LOG_LEVELS.has(value);
}

function isEventCore(value: Record<string, unknown>): boolean {
  return (
    typeof value['id'] === 'string' &&
    typeof value['timestamp'] === 'string' &&
    isJsonValue(value['body']) &&
    isLogResource(value['resource'])
  );
}

function isEventDetails(value: Record<string, unknown>): boolean {
  return (
    validOptionalLevel(value['level']) &&
    optionalString(value['region']) &&
    validOptionalDeployment(value['deployment']) &&
    optionalString(value['invocation_id'])
  );
}

function validOptionalLevel(value: unknown): boolean {
  return value === undefined || isLogLevel(value);
}

function validOptionalDeployment(value: unknown): boolean {
  return value === undefined || isLogDeployment(value);
}

function isLogSearchEvent(value: unknown): value is LogSearchEvent {
  return isRecord(value) && isEventCore(value) && isEventDetails(value);
}

function isLogSearchResponse(value: unknown): value is LogSearchResponse {
  return (
    isRecord(value) &&
    Array.isArray(value['data']) &&
    value['data'].every(isLogSearchEvent) &&
    isSearchPage(value)
  );
}

function isSearchPage(value: Record<string, unknown>): boolean {
  return (
    typeof value['limit'] === 'number' &&
    typeof value['has_more'] === 'boolean' &&
    optionalString(value['next_cursor'])
  );
}

function isCountRecord(value: unknown): value is Record<string, number> {
  return isRecord(value) && Object.values(value).every((count) => typeof count === 'number');
}

function isActivityCounts(value: unknown): value is LogActivityBucket['counts'] {
  return (
    isRecord(value) &&
    isCountRecord(value['levels']) &&
    isCountRecord(value['regions']) &&
    isCountRecord(value['resource_ids'])
  );
}

function isActivityBucket(value: unknown): value is LogActivityBucket {
  return (
    isRecord(value) &&
    typeof value['start_time'] === 'string' &&
    typeof value['end_time'] === 'string' &&
    isActivityCounts(value['counts']) &&
    typeof value['total'] === 'number'
  );
}

function isLogActivityResponse(value: unknown): value is LogActivityResponse {
  return (
    isRecord(value) &&
    Array.isArray(value['data']) &&
    value['data'].every(isActivityBucket) &&
    typeof value['total'] === 'number'
  );
}

export function logSearchResult(value: unknown): LogsResponse<LogSearchResponse> {
  return isLogSearchResponse(value)
    ? { data: value, error: null }
    : { data: null, error: new TypeError('Invalid log search response') };
}

export function logActivityResult(value: unknown): LogsResponse<LogActivityResponse> {
  return isLogActivityResponse(value)
    ? { data: value, error: null }
    : { data: null, error: new TypeError('Invalid log activity response') };
}
