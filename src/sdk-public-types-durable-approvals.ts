import type { components as GeneratedComponents } from './generated/openapi';

export type DurableApproval = GeneratedComponents['schemas']['DurableApproval'];
export type DurableApprovalStatus = GeneratedComponents['schemas']['DurableApprovalStatus'];
export type DurableApprovalStats = GeneratedComponents['schemas']['DurableApprovalStats'];
export type PaginatedDurableApprovals = GeneratedComponents['schemas']['PaginatedDurableApprovals'];

export interface DurableApprovalListOptions {
  status?: DurableApprovalStatus;
  /** Durable function name, or its id. */
  function?: string;
  executionId?: string;
  /** RFC 3339 timestamps bounding when the approval was requested. */
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}

export interface DurableApprovalStatsOptions {
  /** Durable function name, or its id. */
  function?: string;
  /** RFC 3339 window. Defaults to the last 30 days; at most 366 days. */
  from?: string;
  to?: string;
}

/**
 * Read and decide a project's approvals. Owner-scoped like `durable.get`:
 * reading accepts the owner's platform user token or a project access token,
 * while approving and denying take a person, so a project access token is
 * refused with 403.
 */
export interface DurableApprovals {
  /**
   * List approvals, most recent first.
   *
   * @example
   * ```typescript
   * const { data } = await volcano.durable.approvals.list(projectId, { status: 'pending' });
   * for (const approval of data?.data ?? []) {
   *   console.log(approval.id, approval.title);
   * }
   * ```
   */
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

  /** Counts, approval rate, and decision times over a window. */
  stats(
    projectId: string,
    options?: DurableApprovalStatsOptions,
  ): Promise<{
    data: DurableApprovalStats | null;
    status: number | null;
    error: Error | null;
  }>;

  /**
   * Approve, resuming the execution with `approved: true`. Repeating the same
   * decision returns the approval unchanged; a conflicting one, or deciding an
   * approval that expired or was cancelled, fails with 409.
   *
   * @example
   * ```typescript
   * const { error } = await volcano.durable.approvals.approve(projectId, approvalId, {
   *   comment: 'Checked the address',
   * });
   * ```
   */
  approve(
    projectId: string,
    approvalId: string,
    options?: { comment?: string },
  ): Promise<{
    data: DurableApproval | null;
    status: number | null;
    error: Error | null;
  }>;

  /** Deny, resuming the execution with `approved: false`. Same rules as `approve`. */
  deny(
    projectId: string,
    approvalId: string,
    options?: { comment?: string },
  ): Promise<{
    data: DurableApproval | null;
    status: number | null;
    error: Error | null;
  }>;
}
