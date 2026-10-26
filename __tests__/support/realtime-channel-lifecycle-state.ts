import {
  activateChannelSubscription,
  type ChannelLifecycleState,
  type ChannelSubscription,
  resetChannelForIdentityChange,
  unsubscribeChannel,
} from '../../src/realtime-channel-lifecycle.ts';
import { Client } from './realtime-channel-lifecycle-client.ts';
import type { Handler } from './realtime-channel-lifecycle-subscription.ts';

export class State implements ChannelLifecycleState {
  client: Client | null = new Client();
  _realtime = { getClient: (): Client | null => this.client };
  _name = 'broadcast:room';
  _type = 'broadcast';
  _subscription: ChannelSubscription | null = null;
  _subscribeData: Record<string, string> | null = null;
  _onSubscriptionState: ((state: string) => void) | null = null;
  _lifecycleVersion = 0;
  _paused = false;
  _callbacks = new Map<unknown, ((data: unknown, context?: unknown) => void)[]>();
  _presenceState: Record<string, unknown> = {};
  _presenceTimeoutId: ReturnType<typeof setTimeout> | null = null;
  _pendingFetches = new Map<
    string,
    {
      timer: ReturnType<typeof setTimeout> | null;
      ids: Map<string, { reject(error: Error): void }>;
    }
  >();
  _eventHandlers: Record<string, Handler> = {};
  readonly updated: unknown[] = [];
  readonly events: { event: string; data: unknown }[] = [];
  syncs = 0;

  _updatePresenceState(context: unknown): void {
    this.updated.push(context);
  }

  _triggerPresenceSync(): void {
    this.syncs += 1;
  }

  _triggerEvent(event: string, data: unknown): void {
    this.events.push({ event, data });
  }

  async _activateSubscription(): Promise<void> {
    if (this._subscription === null) {
      throw new Error('subscription missing');
    }
    await activateChannelSubscription(this, this._subscription);
  }

  _resetForIdentityChange(): void {
    resetChannelForIdentityChange(this);
  }

  unsubscribe(): void {
    unsubscribeChannel(this);
  }
}

export function presenceState(): State {
  const state = new State();
  state._name = 'presence:lobby';
  state._type = 'presence';
  return state;
}
