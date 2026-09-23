import { errorResult } from './api-errors.ts';
import { type AuthRetryClient, fetchWithAuthRetry } from './auth-fetch-retry.ts';
import { type DatabaseFilter, FilterMixin } from './database-filters.ts';
import { safeJsonParse } from './response-json.ts';

type Operation = 'insert' | 'update' | 'delete';
interface AuthContext {
  accessToken: string | null;
}

export interface MutationClient extends AuthRetryClient<AuthContext> {
  readonly apiUrl: string;
  readonly _oauthExchangeError: Error | string | null;
}

export interface MutationResult {
  data: unknown;
  error: Error | null;
}

/** Builds a database mutation while retaining its session-scoped retry behavior. */
export class MutationBuilder {
  readonly filters: DatabaseFilter[] = [];

  constructor(
    private readonly client: MutationClient,
    readonly table: string,
    readonly databaseName: string | null,
    readonly operation: Operation,
    readonly values: Record<string, unknown> | null,
  ) {}

  async execute(): Promise<MutationResult> {
    await this.client._completeOAuthExchange();
    const preflight = this.preflight();
    if (!preflight.ok) {
      return preflight.result;
    }

    try {
      return await this.request(preflight.databaseName);
    } catch (error) {
      return {
        data: null,
        error: mutationError(error, this.operation),
      };
    }
  }

  then<TResult1 = MutationResult, TResult2 = never>(
    resolve?: ((value: MutationResult) => PromiseLike<TResult1> | TResult1) | null,
    reject?: ((reason: unknown) => PromiseLike<TResult2> | TResult2) | null,
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(resolve, reject);
  }

  private preflight(): { ok: true; databaseName: string } | { ok: false; result: MutationResult } {
    if (this.client.accessToken === null || this.client.accessToken.length === 0) {
      return {
        ok: false,
        result: errorResult(sessionError(this.client._oauthExchangeError)),
      };
    }
    const databaseName = this.databaseName;
    if (databaseName === null || databaseName.length === 0) {
      return {
        ok: false,
        result: errorResult('Database name not set. Use .database(databaseName) first.'),
      };
    }
    return { ok: true, databaseName };
  }

  private async request(databaseName: string): Promise<MutationResult> {
    const body: { table: string; values?: Record<string, unknown>; filters?: DatabaseFilter[] } = {
      table: this.table,
    };
    if (this.values !== null) {
      body.values = this.values;
    }
    if (this.filters.length > 0) {
      body.filters = this.filters;
    }

    const response = await fetchWithAuthRetry(
      this.client,
      `${this.client.apiUrl}/databases/${encodeURIComponent(databaseName)}/query/${encodeURIComponent(this.operation)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      },
    );
    const result = await safeJsonParse(response);
    if (!response.ok) {
      return errorResult(responseError(result, this.operation));
    }
    return { data: responseField(result, 'data'), error: null };
  }
}

export function mutationError(error: unknown, operation: Operation): Error {
  return error instanceof Error ? error : new Error(`${operation} failed`);
}

function responseError(result: unknown, operation: Operation): Error {
  const value = responseField(result, 'error');
  if (value instanceof Error) {
    return value;
  }
  return new Error(Boolean(value) ? String(value) : `${operation} failed`);
}

function sessionError(error: Error | string | null): Error {
  if (error instanceof Error) {
    return error;
  }
  return new Error(
    error !== null && error.length > 0 ? error : 'No active session. Please sign in first.',
  );
}

function responseField(result: unknown, field: string): unknown {
  if (result === null || result === undefined) {
    throw new TypeError('Mutation response is null');
  }
  if (typeof result !== 'object') {
    return undefined;
  }
  const value: unknown = Reflect.get(result, field);
  return value;
}

Object.assign(MutationBuilder.prototype, FilterMixin);
