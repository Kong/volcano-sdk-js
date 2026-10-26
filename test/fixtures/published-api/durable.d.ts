import type { components as GeneratedComponents } from '../../../dist/generated/openapi';
import type { JsonValue } from './auth';
export type DurableExecution = GeneratedComponents['schemas']['DurableExecution'];
export type DurableExecutionStatus = GeneratedComponents['schemas']['DurableExecutionStatus'];
export type PaginatedDurableExecutions = GeneratedComponents['schemas']['PaginatedDurableExecutions'];
export type DurableApproval = GeneratedComponents['schemas']['DurableApproval'];
export type DurableApprovalStatus = GeneratedComponents['schemas']['DurableApprovalStatus'];
export type DurableApprovalStats = GeneratedComponents['schemas']['DurableApprovalStats'];
export type PaginatedDurableApprovals = GeneratedComponents['schemas']['PaginatedDurableApprovals'];
export type DurableMessage = GeneratedComponents['schemas']['DurableMessage'];
export type DurableMessageDirection = GeneratedComponents['schemas']['DurableMessageDirection'];
export type DurableMessageList = GeneratedComponents['schemas']['DurableMessageList'];
export interface FunctionError extends Error {
  status?: number | null;
  code?: string;
  retryAfter?: number;
}
export interface Functions {
  invoke<TPayload = JsonValue, TResult = unknown>(
    functionName: string,
    payload?: TPayload,
  ): Promise<{
    data: TResult | string | null;
    status: number | null;
    headers: Record<string, string>;
    version: string | null;
    error: FunctionError | null;
  }>;
}
export interface Durable {
  start<TInput = JsonValue>(
    functionName: string,
    input?: TInput,
    options?: {
      executionName?: string;
    },
  ): Promise<{
    data: DurableExecution | null;
    status: number | null;
    error: Error | null;
  }>;
  get(
    projectId: string,
    functionName: string,
    executionId: string,
  ): Promise<{
    data: DurableExecution | null;
    status: number | null;
    error: Error | null;
  }>;
  list(
    projectId: string,
    functionName: string,
    options?: {
      status?: DurableExecutionStatus;
      page?: number;
      limit?: number;
    },
  ): Promise<{
    data: PaginatedDurableExecutions | null;
    status: number | null;
    error: Error | null;
  }>;
  stop(
    projectId: string,
    functionName: string,
    executionId: string,
  ): Promise<{
    data: DurableExecution | null;
    status: number | null;
    error: Error | null;
  }>;
  approvals: DurableApprovals;
  messages: DurableMessages;
}
export interface DurableApprovalListOptions {
  status?: DurableApprovalStatus;
  function?: string;
  executionId?: string;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}
export interface DurableApprovalStatsOptions {
  function?: string;
  from?: string;
  to?: string;
}
export interface DurableApprovals {
  list(
    projectId: string,
    options?: DurableApprovalListOptions,
  ): Promise<{
    data: PaginatedDurableApprovals | null;
    status: number | null;
    error: Error | null;
  }>;
  get(
    projectId: string,
    approvalId: string,
  ): Promise<{
    data: DurableApproval | null;
    status: number | null;
    error: Error | null;
  }>;
  stats(
    projectId: string,
    options?: DurableApprovalStatsOptions,
  ): Promise<{
    data: DurableApprovalStats | null;
    status: number | null;
    error: Error | null;
  }>;
  approve(
    projectId: string,
    approvalId: string,
    options?: {
      comment?: string;
    },
  ): Promise<{
    data: DurableApproval | null;
    status: number | null;
    error: Error | null;
  }>;
  deny(
    projectId: string,
    approvalId: string,
    options?: {
      comment?: string;
    },
  ): Promise<{
    data: DurableApproval | null;
    status: number | null;
    error: Error | null;
  }>;
}
export interface DurableMessageTarget {
  functionName: string;
  executionId: string;
  clientToken?: string;
  projectId?: string;
}
export interface DurableMessageSendOptions {
  idempotencyKey?: string;
}
export interface DurableMessageListOptions {
  direction?: DurableMessageDirection;
  name?: string;
  after?: number;
  limit?: number;
}
export interface DurableMessageSubscribeOptions {
  realtime: import('../../../dist/realtime').VolcanoRealtime;
}
export interface DurableMessageSubscription {
  unsubscribe(): Promise<void>;
}
export interface DurableMessages {
  send(
    target: DurableMessageTarget,
    name: string,
    data?: unknown,
    options?: DurableMessageSendOptions,
  ): Promise<{
    data: DurableMessage | null;
    status: number | null;
    error: Error | null;
  }>;
  list(
    target: DurableMessageTarget,
    options?: DurableMessageListOptions,
  ): Promise<{
    data: DurableMessageList | null;
    status: number | null;
    error: Error | null;
  }>;
  subscribe(
    target: DurableMessageTarget,
    handler: (message: DurableMessage) => unknown,
    options: DurableMessageSubscribeOptions,
  ): Promise<{
    data: DurableMessageSubscription | null;
    status: number | null;
    error: Error | null;
  }>;
}
