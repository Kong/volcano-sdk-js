import { apiRequestError } from './api-errors.ts';

/** A request a workflow makes to Volcano's runtime routes. */
export interface PlatformRequest {
  /** Path under the platform API URL, such as `/durable-approvals`. */
  path: string;
  body: unknown;
  headers?: Record<string, string>;
  /** Ends "Could not reach Volcano to …", such as `request the approval`. */
  action: string;
  /** Ends "Volcano refused …", such as `the approval request`. */
  subject: string;
  /**
   * Whether the caller reads the answer. A registration does not, so an
   * accepted request settles without waiting for its body.
   */
  readsAnswer?: boolean;
  /** The conflict code for a callback Volcano cannot see waiting yet. */
  notReadyCode?: string;
  /**
   * The conflict code for a callback that stopped waiting before the request
   * landed, normally because its timeout passed. The runtime resolves the
   * callback with that outcome, so the request answers `undefined`.
   */
  closedCode?: string;
}

interface Failure {
  error: Error;
  retryable: boolean;
}

type Outcome = { body: unknown; failure?: never } | { failure: Failure };

const DEADLINE_MS = 30_000;
const REQUEST_TIMEOUT_MS = 10_000;
// Half a second doubling to a 5 second cap.
const RETRY_DELAYS_MS = [500, 1000, 2000, 4000, 5000, 5000, 5000, 5000];

/**
 * Send the request and resolve with the response body. Volcano can briefly
 * lag the workflow, so unknown-execution, not-ready, throttled, and
 * unavailable answers are retried for up to 30 seconds; any other refusal is
 * final.
 */
export async function postToPlatform(apiUrl: string, request: PlatformRequest): Promise<unknown> {
  const url = `${apiUrl.replace(/\/$/, '')}${request.path}`;
  const init = {
    headers: { 'Content-Type': 'application/json', ...request.headers },
    body: JSON.stringify(request.body),
  };
  const deadline = Date.now() + DEADLINE_MS;
  let outcome = await send(url, init, request, REQUEST_TIMEOUT_MS);
  for (const delay of RETRY_DELAYS_MS) {
    if (outcome.failure === undefined) {
      return outcome.body;
    }
    const timeout = await retryTimeout(outcome.failure, delay, deadline);
    if (timeout === null) {
      break;
    }
    outcome = await send(url, init, request, timeout);
  }
  if (outcome.failure !== undefined) {
    throw outcome.failure.error;
  }
  return outcome.body;
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

async function send(
  url: string,
  init: { headers: Record<string, string>; body: string },
  request: PlatformRequest,
  timeout: number,
): Promise<Outcome> {
  // The timeout covers reading the body too, so a body that stalls is a
  // transport failure like one that never starts.
  try {
    const response = await fetch(url, {
      method: 'POST',
      ...init,
      signal: AbortSignal.timeout(timeout),
    });
    if (response.ok && request.readsAnswer !== true) {
      await release(response);
      return settled();
    }
    const data = jsonOf(await response.text());
    return response.ok ? settled(data) : refusal(response, data, request);
  } catch (cause) {
    return {
      failure: {
        error: new Error(`Could not reach Volcano to ${request.action}: ${reasons(cause)}`, {
          cause,
        }),
        retryable: true,
      },
    };
  }
}

// An unread body holds its connection until it is collected.
async function release(response: Response): Promise<void> {
  await response.body?.cancel().catch(() => {
    // Volcano already answered; failing to let go of the answer is no reason
    // to send the request again.
  });
}

function settled(body?: unknown): Outcome {
  return { body };
}

// A refusal whose body is not JSON still reports its status.
function jsonOf(text: string): unknown {
  let value: unknown = {};
  try {
    value = JSON.parse(text);
  } catch {
    // Read as an empty body.
  }
  return value;
}

// The runtime rethrows a failed submitter with only its message, so the
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

function refusal(response: Response, data: unknown, request: PlatformRequest): Outcome {
  const error = apiRequestError(response, data);
  const conflict = response.status === 409 ? error.code : undefined;
  if (isCode(conflict, request.closedCode)) {
    return settled();
  }
  error.message = `Volcano refused ${request.subject} (${refusalLabel(response.status, error.code)}): ${error.message}`;
  return {
    failure: {
      error,
      retryable: isRetryable(response.status) || isCode(conflict, request.notReadyCode),
    },
  };
}

// A request without the code expects none, so an uncoded conflict is not it.
function isCode(code: string | undefined, expected: string | undefined): boolean {
  return code !== undefined && code === expected;
}

function refusalLabel(status: number, code: string | undefined): string {
  if (code === undefined) {
    return String(status);
  }
  return `${String(status)} ${code}`;
}

// Volcano records an execution only after starting it, so a request made first
// thing can briefly name an execution it does not know yet.
function isRetryable(status: number): boolean {
  return status === 404 || status === 429 || status >= 500;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
