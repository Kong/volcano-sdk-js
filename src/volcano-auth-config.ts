import { queryDatabaseSelectTransport } from './database-query.ts';
import {
  acquireProjectLock,
  approveDurableApproval,
  authSignin,
  denyDurableApproval,
  downloadStorageObject,
  getDurableApproval,
  getDurableApprovalStats,
  getDurableExecution,
  getDurableExecutionFromApplication,
  listDurableApprovals,
  listDurableExecutions,
  listDurableMessages,
  listDurableMessagesFromApplication,
  releaseProjectLock,
  sendDurableMessage,
  sendDurableMessageFromApplication,
  startDurableExecutionFromApplication,
  stopDurableExecution,
  stopDurableExecutionFromApplication,
  uploadStorageObject,
} from './generated/client.ts';
import { isBrowser } from './next/request.ts';
import type { VolcanoAuthConfig } from './sdk-public-types.ts';

const DEFAULT_API_URL = 'https://api.volcano.dev';
// 60 seconds
const DEFAULT_TIMEOUT_MS = 60000;
// The idempotency header's documented limit. Checked here so a name that is too
// long fails before the start is sent, rather than coming back as a 400 the
// caller has to read.
export const GENERATED_TRANSPORT = {
  acquireProjectLock,
  approveDurableApproval,
  authSignin,
  denyDurableApproval,
  downloadStorageObject,
  getDurableApproval,
  getDurableApprovalStats,
  getDurableExecution,
  getDurableExecutionFromApplication,
  listDurableApprovals,
  listDurableExecutions,
  listDurableMessages,
  listDurableMessagesFromApplication,
  queryDatabaseSelect: queryDatabaseSelectTransport,
  releaseProjectLock,
  sendDurableMessage,
  sendDurableMessageFromApplication,
  startDurableExecutionFromApplication,
  stopDurableExecution,
  stopDurableExecutionFromApplication,
  uploadStorageObject,
};

type DurableTransportMethod =
  | 'startDurableExecutionFromApplication'
  | 'getDurableExecution'
  | 'getDurableExecutionFromApplication'
  | 'listDurableExecutions'
  | 'stopDurableExecution'
  | 'stopDurableExecutionFromApplication'
  | 'listDurableApprovals'
  | 'getDurableApprovalStats'
  | 'getDurableApproval'
  | 'approveDurableApproval'
  | 'denyDurableApproval'
  | 'sendDurableMessage'
  | 'sendDurableMessageFromApplication'
  | 'listDurableMessages'
  | 'listDurableMessagesFromApplication';

export type RuntimeTransport = {
  [K in keyof typeof GENERATED_TRANSPORT]: K extends DurableTransportMethod
    ? (...args: Parameters<(typeof GENERATED_TRANSPORT)[K]>) => Promise<unknown>
    : (typeof GENERATED_TRANSPORT)[K];
};

export function requireAnonKey(anonKey: unknown): asserts anonKey is string {
  if (typeof anonKey !== 'string' || anonKey === '') {
    throw new Error('anonKey is required. Get your anon key from project settings.');
  }
  if (anonKey.startsWith('sk-') && isBrowser()) {
    throw new Error(
      '[VOLCANO SECURITY ERROR] Service keys (sk-*) cannot be used in client-side code. ' +
        'Service keys bypass Row Level Security and expose your database to unauthorized access. ' +
        'Use an anon key (ak-*) for browser/client-side applications. ' +
        'Service keys should only be used in secure server-side environments. ' +
        'See: https://docs.volcano.hosting/security/keys',
    );
  }
}

export function configApiUrl(config: VolcanoAuthConfig): string {
  const url = config.apiUrl === '' ? DEFAULT_API_URL : (config.apiUrl ?? DEFAULT_API_URL);
  return url.replace(/\/$/u, '');
}

export function configTimeout(value: number | undefined): number {
  return typeof value === 'number' && value !== 0 && !Number.isNaN(value) ? value : DEFAULT_TIMEOUT_MS;
}
