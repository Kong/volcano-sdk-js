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
  let failure = await send(url, body, deadline);
  for (const delay of RETRY_DELAYS_MS) {
    if (failure === null) {
      return;
    }
    if (!(await waitedToRetry(failure, delay, deadline))) {
      break;
    }
    failure = await send(url, body, deadline);
  }
  if (failure !== null) {
    throw failure.error;
  }
}

// Waits out the delay, unless the failure is final or waiting would leave no
// time for another attempt.
async function waitedToRetry(failure: Failure, delay: number, deadline: number): Promise<boolean> {
  if (!failure.retryable || deadline - Date.now() <= delay) {
    return false;
  }
  await sleep(delay);
  return Date.now() < deadline;
}

async function send(url: string, body: string, deadline: number): Promise<Failure | null> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      signal: AbortSignal.timeout(Math.min(REQUEST_TIMEOUT_MS, deadline - Date.now())),
    });
  } catch (cause) {
    return {
      error: new Error('Could not reach Volcano to request the approval', { cause }),
      retryable: true,
    };
  }
  return response.ok ? null : refusal(response);
}

async function refusal(response: Response): Promise<Failure | null> {
  const data = await safeJsonParse(response);
  const error = apiRequestError(response, data);
  // The callback stopped waiting before registration landed, normally because
  // its timeout passed; the runtime resolves it with that outcome.
  if (response.status === 409 && error.code === 'approval_closed') {
    return null;
  }
  error.message = `Volcano refused the approval request (${String(response.status)}): ${error.message}`;
  return { error, retryable: isRetryable(response.status, error.code) };
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
