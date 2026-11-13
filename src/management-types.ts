/** Explicit control-plane credential. Construction performs no network requests. */
export interface ManagementClientOptions {
  token: string;
  apiUrl?: string;
  timeoutMs?: number;
}

export interface GitRequestOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
}

export interface GitReadOptions extends GitRequestOptions {
  projectId?: string;
}

export interface GitRepositoryListOptions extends GitRequestOptions {
  limit?: number;
  cursor?: string;
  endingBefore?: string;
}

export interface GitRefSelector {
  type: 'branch' | 'tag';
  name: string;
}

export type GitRevisionSelector = GitRefSelector | { type: 'commit'; oid: string; witness: GitRefSelector };

export interface GitReadCapability {
  operation: string;
  available: boolean;
  unavailableReason: string | null;
}

export interface GitRepository {
  id: string;
  projectId: string;
  name: string;
  provider: string;
  createdAt: string;
  binding: { rootDirectory: string; productionBranch: string | null } | null;
  capabilities: GitReadCapability[];
}

export interface GitRepositoryPage {
  repositories: GitRepository[];
  limit: number;
  hasMore: boolean;
  nextCursor?: string;
  prevCursor?: string;
}

/** Opaque, reauthorized read context; it does not retain source. */
export interface GitRevision {
  id: string;
  projectId: string;
  resource: { type: 'repository'; id: string; name: string };
  commitOid: string;
  treeOid: string;
}

export type ManagementResult<T> = { data: T; error: null } | { data: null; error: Error };
