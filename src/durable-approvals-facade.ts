import {
  isDurableApproval,
  isDurableApprovalPage,
  isDurableApprovalStats,
} from './durable-approval-response.ts';
import {
  type DurableClient,
  type DurableResult,
  durableResult,
  failure,
  ownerSession,
} from './durable-facade.ts';
import { durablePathSegments } from './durable-paths.ts';
import type {
  DurableApproval,
  DurableApprovalListOptions,
  DurableApprovalStats,
  DurableApprovalStatsOptions,
  PaginatedDurableApprovals,
} from './sdk-public-types.ts';

type Query = Record<string, unknown>;
type Decision = 'approve' | 'deny';

const MAX_COMMENT_LENGTH = 2000;

const LIST_PARAMS = {
  status: 'status',
  function: 'function',
  executionId: 'execution_id',
  from: 'from',
  to: 'to',
  page: 'page',
  limit: 'limit',
} as const;

const STATS_PARAMS = { function: 'function', from: 'from', to: 'to' } as const;

export interface DurableApprovalsClient extends Pick<
  DurableClient,
  'accessToken' | '_oauthExchangeError' | '_completeOAuthExchange'
> {
  readonly _transport: {
    listDurableApprovals(projectId: string, params: Query, options: unknown): Promise<unknown>;
    getDurableApprovalStats(projectId: string, params: Query, options: unknown): Promise<unknown>;
    getDurableApproval(projectId: string, approvalId: string, options: unknown): Promise<unknown>;
    approveDurableApproval(
      projectId: string,
      approvalId: string,
      body: { comment?: string },
      options: unknown,
    ): Promise<unknown>;
    denyDurableApproval(
      projectId: string,
      approvalId: string,
      body: { comment?: string },
      options: unknown,
    ): Promise<unknown>;
  };
  _generatedOptions(mode: 'session'): unknown;
}

export class DurableApprovalsFacade {
  constructor(private readonly client: DurableApprovalsClient) {}

  async list(
    projectId: unknown,
    options: DurableApprovalListOptions = {},
  ): Promise<DurableResult<PaginatedDurableApprovals>> {
    const path = durablePathSegments({ projectId });
    if (path.error !== undefined) {
      return failure(path.error);
    }
    const sessionError = await ownerSession(this.client);
    if (sessionError !== null) {
      return failure(sessionError);
    }
    return durableResult('Failed to list durable approvals', isDurableApprovalPage, () =>
      this.client._transport.listDurableApprovals(
        path.segments.projectId,
        query(options, LIST_PARAMS),
        this.client._generatedOptions('session'),
      ),
    );
  }

  async get(projectId: unknown, approvalId: unknown): Promise<DurableResult<DurableApproval>> {
    const path = durablePathSegments({ projectId, approvalId });
    if (path.error !== undefined) {
      return failure(path.error);
    }
    const sessionError = await ownerSession(this.client);
    if (sessionError !== null) {
      return failure(sessionError);
    }
    return durableResult('Failed to read durable approval', isDurableApproval, () =>
      this.client._transport.getDurableApproval(
        path.segments.projectId,
        path.segments.approvalId,
        this.client._generatedOptions('session'),
      ),
    );
  }

  async stats(
    projectId: unknown,
    options: DurableApprovalStatsOptions = {},
  ): Promise<DurableResult<DurableApprovalStats>> {
    const path = durablePathSegments({ projectId });
    if (path.error !== undefined) {
      return failure(path.error);
    }
    const sessionError = await ownerSession(this.client);
    if (sessionError !== null) {
      return failure(sessionError);
    }
    return durableResult('Failed to read durable approval stats', isDurableApprovalStats, () =>
      this.client._transport.getDurableApprovalStats(
        path.segments.projectId,
        query(options, STATS_PARAMS),
        this.client._generatedOptions('session'),
      ),
    );
  }

  approve(
    projectId: unknown,
    approvalId: unknown,
    options: { comment?: unknown } = {},
  ): Promise<DurableResult<DurableApproval>> {
    return this.decide('approve', projectId, approvalId, options.comment);
  }

  deny(
    projectId: unknown,
    approvalId: unknown,
    options: { comment?: unknown } = {},
  ): Promise<DurableResult<DurableApproval>> {
    return this.decide('deny', projectId, approvalId, options.comment);
  }

  private async decide(
    decision: Decision,
    projectId: unknown,
    approvalId: unknown,
    comment: unknown,
  ): Promise<DurableResult<DurableApproval>> {
    const path = durablePathSegments({ projectId, approvalId });
    if (path.error !== undefined) {
      return failure(path.error);
    }
    const body = decisionBody(comment);
    if (body instanceof Error) {
      return failure(body);
    }
    const sessionError = await ownerSession(this.client);
    if (sessionError !== null) {
      return failure(sessionError);
    }
    const method = decision === 'approve' ? 'approveDurableApproval' : 'denyDurableApproval';
    return durableResult(`Failed to ${decision} durable approval`, isDurableApproval, () =>
      this.client._transport[method](
        path.segments.projectId,
        path.segments.approvalId,
        body,
        this.client._generatedOptions('session'),
      ),
    );
  }
}

function query(options: object, names: Readonly<Record<string, string>>): Query {
  const params: Query = {};
  for (const [option, param] of Object.entries(names)) {
    const value: unknown = Reflect.get(options, option);
    if (value !== undefined) {
      params[param] = value;
    }
  }
  return params;
}

function decisionBody(comment: unknown): { comment?: string } | Error {
  if (comment === undefined) {
    return {};
  }
  if (typeof comment !== 'string') {
    return new Error('comment must be a string when provided');
  }
  // Volcano counts characters as code points, not UTF-16 units.
  if (Array.from(comment).length > MAX_COMMENT_LENGTH) {
    return new Error(`comment must be at most ${String(MAX_COMMENT_LENGTH)} characters`);
  }
  return { comment };
}
