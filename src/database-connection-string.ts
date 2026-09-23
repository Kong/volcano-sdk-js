/**
 * Options for {@link databaseConnectionString}.
 */
export interface DatabaseConnectionStringOptions {
  /**
   * When set, the connection impersonates this auth user and Row-Level Security
   * is enforced (application_name `volcano_user_access:{userId}`). Typically
   * `event.__volcano_auth.user_id`. When omitted, the connection has full
   * (admin) access and bypasses RLS.
   */
  userId?: string | null;
}

/**
 * Build a Postgres connection string for querying a Volcano database from inside
 * a function, selecting the access mode via `application_name`.
 *
 * Pass the `DATABASE_URL` Volcano advertises as `baseConnectionString`. The
 * target database is identified by the globally-unique username already baked
 * into that URL, so this only sets `application_name` to choose the access mode
 * (the username, host, database and password are left untouched):
 * - no `userId`  → `volcano_full_access` (admin, bypasses RLS)
 * - with `userId` → `volcano_user_access:{userId}` (RLS enforced)
 *
 * Throws if the base connection string is missing, lacks a PostgreSQL URI prefix,
 * or contains malformed percent encoding. Connection details are validated by libpq.
 * Hostless and multi-host libpq targets and unrelated query values are preserved.
 *
 * @example
 * ```typescript
 * import { databaseConnectionString } from '@volcano.dev/sdk';
 * import { Client } from 'pg';
 *
 * exports.handler = async (event) => {
 *   const auth = event.__volcano_auth;
 *   const connectionString = databaseConnectionString(process.env.DATABASE_URL, {
 *     userId: auth?.user_id, // omit for full (admin) access
 *   });
 *   const client = new Client({ connectionString });
 *   await client.connect();
 *   // ...
 * };
 * ```
 */
export function databaseConnectionString(
  baseConnectionString: string,
  options?: DatabaseConnectionStringOptions,
): string;
export function databaseConnectionString(
  baseConnectionString: unknown,
  options: { userId?: string | number | bigint | boolean | symbol | null } | null = {},
): string {
  const [base, prefixLength] = validateConnectionString(baseConnectionString);
  const queryMarker = base.indexOf('?', userInfoBoundary(base, prefixLength));
  const target = queryMarker === -1 ? base : base.slice(0, queryMarker);
  const rawQuery = queryMarker === -1 ? '' : base.slice(queryMarker + 1);
  const parameters = connectionParameters(rawQuery);
  const appName = applicationName(options?.userId);
  parameters.push(`application_name=${encodeURIComponent(appName)}`);
  return `${target}?${parameters.join('&')}`;
}

function applicationName(
  value: string | number | bigint | boolean | symbol | null | undefined,
): string {
  // Preserve JavaScript callers' historical primitive coercion; public types
  // continue to accept only string or null user IDs.
  const userId = value == null ? '' : String(value);
  return userId === '' ? 'volcano_full_access' : `volcano_user_access:${userId}`;
}

function validateConnectionString(value: unknown): [string, number] {
  if (typeof value !== 'string' || value === '') {
    throw new Error('databaseConnectionString: baseConnectionString (DATABASE_URL) is required');
  }
  const prefix = /^postgres(?:ql)?:\/\//u.exec(value);
  if (prefix === null || /%(?![\da-f]{2})/iu.test(value)) {
    throw new Error('databaseConnectionString: baseConnectionString is not a valid connection URL');
  }
  return [value, prefix[0].length];
}

function userInfoBoundary(base: string, prefixLength: number): number {
  const authorityEnd = base.indexOf('/', prefixLength);
  const possibleUserInfoEnd = base.indexOf('@', prefixLength);
  if (possibleUserInfoEnd !== -1 && (authorityEnd === -1 || possibleUserInfoEnd < authorityEnd)) {
    return possibleUserInfoEnd + 1;
  }
  return prefixLength;
}

function connectionParameters(rawQuery: string): string[] {
  const parameters = rawQuery.split('&').filter((parameter) => {
    const separator = parameter.indexOf('=');
    const name = separator === -1 ? parameter : parameter.slice(0, separator);
    return decodeURIComponent(name) !== 'application_name';
  });
  const lastNonEmpty = parameters.map((parameter) => parameter !== '').lastIndexOf(true);
  return parameters.slice(0, lastNonEmpty + 1);
}
