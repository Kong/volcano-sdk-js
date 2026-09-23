import type {
  ConnectContext,
  DisconnectContext,
  ErrorContext,
  LightweightNotification,
  PostgresChange,
  PresenceInfo,
  PresenceState,
  PublicationContext,
} from './realtime-public-types.ts';

function property(value: unknown, key: string): unknown {
  if (typeof value !== 'object' || value === null) {
    return undefined;
  }
  return Reflect.get(value, key);
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function clonePresenceValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => clonePresenceValue(item));
  }
  if (record(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, clonePresenceValue(item)]),
    );
  }
  return value;
}

function clonePresenceState(state: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(state).map(([key, item]) => [key, clonePresenceValue(item)]),
  );
}

function normalizePresenceInfo(info: unknown): unknown {
  if (!record(info)) {
    return info;
  }
  const normalized = clonePresenceState(info);
  if (normalized['data'] === undefined && normalized['chanInfo'] !== undefined) {
    normalized['data'] = clonePresenceValue(normalized['chanInfo']);
  }
  return normalized;
}

function isChangeType(value: unknown): value is LightweightNotification['type'] {
  return value === 'INSERT' || value === 'UPDATE' || value === 'DELETE';
}

function hasChangeLocation(value: unknown): boolean {
  return (
    typeof property(value, 'schema') === 'string' &&
    typeof property(value, 'table') === 'string' &&
    typeof property(value, 'timestamp') === 'string'
  );
}

function isLightweightNotification(value: unknown): value is LightweightNotification {
  return (
    property(value, 'mode') === 'lightweight' &&
    isChangeType(property(value, 'type')) &&
    hasChangeLocation(value) &&
    optionalRecord(property(value, 'old_record'))
  );
}

function validTags(value: unknown): boolean {
  return (
    value === undefined ||
    (record(value) && Object.values(value).every((tag) => typeof tag === 'string'))
  );
}

function isPublicationContext(value: unknown): value is PublicationContext {
  if (!record(value) || !Object.hasOwn(value, 'data')) {
    return false;
  }
  const offset = value['offset'];
  if (offset !== undefined && typeof offset !== 'number') {
    return false;
  }
  return validTags(value['tags']);
}

function connectContext(value: unknown): ConnectContext {
  const client = property(value, 'client');
  const latency = property(value, 'latency');
  return {
    ...(typeof client === 'string' ? { client } : {}),
    ...(typeof latency === 'number' ? { latency } : {}),
  };
}

function disconnectContext(value: unknown): DisconnectContext {
  const code = property(value, 'code');
  const reason = property(value, 'reason');
  const reconnect = property(value, 'reconnect');
  return {
    ...(typeof code === 'number' ? { code } : {}),
    ...(typeof reason === 'string' ? { reason } : {}),
    ...(typeof reconnect === 'boolean' ? { reconnect } : {}),
  };
}

function preferredString(outer: unknown, nested: unknown): string | undefined {
  if (typeof outer === 'string') {
    return outer;
  }
  return typeof nested === 'string' ? nested : undefined;
}

function preferredNumber(outer: unknown, nested: unknown): number | undefined {
  if (typeof outer === 'number') {
    return outer;
  }
  return typeof nested === 'number' ? nested : undefined;
}

function errorContext(value: unknown): ErrorContext {
  const error = property(value, 'error');
  const message = preferredString(property(value, 'message'), property(error, 'message'));
  const code = preferredNumber(property(value, 'code'), property(error, 'code'));
  return {
    ...(error === undefined ? {} : { error }),
    ...(message === undefined ? {} : { message }),
    ...(code === undefined ? {} : { code }),
  };
}

function isPostgresChange(value: unknown): value is PostgresChange {
  return record(value) && isChangeType(value['type']) && hasChangeLocation(value);
}

function optionalRecord(value: unknown): boolean {
  return value === undefined || record(value);
}

function optionalString(value: unknown): boolean {
  return value === undefined || typeof value === 'string';
}

function validPresenceExtras(value: Record<string, unknown>): boolean {
  return (
    optionalString(value['user']) &&
    optionalRecord(value['connInfo']) &&
    optionalRecord(value['chanInfo']) &&
    optionalRecord(value['data'])
  );
}

function isPresenceInfo(value: unknown): value is PresenceInfo {
  if (!record(value) || typeof value['client'] !== 'string') {
    return false;
  }
  return validPresenceExtras(value);
}

function isPresenceState(value: unknown): value is PresenceState {
  return record(value) && Object.values(value).every(isPresenceInfo);
}

function requiredApiUrl(value: unknown): string {
  if (typeof value !== 'string' || value === '') {
    throw new Error('apiUrl is required');
  }
  return value.replace(/\/$/, '');
}

function requiredAnonKey(value: unknown): string {
  if (typeof value !== 'string') {
    throw new TypeError('anonKey is required');
  }
  return value;
}

function optionalDatabaseName(value: string | undefined): string | null {
  return value === undefined || value === '' ? null : value;
}

function payloadEvent(data: unknown): unknown {
  const event = property(data, 'event');
  if (Boolean(event)) {
    return event;
  }
  const type = property(data, 'type');
  return Boolean(type) ? type : 'message';
}

function matchesPostgresChange(
  value: unknown,
  event: 'INSERT' | 'UPDATE' | 'DELETE' | '*',
  schema: string,
  table: string,
): value is PostgresChange {
  if (!isPostgresChange(value)) {
    return false;
  }
  return (
    value.schema === schema && value.table === table && (event === '*' || value.type === event)
  );
}

export {
  clonePresenceState,
  connectContext,
  disconnectContext,
  errorContext,
  hasChangeLocation,
  isChangeType,
  isLightweightNotification,
  isPostgresChange,
  isPresenceInfo,
  isPresenceState,
  isPublicationContext,
  matchesPostgresChange,
  normalizePresenceInfo,
  optionalDatabaseName,
  optionalRecord,
  optionalString,
  payloadEvent,
  property,
  record,
  requiredAnonKey,
  requiredApiUrl,
  validPresenceExtras,
  validTags,
};
