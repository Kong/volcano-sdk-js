import { Emitter } from './durable-messages-emitter.ts';

export class FakeSubscription extends Emitter {
  state = 'unsubscribed';
  readyResult: Promise<void> = Promise.resolve();

  constructor(
    readonly channel: string,
    readonly options: Record<string, unknown> | undefined,
  ) {
    super();
  }

  subscribe(): void {
    this.move('subscribed');
  }

  unsubscribe(): void {
    this.move('unsubscribed');
  }

  ready(): Promise<void> {
    return this.readyResult;
  }

  publish(): Promise<unknown> {
    return Promise.resolve();
  }

  // Like Centrifuge, which reports a state only when it changes.
  move(state: string): void {
    if (state === this.state) {
      return;
    }
    this.state = state;
    this.emit('state', { newState: state });
  }
}
