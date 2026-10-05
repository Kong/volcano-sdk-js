import type {
  ErrorContext as EsmErrorContext,
  RealtimeChannel as EsmChannel,
  VolcanoRealtime as EsmRealtime,
} from '../../dist/realtime.esm.mjs';
import type {
  ErrorContext as CjsErrorContext,
  RealtimeChannel as CjsChannel,
  VolcanoRealtime as CjsRealtime,
} from '../../dist/realtime.js';

declare const cjs: CjsRealtime;
declare const esm: EsmRealtime;
declare const cjsChannel: CjsChannel;
declare const esmChannel: EsmChannel;

function receive(data: unknown): void {
  if (data === null) {
    throw new Error('Null publication');
  }
}

cjs.channel('room').on('message', receive);
esm.channel('room').on('message', receive);
void cjsChannel.subscribe();
void esmChannel.subscribe();
export const cjsAuth: NonNullable<
  ConstructorParameters<typeof CjsRealtime>[0]['volcanoClient']
> | null = cjs.getVolcanoClient();
export const esmAuth: NonNullable<
  ConstructorParameters<typeof EsmRealtime>[0]['volcanoClient']
> | null = esm.getVolcanoClient();

export function cjsErrorMessage(context: CjsErrorContext): string | undefined {
  return context.error instanceof Error ? context.error.message : context.message;
}

export function esmErrorMessage(context: EsmErrorContext): string | undefined {
  return context.error instanceof Error ? context.error.message : context.message;
}

// @ts-expect-error Subscription state is not part of the public CJS API.
export type LeakedSubscription = CjsChannel['_subscription'];
// @ts-expect-error Callback storage is not part of the public ESM API.
export type LeakedCallbacks = EsmChannel['_callbacks'];
// @ts-expect-error Transport bookkeeping is not part of the public CJS API.
export type LeakedTransportHandlers = CjsRealtime['_clientHandlers'];
// @ts-expect-error Connection internals are not part of the public ESM API.
export type LeakedConnection = EsmRealtime['_doConnect'];
