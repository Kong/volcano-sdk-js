import { durablePathSegments } from './durable-paths.ts';
import { isDurableExecution, isDurablePage } from './durable-response.ts';
import type { DurableExecution, PaginatedDurableExecutions } from './sdk-public-types.ts';

const MAX_EXECUTION_NAME_LENGTH = 255;

interface DurableResult<T> {
  data: T | null;
  status: number | null;
  error: Error | null;
}
interface DurableOptions {
  status?: import('./generated/model/durableExecutionStatus.ts').DurableExecutionStatus;
  page?: number;
  limit?: number;
}

export interface DurableClient {
  readonly accessToken: string | null;
  readonly _oauthExchangeError: Error | null;
  readonly _transport: {
    startDurableExecutionFromApplication(
      name: string,
      input: unknown,
      options: unknown,
    ): Promise<unknown>;
    getDurableExecution(
      projectId: string,
      name: string,
      executionId: string,
      options: unknown,
    ): Promise<unknown>;
    listDurableExecutions(
      projectId: string,
      name: string,
      params: DurableOptions,
      options: unknown,
    ): Promise<unknown>;
    stopDurableExecution(
      projectId: string,
      name: string,
      executionId: string,
      options: unknown,
    ): Promise<unknown>;
  };
  _completeOAuthExchange(): Promise<unknown>;
  _captureAuthContext(): { accessToken: string | null };
  _generatedOptions(mode: 'anon' | 'session', headers?: Record<string, string>): unknown;
}

export class DurableFacade {
  constructor(private readonly client: DurableClient) {}

  async start(
    functionName: unknown,
    input: unknown,
    options: { executionName?: unknown },
  ): Promise<DurableResult<DurableExecution>> {
    const path = durablePathSegments({ functionName });
    if (path.error !== undefined) {
      return failure(path.error);
    }
    const executionName = validatedExecutionName(options.executionName);
    if (executionName.error !== null) {
      return failure(executionName.error);
    }
    await this.client._completeOAuthExchange();
    const mode = credentialMode(this.client._captureAuthContext().accessToken);
    return durableResult('Failed to start durable execution', isDurableExecution, () =>
      this.client._transport.startDurableExecutionFromApplication(
        path.segments.functionName,
        input,
        this.client._generatedOptions(mode, executionHeaders(executionName.name)),
      ),
    );
  }

  async get(
    projectId: unknown,
    functionName: unknown,
    executionId: unknown,
  ): Promise<DurableResult<DurableExecution>> {
    const path = durablePathSegments({ projectId, functionName, executionId });
    if (path.error !== undefined) {
      return failure(path.error);
    }
    const sessionError = await ownerSession(this.client);
    if (sessionError !== null) {
      return failure(sessionError);
    }
    return durableResult('Failed to read durable execution', isDurableExecution, () =>
      this.client._transport.getDurableExecution(
        path.segments.projectId,
        path.segments.functionName,
        path.segments.executionId,
        this.client._generatedOptions('session'),
      ),
    );
  }

  async list(
    projectId: unknown,
    functionName: unknown,
    options: DurableOptions,
  ): Promise<DurableResult<PaginatedDurableExecutions>> {
    const path = durablePathSegments({ projectId, functionName });
    if (path.error !== undefined) {
      return failure(path.error);
    }
    const sessionError = await ownerSession(this.client);
    if (sessionError !== null) {
      return failure(sessionError);
    }
    return durableResult('Failed to list durable executions', isDurablePage, () =>
      this.client._transport.listDurableExecutions(
        path.segments.projectId,
        path.segments.functionName,
        listParams(options),
        this.client._generatedOptions('session'),
      ),
    );
  }

  async stop(
    projectId: unknown,
    functionName: unknown,
    executionId: unknown,
  ): Promise<DurableResult<DurableExecution>> {
    const path = durablePathSegments({ projectId, functionName, executionId });
    if (path.error !== undefined) {
      return failure(path.error);
    }
    const sessionError = await ownerSession(this.client);
    if (sessionError !== null) {
      return failure(sessionError);
    }
    return durableResult('Failed to stop durable execution', isDurableExecution, () =>
      this.client._transport.stopDurableExecution(
        path.segments.projectId,
        path.segments.functionName,
        path.segments.executionId,
        this.client._generatedOptions('session'),
      ),
    );
  }
}

function failure<T>(error: Error): DurableResult<T> {
  return { data: null, status: null, error };
}

function validatedExecutionName(value: unknown): { name: string | null; error: Error | null } {
  if (value === undefined) {
    return { name: null, error: null };
  }
  if (typeof value !== 'string' || value.trim().length === 0) {
    return {
      name: null,
      error: new Error('executionName must be a non-empty string when provided'),
    };
  }
  if (value.trim().length > MAX_EXECUTION_NAME_LENGTH) {
    return {
      name: null,
      error: new Error(
        `executionName must be at most ${String(MAX_EXECUTION_NAME_LENGTH)} characters`,
      ),
    };
  }
  return { name: value.trim(), error: null };
}

function credentialMode(token: string | null): 'anon' | 'session' {
  return token === null || token.length === 0 ? 'anon' : 'session';
}

function executionHeaders(name: string | null): Record<string, string> | undefined {
  return name === null ? undefined : { 'X-Volcano-Execution-Name': name };
}

function listParams(options: DurableOptions): DurableOptions {
  const params: DurableOptions = {};
  if (options.status !== undefined) {
    params.status = options.status;
  }
  if (options.page !== undefined) {
    params.page = options.page;
  }
  if (options.limit !== undefined) {
    params.limit = options.limit;
  }
  return params;
}

async function ownerSession(client: DurableClient): Promise<Error | null> {
  await client._completeOAuthExchange();
  if (client.accessToken === null || client.accessToken.length === 0) {
    return client._oauthExchangeError ?? new Error('No active session');
  }
  return null;
}

async function durableResult<T>(
  message: string,
  validate: (value: unknown) => value is T,
  call: () => Promise<unknown>,
): Promise<DurableResult<T>> {
  try {
    return responseResult(await call(), message, validate);
  } catch (error) {
    return thrownResult(error, message);
  }
}

function responseResult<T>(
  response: unknown,
  message: string,
  validate: (value: unknown) => value is T,
): DurableResult<T> {
  if (!responseHasStatus(response)) {
    throw new Error(message);
  }
  if (!validate(response.data)) {
    throw new TypeError(`Invalid durable response: ${message}`);
  }
  return {
    data: response.data,
    status: response.status,
    error: null,
  };
}

function responseHasStatus(response: unknown): response is { status: number; data?: unknown } {
  return (
    typeof response === 'object' &&
    response !== null &&
    'status' in response &&
    typeof response.status === 'number'
  );
}

function thrownResult<T>(error: unknown, message: string): DurableResult<T> {
  return {
    data: null,
    status: thrownStatus(error),
    error: error instanceof Error ? error : new Error(message, { cause: error }),
  };
}

function thrownStatus(error: unknown): number | null {
  if (typeof error !== 'object' || error === null || !('status' in error)) {
    return null;
  }
  return typeof error.status === 'number' ? error.status : null;
}
