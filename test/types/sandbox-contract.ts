import type { SandboxCreateOptions, SandboxExecOptions, SandboxSession } from '../../src/index.ts';

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
