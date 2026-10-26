import type { ChannelClient, ChannelSubscription } from '../../src/realtime-channel-lifecycle.ts';
import { Subscription } from './realtime-channel-lifecycle-subscription.ts';

export class Client implements ChannelClient {
  readonly subscription = new Subscription();
  readonly created: { name: string; joinLeave: boolean; data?: Record<string, string> }[] = [];
  readonly removed: ChannelSubscription[] = [];
  presenceResult: Promise<unknown> = Promise.resolve({ clients: {} });
  presenceCalls: string[] = [];
  failRemove = false;

  newSubscription(name: string, options: { joinLeave: boolean; data?: Record<string, string> }): ChannelSubscription {
    this.created.push({ name, ...options });
    return this.subscription;
  }

  removeSubscription(subscription: ChannelSubscription): void {
    if (this.failRemove) {
      throw new Error('already removed');
    }
    this.removed.push(subscription);
  }

  presence(name: string): Promise<unknown> {
    this.presenceCalls.push(name);
    return this.presenceResult;
  }
}
