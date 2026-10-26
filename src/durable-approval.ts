import {
  callbackConfig,
  type CallbackContext,
  callbackResult,
  callbacks,
  isCallbackTimeout,
  isRecord,
  MAX_NAME_LENGTH,
  OPERATION_NAME,
  platformApiUrl,
  requiredExecutionRef,
  type Submitter,
} from './durable-callback.ts';
import { postToPlatform } from './durable-platform-request.ts';
import type { ApprovalDecider, ApprovalDecision } from './durable-types.ts';
import type { components } from './generated/openapi';

type ApprovalRequest = components['schemas']['RequestDurableApprovalRequest'];
type RequestFields = Omit<ApprovalRequest, 'execution_ref' | 'callback_id'>;

const OPERATION = 'ctx.waitForApproval()';
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
  const apiUrl = platformApiUrl(OPERATION, 'request approvals');
  const execution = requiredExecutionRef(OPERATION, executionRef);
  withinRequestLimit({ execution_ref: execution, callback_id: LONGEST_CALLBACK_ID, ...fields });
  const waitForCallback = callbacks(context, 'approvals');
  const submit: Submitter = async (callbackId) => {
    await postToPlatform(apiUrl, {
      path: '/durable-approvals',
      body: { execution_ref: execution, callback_id: callbackId, ...fields },
      action: 'request the approval',
      subject: 'the approval request',
      notReadyCode: 'approval_not_ready',
      closedCode: 'approval_closed',
    });
  };
  try {
    return decision(await waitForCallback(fields.name, submit, config));
  } catch (error) {
    if (isCallbackTimeout(error)) {
      return expired();
    }
    throw error;
  }
}

function requestFields(name: unknown, options: Record<string, unknown>): RequestFields {
  return {
    name: operationName(name),
    title: requiredText(options['title'], 'title', MAX_TITLE_LENGTH),
    ...description(options['description']),
    ...details(options['details']),
  };
}

function operationName(value: unknown): string {
  const name = requiredText(value, 'name', MAX_NAME_LENGTH);
  if (!OPERATION_NAME.test(name)) {
    throw new TypeError('ctx.waitForApproval() name must be printable ASCII');
  }
  return name;
}

function requiredText(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new TypeError(`ctx.waitForApproval() requires a non-empty ${field}`);
  }
  return checkedText(value, field, maxLength);
}

function description(value: unknown): { description?: string } {
  if (value === undefined) {
    return {};
  }
  if (typeof value !== 'string') {
    throw new TypeError('ctx.waitForApproval() description must be a string');
  }
  return { description: checkedText(value, 'description', MAX_DESCRIPTION_LENGTH) };
}

// Volcano counts characters as code points, not UTF-16 units, and refuses NUL.
function checkedText(value: string, field: string, maxLength: number): string {
  if (Array.from(value).length > maxLength) {
    throw new TypeError(`ctx.waitForApproval() ${field} must be at most ${String(maxLength)} characters`);
  }
  if (value.includes('\0')) {
    throw noNul(field);
  }
  return value;
}

function noNul(field: string): TypeError {
  return new TypeError(`ctx.waitForApproval() ${field} must not contain NUL characters`);
}

function hasNul(value: unknown): boolean {
  if (typeof value === 'string') {
    return value.includes('\0');
  }
  if (!isRecord(value)) {
    return false;
  }
  return Object.entries(value).some(([key, item]) => key.includes('\0') || hasNul(item));
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
  if (hasNul(snapshot)) {
    throw noNul('details');
  }
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

function decision(result: unknown): ApprovalDecision {
  const value = callbackResult(result, unreadableDecision);
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
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3])(?::[0-5]\d){2}(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/;

function timestamp(value: unknown): string | null {
  return typeof value === 'string' && isTimestamp(value) ? value : null;
}

function isTimestamp(value: string): boolean {
  const day = value.slice(0, 10);
  // Date refuses a month or day out of range, and rolls an impossible day,
  // such as February 30, into the next month.
  const midnight = new Date(`${day}T00:00:00Z`);
  return TIMESTAMP.test(value) && !Number.isNaN(midnight.getTime()) && midnight.toISOString().startsWith(day);
}

function unreadableDecision(options?: ErrorOptions): TypeError {
  return new TypeError('Volcano resumed the approval with a decision this SDK cannot read', options);
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

function expired(): ApprovalDecision {
  return { approved: false, status: 'expired', comment: '', decidedBy: null, decidedAt: null };
}
