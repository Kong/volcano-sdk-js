import type {
  RealtimeChannel as EsmChannel,
  VolcanoRealtime as EsmRealtime,
} from '../../dist/realtime.esm.mjs';
import type {
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

// @ts-expect-error Subscription state is not part of the public CJS API.
export type LeakedSubscription = CjsChannel['_subscription'];
// @ts-expect-error Callback storage is not part of the public ESM API.
export type LeakedCallbacks = EsmChannel['_callbacks'];
// @ts-expect-error Transport bookkeeping is not part of the public CJS API.
export type LeakedTransportHandlers = CjsRealtime['_clientHandlers'];
// @ts-expect-error Connection internals are not part of the public ESM API.
export type LeakedConnection = EsmRealtime['_doConnect'];
