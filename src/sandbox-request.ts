import type { executeSandbox } from './generated/client.ts';
import type { SandboxCommandOptions, SandboxReplayOptions, SandboxResult } from './index.ts';

type TransportOptions = NonNullable<Parameters<typeof executeSandbox>[2]>;
export interface SandboxClient {
  readonly timeout: number;
  _completeOAuthExchange(): Promise<unknown>;
  _generatedOptions(
    mode: 'anon' | 'session',
    headers?: Record<string, string>,
    responseType?: 'blob',
    timeoutMs?: number,
  ): TransportOptions;
}
export function pathId(value: string): string {
  if (!/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(value)) {
    throw new TypeError('A Sandbox resource ID must be a UUID');
  }
  return encodeURIComponent(value);
}
export function requestOptions(
  client: SandboxClient,
  options: SandboxReplayOptions = {},
  mode?: 'anon' | 'session' | 'replayable',
  timeoutMs?: number,
): TransportOptions {
  const result = client._generatedOptions(
    mode === 'anon' ? 'anon' : 'session',
    mutationHeaders(options, mode === 'replayable'),
    undefined,
    timeoutMs,
  );
  if (options.signal !== undefined) {
    result.signal = options.signal;
  }
  return result;
}
function mutationHeaders(options: SandboxReplayOptions, mutating: boolean): Record<string, string> {
  if (!mutating) {
    return {};
  }
  const id = options.requestId ?? crypto.randomUUID();
  pathId(id);
  return { 'Idempotency-Key': id };
}

export function commandRequest(
  command: string,
  options: SandboxCommandOptions,
): import('./generated/model/sandboxCommandRequest.ts').SandboxCommandRequest {
  return {
    command,
    ...(options.timeoutSeconds === undefined ? {} : { timeout_seconds: options.timeoutSeconds }),
    ...(options.environment === undefined ? {} : { environment: options.environment }),
  };
}
export async function sandboxResult<T>(operation: () => Promise<T>): Promise<SandboxResult<T>> {
  try {
    return { data: await operation(), error: null };
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error : new Error('Sandbox request failed'),
    };
  }
}

export async function responseData(request: Promise<{ data: unknown }>): Promise<unknown> {
  const response = await request;
  return response.data;
}

export function executionRequestOptions(
  client: SandboxClient,
  options: SandboxCommandOptions,
): TransportOptions {
  const timeoutMs = Math.max(client.timeout, ((options.timeoutSeconds ?? 60) + 120) * 1000);
  return requestOptions(client, options, 'replayable', timeoutMs);
}
