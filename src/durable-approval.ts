import { type ApprovalRequest, requestApproval } from './durable-approval-request.ts';
import { waitDuration } from './durable-duration.ts';
import type { ApprovalDecider, ApprovalDecision } from './durable-types.ts';

type Submitter = (callbackId: string) => Promise<void>;
type RequestFields = Omit<ApprovalRequest, 'execution_ref' | 'callback_id'>;

export interface CallbackContext {
  waitForCallback?: (
    name: string,
    submitter: Submitter,
    config: Record<string, unknown>,
  ) => Promise<unknown>;
}

const MAX_NAME_LENGTH = 255;
const MAX_TITLE_LENGTH = 200;
const MAX_DESCRIPTION_LENGTH = 4000;
const MAX_REQUEST_BYTES = 64 * 1024;
// The runtime picks the callback id only once the callback is open, so the
// size check allows for the longest one Volcano accepts.
const LONGEST_CALLBACK_ID = 'x'.repeat(1024);

/**
 * Open a callback, register it with Volcano as an approval, and resolve with
 * the decision. Registration runs inside the runtime's checkpointed submitter,
 * so a replay never registers the same approval twice.
 */
export async function waitForApproval(
  context: CallbackContext,
  executionRef: string | undefined,
  name: unknown,
  options: unknown,
): Promise<ApprovalDecision> {
  if (!isRecord(options)) {
    throw new TypeError('ctx.waitForApproval() requires options with a title');
  }
  const fields = requestFields(name, options);
  const config = callbackConfig(options['timeout']);
  const apiUrl = platformApiUrl();
  const execution = requiredExecutionRef(executionRef);
  withinRequestLimit({ execution_ref: execution, callback_id: LONGEST_CALLBACK_ID, ...fields });
  const waitForCallback = context.waitForCallback;
  if (typeof waitForCallback !== 'function') {
    throw new TypeError(
      'The durable runtime does not support approvals; redeploy the function so Volcano installs a current one',
    );
  }
  const submit: Submitter = (callbackId) =>
    requestApproval(apiUrl, { execution_ref: execution, callback_id: callbackId, ...fields });
  try {
    return decision(await Reflect.apply(waitForCallback, context, [fields.name, submit, config]));
  } catch (error) {
    if (isCallbackTimeout(error)) {
      return expired();
    }
    throw error;
  }
}

function requestFields(name: unknown, options: Record<string, unknown>): RequestFields {
  return {
    name: requiredText(name, 'name', MAX_NAME_LENGTH),
    title: requiredText(options['title'], 'title', MAX_TITLE_LENGTH),
    ...description(options['description']),
    ...details(options['details']),
  };
}

function requiredText(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new TypeError(`ctx.waitForApproval() requires a non-empty ${field}`);
  }
  return withinLength(value, field, maxLength);
}

function description(value: unknown): { description?: string } {
  if (value === undefined) {
    return {};
  }
  if (typeof value !== 'string') {
    throw new TypeError('ctx.waitForApproval() description must be a string');
  }
  return { description: withinLength(value, 'description', MAX_DESCRIPTION_LENGTH) };
}

// Volcano counts characters as code points, not UTF-16 units.
function withinLength(value: string, field: string, maxLength: number): string {
  if (Array.from(value).length > maxLength) {
    throw new TypeError(
      `ctx.waitForApproval() ${field} must be at most ${String(maxLength)} characters`,
    );
  }
  return value;
}

// Send a snapshot, so details that change later, or serialize differently a
// second time, cannot slip past the size check.
function details(value: unknown): { details?: unknown } {
  if (value === undefined) {
    return {};
  }
  // A function or symbol serializes to nothing rather than throwing.
  let text: unknown;
  try {
    text = JSON.stringify(value);
  } catch (cause) {
    throw notJson({ cause });
  }
  if (typeof text !== 'string') {
    throw notJson();
  }
  const snapshot: unknown = JSON.parse(text);
  return { details: snapshot };
}

