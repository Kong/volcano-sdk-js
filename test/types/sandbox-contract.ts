import type { SandboxCreateOptions, SandboxExecOptions, SandboxSession } from '../../src/index.js';

const sessionOptions: SandboxCreateOptions = {
  preset: 'python3.12',
  region: 'aws-us-east-1',
  maxDurationSeconds: 300,
  idleTimeoutSeconds: 60,
};
const executionOptions: SandboxExecOptions = {
  preset: 'python3.12',
  region: 'aws-us-east-1',
  timeoutSeconds: 30,
};
const invalidExecutionLifetime: SandboxExecOptions = {
  region: 'aws-us-east-1',
  // @ts-expect-error Session lifetime does not apply to one-shot execution.
  maxDurationSeconds: 300,
};
const invalidExecutionIdle: SandboxExecOptions = {
  region: 'aws-us-east-1',
  // @ts-expect-error Idle timeout does not apply to one-shot execution.
  idleTimeoutSeconds: 60,
};
declare const session: SandboxSession;
const disposable: AsyncDisposable = session;
void [sessionOptions, executionOptions, invalidExecutionLifetime, invalidExecutionIdle, disposable];
