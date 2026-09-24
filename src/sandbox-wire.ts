import type {
  SandboxAccess,
  SandboxCommandResult,
  SandboxCreateOptions,
  SandboxExecutionResult,
  SandboxPreset,
  SandboxState,
} from './index.js';

export function record(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new TypeError('Invalid Sandbox response');
  }
  return value;
}
export function text(value: unknown): string {
  if (typeof value !== 'string') {
    throw new TypeError('Invalid Sandbox text field');
  }
  return value;
}
function number(value: unknown): number {
  if (!Number.isFinite(value)) {
    throw new TypeError('Invalid Sandbox numeric field');
  }
  return Number(value);
}
function flag(value: unknown): boolean {
  if (typeof value !== 'boolean') {
    throw new TypeError('Invalid Sandbox flag');
  }
  return value;
}
export function commandResult(value: unknown): SandboxCommandResult {
  const data = record(value);
  return {
    stdout: text(data['stdout']),
    stderr: text(data['stderr']),
    exitCode: number(data['exit_code']),
    timedOut: flag(data['timed_out']),
    stdoutTruncated: flag(data['stdout_truncated']),
    stderrTruncated: flag(data['stderr_truncated']),
  };
}
export function executionResult(value: unknown): SandboxExecutionResult {
  const data = record(value);
  return {
    ...commandResult(data),
    sessionId: text(data['session_id']),
    region: text(data['region']),
    durationMs: number(data['duration_ms']),
  };
}
const states: readonly SandboxState[] = [
  'starting',
  'running',
  'suspending',
  'suspended',
  'resuming',
  'terminating',
  'terminated',
  'unknown',
];
export function sessionState(value: unknown): SandboxState {
  const result = states.find((state) => state === value);
  if (result === undefined) {
    throw new TypeError('Invalid Sandbox state');
  }
  return result;
}
export function createRequest(
  options: SandboxCreateOptions,
): import('./generated/model/createSandboxSessionRequest.ts').CreateSandboxSessionRequest {
  if ((options.preset === undefined) === (options.sandboxId === undefined)) {
    throw new TypeError('Choose exactly one preset or sandboxId');
  }
  return {
    region: options.region,
    ...(options.preset === undefined ? {} : { preset: options.preset }),
    ...(options.sandboxId === undefined ? {} : { sandbox_id: options.sandboxId }),
    ...(options.memoryMB === undefined ? {} : { memory_mb: options.memoryMB }),
  };
}
export function accessResult(value: unknown): SandboxAccess {
  const data = record(value);
  return {
    url: text(data['url']),
    token: text(data['token']),
    expiresAt: text(data['expires_at']),
  };
}
export function presetsResult(value: unknown): SandboxPreset[] {
  const data = record(value);
  if (!Array.isArray(data['data'])) {
    throw new TypeError('Invalid Sandbox preset catalog');
  }
  return data['data'].map((value: unknown) => {
    const preset = record(value);
    if (!Array.isArray(preset['regions'])) {
      throw new TypeError('Invalid Sandbox regions');
    }
    return {
      id: text(preset['id']),
      memoryMB: number(preset['memory_mb']),
      regions: preset['regions'].map((region: unknown) => text(region)),
    };
  });
}
export function decodeBytes(value: unknown): Uint8Array {
  return Uint8Array.from(atob(text(record(value)['data'])), (character) =>
    Number(character.codePointAt(0)),
  );
}
export function encodeBytes(data: Uint8Array): string {
  if (data.byteLength > 8 * 1024 * 1024) {
    throw new RangeError('Sandbox files are limited to 8 MiB');
  }
  let binary = '';
  for (const byte of data) {
    binary += String.fromCodePoint(byte);
  }
  return btoa(binary);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function sessionRequest(
  options: SandboxCreateOptions,
): import('./generated/model/createSandboxSessionRequest.ts').CreateSandboxSessionRequest {
  return {
    ...createRequest(options),
    ...(options.maxDurationSeconds === undefined
      ? {}
      : { max_duration_seconds: options.maxDurationSeconds }),
    ...(options.idleTimeoutSeconds === undefined
      ? {}
      : { idle_timeout_seconds: options.idleTimeoutSeconds }),
  };
}