function notJson(options?: ErrorOptions): TypeError {
  return new TypeError('ctx.waitForApproval() details must be serializable as JSON', options);
}

function withinRequestLimit(request: ApprovalRequest): void {
  if (new TextEncoder().encode(JSON.stringify(request)).byteLength > MAX_REQUEST_BYTES) {
    throw new TypeError('ctx.waitForApproval() request must be at most 64 KiB, details included');
  }
}

// The submitter retries what is worth retrying. Left unset, the engine would
// also retry a refusal that cannot succeed.
function callbackConfig(timeout: unknown): Record<string, unknown> {
  const config: Record<string, unknown> = { retryStrategy: () => ({ shouldRetry: false }) };
  if (timeout !== undefined) {
    config['timeout'] = waitDuration(timeout, 'timeout');
  }
  return config;
}

function platformApiUrl(): string {
  const url = process.env['VOLCANO_PLATFORM_API_URL']?.trim() ?? '';
  if (url === '') {
    throw new Error(
      'ctx.waitForApproval() needs VOLCANO_PLATFORM_API_URL, which Volcano sets on durable functions. Deploy this function as durable to request approvals.',
    );
  }
  return url;
}

function requiredExecutionRef(executionRef: string | undefined): string {
  if (executionRef === undefined) {
    throw new Error(
      'ctx.waitForApproval() cannot tell which execution is running: the durable runtime did not report it',
    );
  }
  return executionRef;
}

function decision(result: unknown): ApprovalDecision {
  const value = typeof result === 'string' ? parseJson(result) : result;
  if (!isRecord(value)) {
    throw unreadableDecision();
  }
  const { status } = value;
  if (!isDecisionStatus(status)) {
    throw unreadableDecision();
  }
  return {
    approved: status === 'approved',
    status,
    comment: stringOr(value['comment'], ''),
    decidedBy: decider(value['decided_by']),
    decidedAt: timestamp(value['decided_at']),
  };
}

function stringOr<Fallback>(value: unknown, fallback: Fallback): string | Fallback {
  return typeof value === 'string' ? value : fallback;
}

// RFC 3339, the form Volcano writes. Date.parse alone accepts looser text,
// such as a bare year.
const DATE = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/;
const TIME = /^(?:[01]\d|2[0-3])(?::[0-5]\d){2}(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/;

function timestamp(value: unknown): string | null {
  return typeof value === 'string' && isTimestamp(value) ? value : null;
}

function isTimestamp(value: string): boolean {
  const day = value.slice(0, 10);
  if (value[10] !== 'T' || !DATE.test(day) || !TIME.test(value.slice(11))) {
    return false;
  }
  // Date rolls an impossible day, such as February 30, into the next month.
  return new Date(`${day}T00:00:00Z`).toISOString().startsWith(day);
}

function unreadableDecision(options?: ErrorOptions): TypeError {
  return new TypeError(
    'Volcano resumed the approval with a decision this SDK cannot read',
    options,
  );
}

function parseJson(text: string): unknown {
  try {
    const value: unknown = JSON.parse(text);
    return value;
  } catch (cause) {
    throw unreadableDecision({ cause });
  }
}

function isDecisionStatus(value: unknown): value is 'approved' | 'denied' {
  return value === 'approved' || value === 'denied';
}

function decider(value: unknown): ApprovalDecider | null {
  if (!isRecord(value) || typeof value['id'] !== 'string' || typeof value['email'] !== 'string') {
    return null;
  }
  return { id: value['id'], email: value['email'] };
}

// The runtime rebuilds its errors from their recorded type on replay, so the
// type name is what identifies a timeout both live and replayed.
function isCallbackTimeout(error: unknown): boolean {
  return isRecord(error) && error['errorType'] === 'CallbackTimeoutError';
}

function expired(): ApprovalDecision {
  return { approved: false, status: 'expired', comment: '', decidedBy: null, decidedAt: null };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
