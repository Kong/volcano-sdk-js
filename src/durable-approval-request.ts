import { apiRequestError } from './api-errors.ts';
import type { components } from './generated/openapi';
import { safeJsonParse } from './response-json.ts';

export type ApprovalRequest = components['schemas']['RequestDurableApprovalRequest'];

interface Failure {
  error: Error;
  retryable: boolean;
}

const REQUEST_TIMEOUT_MS = 10_000;
// Half a second doubling to a 5 second cap, ending where 30 seconds run out.
const RETRY_DELAYS_MS = [500, 1000, 2000, 4000, 5000, 5000, 5000, 5000, 2500];

/**
 * Register the approval with Volcano. Registration can briefly lag the
 * workflow opening it, so not-ready, throttled, and unavailable answers are
 * retried for about 30 seconds; any other refusal is final.
 */
export async function requestApproval(apiUrl: string, request: ApprovalRequest): Promise<void> {
  const url = `${apiUrl.replace(/\/$/, '')}/durable-approvals`;
  const body = JSON.stringify(request);
  for (const delay of RETRY_DELAYS_MS) {
    const failure = await send(url, body);
    if (failure === null) {
      return;
    }
    if (!failure.retryable) {
      throw failure.error;
    }
    await sleep(delay);
  }
  const failure = await send(url, body);
  if (failure !== null) {
    throw failure.error;
  }
}

async function send(url: string, body: string): Promise<Failure | null> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (cause) {
    return {
      error: new Error('Could not reach Volcano to request the approval', { cause }),
      retryable: true,
    };
  }
  return response.ok ? null : refusal(response);
}

async function refusal(response: Response): Promise<Failure> {
  const data = await safeJsonParse(response);
  const error = apiRequestError(response, data);
  error.message = `Volcano refused the approval request (${String(response.status)}): ${error.message}`;
  return { error, retryable: isRetryable(response.status, error.code) };
}

function isRetryable(status: number, code: string | undefined): boolean {
  return status === 429 || status >= 500 || (status === 409 && code === 'approval_not_ready');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
