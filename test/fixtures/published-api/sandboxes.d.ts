export type SandboxResult<T> = { data: T; error: null } | { data: null; error: Error };
export interface SandboxRequestOptions {
  signal?: AbortSignal;
}
export interface SandboxReplayOptions extends SandboxRequestOptions {
  requestId?: string;
}
export interface SandboxSelectionOptions extends SandboxReplayOptions {
  preset?: string;
  sandboxId?: string;
  region: string;
  memoryMB?: number;
}
export interface SandboxCreateOptions extends SandboxSelectionOptions {
  maxDurationSeconds?: number;
  idleTimeoutSeconds?: number;
}
export interface SandboxExecOptions extends SandboxSelectionOptions {
  timeoutSeconds?: number;
  environment?: Record<string, string>;
}
export interface SandboxCommandOptions extends SandboxReplayOptions {
  timeoutSeconds?: number;
  environment?: Record<string, string>;
}
export interface SandboxCommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  timedOut: boolean;
  stdoutTruncated: boolean;
  stderrTruncated: boolean;
}
export interface SandboxExecutionResult extends SandboxCommandResult {
  sessionId: string;
  region: string;
  durationMs: number;
}
export type SandboxState =
  | 'starting'
  | 'running'
  | 'suspending'
  | 'suspended'
  | 'resuming'
  | 'terminating'
  | 'terminated'
  | 'unknown';
export interface SandboxAccess {
  url: string;
  token: string;
  expiresAt: string;
}
export interface SandboxSession extends AsyncDisposable {
  readonly id: string;
  readonly projectId: string;
  readonly region: string;
  readonly state: SandboxState;
  readonly expiresAt: string;
  refresh(options?: SandboxRequestOptions): Promise<SandboxResult<SandboxSession>>;
  exec(command: string, options?: SandboxCommandOptions): Promise<SandboxResult<SandboxCommandResult>>;
  suspend(options?: SandboxRequestOptions): Promise<SandboxResult<SandboxSession>>;
  resume(options?: SandboxRequestOptions): Promise<SandboxResult<SandboxSession>>;
  terminate(options?: SandboxRequestOptions): Promise<SandboxResult<SandboxSession>>;
  access(port: number, options?: SandboxRequestOptions): Promise<SandboxResult<SandboxAccess>>;
  files: {
    read(path: string, options?: SandboxRequestOptions): Promise<SandboxResult<Uint8Array>>;
    write(path: string, data: Uint8Array, options?: SandboxRequestOptions): Promise<SandboxResult<void>>;
  };
}
export interface SandboxPreset {
  id: string;
  memoryMB: number;
  regions: string[];
}
export interface SandboxDeployOptions extends SandboxReplayOptions {
  name: string;
  memoryMB?: 1024 | 2048;
  ports?: number[];
}
export interface SandboxDeployment {
  id: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}
export interface SandboxDeploymentPage {
  data: SandboxDeployment[];
  pagination: { limit: number; hasMore: boolean; nextCursor?: string };
}
export interface SandboxDeploymentListOptions extends SandboxRequestOptions {
  cursor?: string;
  limit?: number;
}
export interface SandboxBuildLogOptions extends SandboxRequestOptions {
  region: string;
  cursor?: string;
  limit?: number;
}
export interface SandboxBuildLogPage {
  data: { timestamp: string; message: string }[];
  nextCursor?: string;
}
export interface Sandboxes {
  deleteTemplate(projectId: string, sandboxId: string, options?: SandboxRequestOptions): Promise<SandboxResult<void>>;
  logs(
    projectId: string,
    sandboxId: string,
    deploymentId: string,
    options: SandboxBuildLogOptions,
  ): Promise<SandboxResult<SandboxBuildLogPage>>;
  deploy(
    projectId: string,
    sandboxId: string,
    source: Uint8Array,
    options: SandboxDeployOptions,
  ): Promise<SandboxResult<SandboxDeployment>>;
  deployments(
    projectId: string,
    sandboxId: string,
    options?: SandboxDeploymentListOptions,
  ): Promise<SandboxResult<SandboxDeploymentPage>>;
  deployment(
    projectId: string,
    sandboxId: string,
    deploymentId: string,
    options?: SandboxRequestOptions,
  ): Promise<SandboxResult<SandboxDeployment>>;
  source(
    projectId: string,
    sandboxId: string,
    deploymentId: string,
    options?: SandboxRequestOptions,
  ): Promise<SandboxResult<Uint8Array>>;
  presets(options?: SandboxRequestOptions): Promise<SandboxResult<SandboxPreset[]>>;
  exec(projectId: string, command: string, options: SandboxExecOptions): Promise<SandboxResult<SandboxExecutionResult>>;
  create(projectId: string, options: SandboxCreateOptions): Promise<SandboxResult<SandboxSession>>;
  get(sessionId: string, options?: SandboxRequestOptions): Promise<SandboxResult<SandboxSession>>;
  grant(
    sessionId: string,
    authUserId: string,
    expiresAt: string,
    options?: SandboxRequestOptions,
  ): Promise<SandboxResult<void>>;
  revoke(sessionId: string, authUserId: string, options?: SandboxRequestOptions): Promise<SandboxResult<void>>;
}
