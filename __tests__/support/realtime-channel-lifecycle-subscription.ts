import type { ChannelSubscription } from '../../src/realtime-channel-lifecycle.ts';

export type Handler = (context: unknown) => void | Promise<void>;

export class Subscription implements ChannelSubscription {
  readonly handlers = new Map<string, Handler>();
  readonly removed: string[] = [];
  subscribes = 0;
  unsubscribes = 0;
  readyTimeouts: number[] = [];
  readyResult: Promise<void> = Promise.resolve();
  failOff = false;

  on(event: string, handler: Handler): void {
    this.handlers.set(event, handler);
  }

  off(event: string, handler: Handler): void {
    if (this.failOff) {
      throw new Error('already removed');
    }
    if (this.handlers.get(event) === handler) {
      this.handlers.delete(event);
      this.removed.push(event);
    }
  }

  subscribe(): void {
    this.subscribes += 1;
  }

  unsubscribe(): void {
    this.unsubscribes += 1;
  }

  async ready(timeout: number): Promise<void> {
    this.readyTimeouts.push(timeout);
    await this.readyResult;
  }

  async emit(event: string, context: unknown): Promise<void> {
    await this.handlers.get(event)?.(context);
  }
}
