import type {
  Durable,
  DurableExecution,
  DurableMessage,
  OpenAPIComponents,
  OpenAPIOperations,
} from '../../src/index.ts';
import type { VolcanoRealtime } from '../../src/realtime.ts';
import type { Exact as Equal } from '../fixtures/public-api-compatibility.d.ts';

type Assert<T extends true> = T;

interface DurableExecutionShape {
  id: string;
  function_id: string;
  name: string;
  // `unknown` is a terminal status the platform writes itself, for an execution
  // whose outcome it could not find out. Listed here because the handle a start
  // returns can carry it on a later read.
  status: 'pending' | 'running' | 'succeeded' | 'failed' | 'timed_out' | 'stopped' | 'unknown';
  region: string;
  created_at: string;
}
type _DurableStartHandleMatchesHosting = Assert<DurableExecutionShape extends DurableExecution ? true : false>;
type _DurableExecutionComesOffTheWire = Assert<
  Equal<DurableExecution, OpenAPIComponents['schemas']['DurableExecution']>
>;

declare const durable: Durable;

// A start is answered, never thrown: `error` is what a refusal arrives as, and
// `data` is only a handle once it is null-checked.
async function startDurableExecution(): Promise<unknown> {
  const { data, status, error } = await durable.start('order-pipeline', { order_id: 4417 });
  if (error !== null) {
    const refusal: number | null = status;
    return refusal;
  }
  const handle: DurableExecution | null = data;
  return handle;
}

// The owner-scoped half: reading, listing and stopping all answer the same
// envelope, and a page carries the executions rather than a bare array.
async function followDurableExecution(): Promise<unknown> {
  const read = await durable.get('proj-1', 'order-pipeline', 'exec-1');
  const result: DurableExecution | null = read.data;

  const listed = await durable.list('proj-1', 'order-pipeline', { status: 'running', limit: 20 });
  const executions: DurableExecution[] = listed.data?.data ?? [];
  const more: boolean = listed.data?.has_more ?? false;

  const stopped = await durable.stop('proj-1', 'order-pipeline', 'exec-1');
  return { result, executions, more, status: stopped.status };
}

// The application half: the credential that started an execution reads and
// stops it, with the client token its start returned when it needs one.
async function followFromApplication(): Promise<unknown> {
  const read = await durable.getFromApplication('order-pipeline', 'exec-1', { clientToken: 'ct-1' });
  const result: DurableExecution | null = read.data;
  await durable.getFromApplication('order-pipeline', 'exec-1');
  const stopped = await durable.stopFromApplication('order-pipeline', 'exec-1', { clientToken: 'ct-1' });
  // @ts-expect-error the client token is a string
  void durable.stopFromApplication('order-pipeline', 'exec-1', { clientToken: 7 });
  return { result, status: stopped.status };
}

// durable.getFromApplication and durable.stopFromApplication call these
// routes, which hosting#2364 adds. A sync from a hosting main without them
// fails here instead of dropping them.
type ApplicationRead = OpenAPIOperations['getDurableExecutionFromApplication'];
type ApplicationStop = OpenAPIOperations['stopDurableExecutionFromApplication'];
type _ApplicationReadTakesTheClientToken = Assert<
  Equal<keyof NonNullable<ApplicationRead['parameters']['header']>, 'X-Volcano-Client-Token'>
>;
type _ApplicationStopTakesTheClientToken = Assert<
  Equal<keyof NonNullable<ApplicationStop['parameters']['header']>, 'X-Volcano-Client-Token'>
>;
type _ApplicationReadAnswersTheExecution = Assert<
  Equal<ApplicationRead['responses'][200]['content']['application/json'], DurableExecution>
>;
type _ApplicationStopAnswersTheExecution = Assert<
  Equal<ApplicationStop['responses'][200]['content']['application/json'], DurableExecution>
>;

type _DurableMessageComesOffTheWire = Assert<Equal<DurableMessage, OpenAPIComponents['schemas']['DurableMessage']>>;

// ctx.waitForCallback() registers its step with POST /durable-callbacks, which
// hosting#1966 adds. A sync from a hosting main without that route fails here
// instead of dropping it.
type RegisterDurableCallback = OpenAPIOperations['registerDurableCallback'];
type _WaitForCallbackSendsTheRegistration = Assert<
  Equal<
    keyof RegisterDurableCallback['requestBody']['content']['application/json'],
    'name' | 'execution_ref' | 'callback_id' | 'operation_id'
  >
>;
type _WaitForCallbackReadsItsToken = Assert<
  Equal<keyof RegisterDurableCallback['responses'][201]['content']['application/json'], 'token' | 'expires_at'>
>;

declare const realtime: VolcanoRealtime;

// Messages answer the same envelope, a page reads on from the last `seq`, and
// a subscription needs a realtime client to deliver on.
async function exchangeDurableMessages(): Promise<unknown> {
  const target = { functionName: 'checkout', executionId: 'exec-1', clientToken: 'ct-1' };
  const sent = await durable.messages.send(
    target,
    'address-confirmed',
    { address_id: 'addr_19' },
    { idempotencyKey: 'confirm-addr_19' },
  );
  const delivered: boolean = sent.data?.status === 'delivered';

  const listed = await durable.messages.list({ ...target, projectId: 'proj-1' }, { direction: 'out', after: 3 });
  const seqs: number[] = listed.data?.data.map((message) => message.seq) ?? [];

  const { data: subscription } = await durable.messages.subscribe(
    target,
    (message: DurableMessage) => {
      seqs.push(message.seq);
    },
    { realtime },
  );
  await subscription?.unsubscribe();
  // @ts-expect-error a subscription needs a realtime client
  void durable.messages.subscribe(target, (message) => message.seq, {});
  return { delivered, seqs };
}

export type OpenApiDurableContractChecks = [
  _DurableStartHandleMatchesHosting,
  _DurableExecutionComesOffTheWire,
  _DurableMessageComesOffTheWire,
  _WaitForCallbackSendsTheRegistration,
  _WaitForCallbackReadsItsToken,
  _ApplicationReadTakesTheClientToken,
  _ApplicationStopTakesTheClientToken,
  _ApplicationReadAnswersTheExecution,
  _ApplicationStopAnswersTheExecution,
];

export const durableContractOperations = {
  startDurableExecution,
  followDurableExecution,
  followFromApplication,
  exchangeDurableMessages,
};
