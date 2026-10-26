import { MAX_NAME_LENGTH, OPERATION_NAME } from './durable-callback.ts';
import { durablePathSegments } from './durable-paths.ts';

export type Query = Record<string, unknown>;
export type Headers = Record<string, string>;

// The spec's bounds on Idempotency-Key, X-Volcano-Client-Token, and a page.
const MAX_IDEMPOTENCY_KEY_LENGTH = 255;
const MAX_CLIENT_TOKEN_LENGTH = 128;
const MAX_LIST_LIMIT = 500;
// A header value carries printable ASCII only.
const HEADER_VALUE = /^[\u0020-\u007E]+$/u;

const LIST_PARAMS = ['direction', 'name', 'after', 'limit'] as const;

export interface SendBody {
  name: string;
  data?: unknown;
}

export interface Target {
  projectId: string | null;
  functionName: string;
  executionId: string;
  clientToken: string | null;
}

type Checked<T> = { value: T; error?: never } | { error: Error; value?: never };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function targetOf(target: unknown): Target | Error {
  if (!isRecord(target)) {
    return new Error('target must be an object');
  }
  const path = durablePathSegments({
    functionName: target['functionName'],
    executionId: target['executionId'],
  });
  if (path.error !== undefined) {
    return path.error;
  }
  const projectId = optionalProject(target['projectId']);
  if (projectId.error !== undefined) {
    return projectId.error;
  }
  const clientToken = optionalClientToken(target['clientToken']);
  if (clientToken.error !== undefined) {
    return clientToken.error;
  }
  return { projectId: projectId.value, ...path.segments, clientToken: clientToken.value };
}

function optionalProject(value: unknown): Checked<string | null> {
  if (value === undefined) {
    return { value: null };
  }
  const path = durablePathSegments({ projectId: value });
  if (path.error !== undefined) {
    return { error: path.error };
  }
  return { value: path.segments.projectId };
}

function optionalClientToken(value: unknown): Checked<string | null> {
  return optionalHeaderValue(value, 'clientToken', MAX_CLIENT_TOKEN_LENGTH);
}

function optionalHeaderValue(value: unknown, field: string, limit: number): Checked<string | null> {
  if (value === undefined) {
    return { value: null };
  }
  if (typeof value !== 'string' || value === '') {
    return { error: new Error(`${field} must be a non-empty string when provided`) };
  }
  const error = headerValueError(value, field, limit);
  return error === null ? { value } : { error };
}

function headerValueError(value: string, field: string, limit: number): Error | null {
  if (!HEADER_VALUE.test(value)) {
    return new Error(`${field} must be printable ASCII`);
  }
  return value.length > limit ? new Error(`${field} must be at most ${String(limit)} characters`) : null;
}

export function sendRequest(
  target: unknown,
  name: unknown,
  data: unknown,
  idempotencyKey: unknown,
): { target: Target; headers: Headers; body: SendBody } | Error {
  const addressed = targetOf(target);
  if (addressed instanceof Error) {
    return addressed;
  }
  const checkedName = messageName(name);
  if (checkedName.error !== undefined) {
    return checkedName.error;
  }
  const headers = idempotencyHeaders(idempotencyKey);
  if (headers instanceof Error) {
    return headers;
  }
  const body = data === undefined ? { name: checkedName.value } : { name: checkedName.value, data };
  return { target: addressed, headers, body };
}

// The names ctx.publish and ctx.waitForMessage accept.
function messageName(name: unknown): Checked<string> {
  if (typeof name !== 'string' || name.trim() === '') {
    return { error: new Error('name must be a non-empty string') };
  }
  if (name.length > MAX_NAME_LENGTH || !OPERATION_NAME.test(name)) {
    return {
      error: new Error(`name must be at most ${String(MAX_NAME_LENGTH)} printable ASCII characters`),
    };
  }
  return { value: name };
}

function idempotencyHeaders(key: unknown): Headers | Error {
  const checked = optionalHeaderValue(key, 'idempotencyKey', MAX_IDEMPOTENCY_KEY_LENGTH);
  if (checked.error !== undefined) {
    return checked.error;
  }
  return checked.value === null ? {} : { 'Idempotency-Key': checked.value };
}

function isIntegerBetween(value: unknown, min: number, max: number): boolean {
  return Number.isSafeInteger(value) && Number(value) >= min && Number(value) <= max;
}

const LIST_FILTER_ERRORS: Record<(typeof LIST_PARAMS)[number], (value: unknown) => Error | null> = {
  direction: (value) => (value === 'in' || value === 'out' ? null : new Error("direction must be 'in' or 'out'")),
  name: (value) => messageName(value).error ?? null,
  after: (value) =>
    isIntegerBetween(value, 0, Number.MAX_SAFE_INTEGER) ? null : new Error('after must be a non-negative integer'),
  limit: (value) =>
    isIntegerBetween(value, 1, MAX_LIST_LIMIT)
      ? null
      : new Error(`limit must be an integer between 1 and ${String(MAX_LIST_LIMIT)}`),
};

export function listQuery(options: object): Query | Error {
  const params: Query = {};
  for (const name of LIST_PARAMS) {
    const value: unknown = Reflect.get(options, name);
    if (value === undefined) {
      continue;
    }
    const error = LIST_FILTER_ERRORS[name](value);
    if (error !== null) {
      return error;
    }
    params[name] = value;
  }
  return params;
}
