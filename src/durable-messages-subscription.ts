import type { DurableMessageStream } from './durable-message-stream.ts';
import type { DurableMessage } from './sdk-public-types.ts';

/** The parts of a realtime channel a subscription drives. */
export interface DurableChannel {
  on(event: string, callback: (data: unknown) => void): unknown;
  subscribe(): Promise<void>;
  _onSubscriptionState: ((state: string) => void) | null;
  readonly _paused: boolean;
}

interface DurableRealtime {
  _durableChannel(executionId: string, clientToken: string | null): DurableChannel | null;
  _removeDurableChannel(channel: DurableChannel): void;
}

export interface Subscriber {
  deliver(message: DurableMessage): unknown;
  realtime: DurableRealtime;
}

export function subscriptionStateListener(
  stream: DurableMessageStream,
  channel: DurableChannel,
  realtime: DurableRealtime,
  started: () => boolean,
): (state: string) => void {
  return (state) => {
    // An unsubscribed channel does not come back: it was discarded by
    // unsubscribing, disconnect(), removeAllChannels(), or a change of
    // signed-in user, or the server ended it.
    if (state === 'unsubscribed') {
      stream.close();
      // Before it starts, subscribe() returns the failure instead.
      if (started()) {
        leaveIfServerEnded(channel, realtime);
      }
      return;
    }
    // The first catch-up follows subscribing.
    if (!started()) {
      return;
    }
    if (state === 'subscribed') {
      stream.catchUpInBackground();
      return;
    }
    stream.hold();
  };
}

// The SDK pauses a channel before it unsubscribes one, so one unsubscribed
// unpaused was ended by the server, refusing a resubscription for one. Leaving
// it lets the execution be subscribed to again.
function leaveIfServerEnded(channel: DurableChannel, realtime: DurableRealtime): void {
  if (channel._paused) {
    return;
  }
  console.error('[Realtime] The server ended the durable message subscription; subscribe again to resume');
  realtime._removeDurableChannel(channel);
}

export function subscriberOf(handler: unknown, realtime: unknown): Subscriber | Error {
  if (typeof handler !== 'function') {
    return new Error('subscribe requires a handler function');
  }
  if (!isDurableRealtime(realtime)) {
    return new Error('subscribe requires options.realtime, a connected VolcanoRealtime');
  }
  return {
    deliver(message) {
      const result: unknown = Reflect.apply(handler, undefined, [message]);
      return result;
    },
    realtime,
  };
}

function isDurableRealtime(value: unknown): value is DurableRealtime {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof Reflect.get(value, '_durableChannel') === 'function' &&
    typeof Reflect.get(value, '_removeDurableChannel') === 'function'
  );
}
