import { apiRequestError } from './api-errors.ts';
import type { components } from './generated/openapi';
import { safeJsonParse } from './response-json.ts';

export type ApprovalRequest = components['schemas']['RequestDurableApprovalRequest'];

interface Failure {
  error: Error;
  retryable: boolean;
}

const REGISTRATION_DEADLINE_MS = 30_000;
const REQUEST_TIMEOUT_MS = 10_000;
// Half a second doubling to a 5 second cap.
const RETRY_DELAYS_MS = [500, 1000, 2000, 4000, 5000, 5000, 5000, 5000];

/**
 * Register the approval with Volcano. Registration can briefly lag the
 * workflow opening it, so unknown-execution, not-ready, throttled, and
 * unavailable answers are retried for up to 30 seconds; any other refusal is
 * final.
 */
export async function requestApproval(apiUrl: string, request: ApprovalRequest): Promise<void> {
  const url = `${apiUrl.replace(/\/$/, '')}/durable-approvals`;
  const body = JSON.stringify(request);
  const deadline = Date.now() + REGISTRATION_DEADLINE_MS;
  let failure = await send(url, body, REQUEST_TIMEOUT_MS);
  for (const delay of RETRY_DELAYS_MS) {
    if (failure === null) {
      return;
    }
    const timeout = await retryTimeout(failure, delay, deadline);
    if (timeout === null) {
      break;
    }
    failure = await send(url, body, timeout);
  }
  if (failure !== null) {
    throw failure.error;
  }
}

// Waits out the delay and answers how long the next attempt may take, or null
// when the failure is final or no time would be left for another attempt.
async function retryTimeout(
  failure: Failure,
  delay: number,
  deadline: number,
): Promise<number | null> {
  if (!failure.retryable || deadline - Date.now() <= delay) {
    return null;
  }
  await sleep(delay);
  const remaining = deadline - Date.now();
  return remaining > 0 ? Math.min(REQUEST_TIMEOUT_MS, remaining) : null;
}

async function send(url: string, body: string, timeout: number): Promise<Failure | null> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      signal: AbortSignal.timeout(timeout),
    });
  } catch (cause) {
    return {
      error: new Error(`Could not reach Volcano to request the approval: ${reasons(cause)}`, {
        cause,
      }),
      retryable: true,
    };
  }
  return response.ok ? null : refusal(response);
}

// The runtime rethrows a failed registration with only its message, so the
// message carries what the caller would otherwise read from the cause or code.
// Read by field rather than instanceof: a fetch timeout is a DOMException.
function reasons(cause: unknown): string {
  const failure = new Object(cause);
  const message: unknown = Reflect.get(failure, 'message');
  if (typeof message !== 'string') {
    return String(cause);
  }
  const inner: unknown = Reflect.get(failure, 'cause');
  if (inner === undefined) {
    return message;
  }
  return `${message}: ${reasons(inner)}`;
}

async function refusal(response: Response): Promise<Failure | null> {
  const data = await safeJsonParse(response);
  const error = apiRequestError(response, data);
  // The callback stopped waiting before registration landed, normally because
  // its timeout passed; the runtime resolves it with that outcome.
  if (response.status === 409 && error.code === 'approval_closed') {
    return null;
  }
  error.message = `Volcano refused the approval request (${refusalLabel(response.status, error.code)}): ${error.message}`;
  return { error, retryable: isRetryable(response.status, error.code) };
}

function refusalLabel(status: number, code: string | undefined): string {
  if (code === undefined) {
    return String(status);
  }
  return `${String(status)} ${code}`;
}

// Volcano records an execution only after starting it, so an approval opened
// first thing can briefly name an execution it does not know yet.
function isRetryable(status: number, code: string | undefined): boolean {
  return (
    status === 404 ||
    status === 429 ||
    status >= 500 ||
    (status === 409 && code === 'approval_not_ready')
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
