import type {
  SandboxCreateOptions,
  Sandboxes,
  SandboxExecOptions,
  SandboxSession,
} from '../../src/index.ts';

export const sessionOptions: SandboxCreateOptions = {
  preset: 'python3.12',
  region: 'aws-us-east-1',
  maxDurationSeconds: 300,
  idleTimeoutSeconds: 60,
};
export const executionOptions: SandboxExecOptions = {
  preset: 'python3.12',
  region: 'aws-us-east-1',
  timeoutSeconds: 30,
};
export const invalidExecutionLifetime: SandboxExecOptions = {
  region: 'aws-us-east-1',
  // @ts-expect-error Session lifetime does not apply to one-shot execution.
  maxDurationSeconds: 300,
};
export const invalidExecutionIdle: SandboxExecOptions = {
  region: 'aws-us-east-1',
  // @ts-expect-error Idle timeout does not apply to one-shot execution.
  idleTimeoutSeconds: 60,
};
declare const session: SandboxSession;
export const disposable: AsyncDisposable = session;

declare const sandboxes: Sandboxes;
const requestId = '33333333-3333-4333-8333-333333333333';
export const replayableRequests = [
  sandboxes.create('project', { ...sessionOptions, requestId }),
  sandboxes.exec('project', 'true', { ...executionOptions, requestId }),
  session.exec('true', { requestId }),
];
export const nonReplayableRequests = [
  // @ts-expect-error The public catalog does not support idempotency keys.
  sandboxes.presets({ requestId }),
  // @ts-expect-error Session lookup does not support idempotency keys.
  sandboxes.get('session', { requestId }),
  // @ts-expect-error Refresh does not support idempotency keys.
  session.refresh({ requestId }),
  // @ts-expect-error Suspend does not support idempotency keys.
  session.suspend({ requestId }),
  // @ts-expect-error Resume does not support idempotency keys.
  session.resume({ requestId }),
  // @ts-expect-error Termination does not support idempotency keys.
  session.terminate({ requestId }),
  // @ts-expect-error Access credentials do not support idempotency keys.
  session.access(8080, { requestId }),
  // @ts-expect-error File reads do not support idempotency keys.
  session.files.read('/workspace/file', { requestId }),
  // @ts-expect-error File writes do not support idempotency keys.
  session.files.write('/workspace/file', new Uint8Array(), { requestId }),
  // @ts-expect-error Grants do not support idempotency keys.
  sandboxes.grant('session', 'user', '2026-10-06T00:00:00Z', { requestId }),
  // @ts-expect-error Revocation does not support idempotency keys.
  sandboxes.revoke('session', 'user', { requestId }),
];
