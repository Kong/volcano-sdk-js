import { errorResult } from './api-errors.ts';
import { type DatabaseFilter, FilterBuilder } from './database-filters.ts';
import { getQueryDatabaseSelectUrl } from './generated/client.ts';
import { volcanoFetch, type VolcanoRequestInit } from './volcano-fetch.ts';

export interface SelectRequest {
  table: string;
  select?: string[];
  filters?: DatabaseFilter[];
  order?: { column: string; ascending: boolean }[];
  limit?: number;
  offset?: number;
}

interface QueryTransport {
  queryDatabaseSelect(
    databaseName: string,
    request: SelectRequest,
    options: VolcanoRequestInit,
  ): Promise<{ data: unknown }>;
}

export interface QueryClient {
  readonly accessToken: string | null;
  readonly _oauthExchangeError: Error | string | null;
  readonly _transport: QueryTransport;
  _completeOAuthExchange(): Promise<unknown>;
  _generatedOptions(mode: 'session'): VolcanoRequestInit;
}

/** Preserve the SDK's Date and nullable-array filter wire behavior beyond the OpenAPI generator's narrower filter type. */
export async function queryDatabaseSelectTransport(
  databaseName: string,
  request: SelectRequest,
  options: VolcanoRequestInit,
): Promise<{ data: unknown }> {
  const headers = new Headers(options.headers);
  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  return volcanoFetch<{ data: unknown }>(getQueryDatabaseSelectUrl(databaseName), {
    ...options,
    method: 'POST',
    headers,
    body: JSON.stringify(request),
  });
}

export interface SelectResult {
  data: unknown[] | null;
  error: Error | null;
  count: number;
}

/** Builds a SELECT request without trusting the generated transport's parsed body. */
export class QueryBuilder extends FilterBuilder {
  readonly orderClauses: { column: string; ascending: boolean }[] = [];
  selectColumns: string[] = [];
  limitValue: number | null = null;
  offsetValue: number | null = null;

  constructor(
    private readonly client: QueryClient,
    readonly table: string,
    readonly databaseName: string | null,
  ) {
    super();
  }

  select(columns: string | string[]): this {
    if (columns === '*') {
      this.selectColumns = [];
    } else if (Array.isArray(columns)) {
      this.selectColumns = columns;
    } else {
      this.selectColumns = columns.split(',').map((column) => column.trim());
    }
    return this;
  }

  order(column: string, options: { ascending?: boolean } = {}): this {
    this.orderClauses.push({ column, ascending: options.ascending !== false });
    return this;
  }

  limit(count: number): this {
    this.limitValue = count;
    return this;
  }

  offset(count: number): this {
    this.offsetValue = count;
    return this;
  }

  async execute(): Promise<SelectResult> {
    await this.client._completeOAuthExchange();
    const preflight = this.preflight();
    if (!preflight.ok) {
      return preflight.result;
    }
    try {
      return await this.request(preflight.databaseName);
    } catch (error) {
      return { data: null, error: queryError(error), count: 0 };
    }
  }

  then<TResult1 = SelectResult, TResult2 = never>(
    resolve?: ((value: SelectResult) => PromiseLike<TResult1> | TResult1) | null,
    reject?: ((reason: unknown) => PromiseLike<TResult2> | TResult2) | null,
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(resolve, reject);
  }

  private preflight(): { ok: true; databaseName: string } | { ok: false; result: SelectResult } {
    if (this.client.accessToken === null || this.client.accessToken.length === 0) {
      return {
        ok: false,
        result: { ...errorResult(sessionError(this.client._oauthExchangeError)), count: 0 },
      };
    }
    const databaseName = this.databaseName;
    if (databaseName === null || databaseName.length === 0) {
      return {
        ok: false,
        result: {
          ...errorResult('Database name not set. Use .database(databaseName) first.'),
          count: 0,
        },
      };
    }
    return { ok: true, databaseName };
  }

  private async request(databaseName: string): Promise<SelectResult> {
    const response = await this.client._transport.queryDatabaseSelect(
      encodeURIComponent(databaseName),
      this.requestBody(),
      this.client._generatedOptions('session'),
    );
    const payload = queryPayload(response.data);
    return {
      data: payload.rows,
      error: null,
      count: queryCount(payload.count, payload.rows.length),
    };
  }

  private requestBody(): SelectRequest {
    const body: SelectRequest = { table: this.table };
    if (this.selectColumns.length > 0) {
      body.select = this.selectColumns;
    }
    if (this.filters.length > 0) {
      body.filters = this.filters;
    }
    if (this.orderClauses.length > 0) {
      body.order = this.orderClauses;
    }
    this.addPagination(body);
    return body;
  }

  private addPagination(body: SelectRequest): void {
    if (this.limitValue !== null) {
      body.limit = this.limitValue;
    }
    if (this.offsetValue !== null) {
      body.offset = this.offsetValue;
    }
  }
}

export function queryError(error: unknown): Error {
  return error instanceof Error ? error : new Error('Query failed');
}

function sessionError(error: Error | string | null): Error {
  if (error instanceof Error) {
    return error;
  }
  return new Error(
    error !== null && error.length > 0 ? error : 'No active session. Please sign in first.',
  );
}

function queryPayload(value: unknown): { rows: unknown[]; count: unknown } {
  if (typeof value !== 'object' || value === null) {
    throw new TypeError('Query response is not an object');
  }
  if (!('data' in value) || !Array.isArray(value.data)) {
    throw new TypeError('Query response has no rows');
  }
  const rows: unknown[] = value.data;
  return { rows, count: responseCount(value) };
}

function responseCount(value: object): unknown {
  return 'count' in value ? value.count : undefined;
}

function queryCount(count: unknown, rowCount: number): number {
  return typeof count === 'number' && count !== 0 ? count : rowCount;
}
