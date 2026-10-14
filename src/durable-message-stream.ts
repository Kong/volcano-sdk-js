import { type DurableResult, failure } from './durable-facade.ts';
import { liveMessage } from './durable-message-response.ts';
import type { DurableMessage, DurableMessageList } from './sdk-public-types.ts';

type ListAfter = (after: number) => Promise<DurableResult<DurableMessageList>>;

/**
 * Delivers what an execution publishes in `seq` order, once each, from two
 * sources: the realtime channel and the list endpoint.
 *
 * A live message can only be delivered once everything before it has been
 * listed, or the missed ones would fall below `lastSeq` and be skipped. So
 * live messages are held from `hold()` (the channel is not subscribed) until a
 * catch-up has read what was missed. Each broadcast names the publish before
 * it, so one that follows a lost or still-arriving broadcast starts a catch-up
 * too.
 */
export class DurableMessageStream {
  private lastSeq = 0;
  private holding = true;
  private catchUps = 0;
  private held: DurableMessage[] = [];
  private closed = false;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly handler: (message: DurableMessage) => void,
    private readonly listAfter: ListAfter,
  ) {}

  live(data: unknown): void {
    const live = liveMessage(data);
    if (live?.message.direction !== 'out') {
      return;
    }
    if (this.behind()) {
      this.held.push(live.message);
      return;
    }
    if (live.prevSeq > this.lastSeq) {
      this.held.push(live.message);
      // A failed catch-up leaves the gap; the held message is still released.
      void this.catchUp();
      return;
    }
    this.deliver(live.message);
  }

  hold(): void {
    this.holding = true;
  }

  /** Resolves with the last page read, or the failure, including a handler's. */
  catchUp(): Promise<DurableResult<DurableMessageList>> {
    this.holding = false;
    // Counted now, not when the queued read starts, so nothing is delivered
    // live while a catch-up waits its turn.
    this.catchUps += 1;
    const run = this.queue
      .then(() => this.readMissed())
      .catch((error: unknown) => failure<DurableMessageList>(toError(error)));
    this.queue = run;
    return run;
  }

  close(): void {
    this.closed = true;
  }

  private behind(): boolean {
    return this.holding || this.catchUps > 0;
  }

  private async readMissed(): Promise<DurableResult<DurableMessageList>> {
    try {
      return await this.readPages();
    } finally {
      this.catchUps -= 1;
      if (this.catchUps === 0 && !this.holding) {
        this.release();
      }
    }
  }

  private async readPages(): Promise<DurableResult<DurableMessageList>> {
    let after: number;
    let page: DurableResult<DurableMessageList>;
    do {
      after = this.lastSeq;
      page = await this.listAfter(after);
      if (page.data === null) {
        return page;
      }
      page.data.data.forEach((message) => {
        this.deliver(message);
      });
      // A page that delivered nothing would be asked for again unchanged.
    } while (page.data.has_more && this.lastSeq !== after);
    return page;
  }

  private release(): void {
    const held = this.held;
    this.held = [];
    held.sort((a, b) => a.seq - b.seq);
    held.forEach((message) => {
      this.deliver(message);
    });
  }

  private deliver(message: DurableMessage): void {
    if (this.closed || message.seq <= this.lastSeq) {
      return;
    }
    this.lastSeq = message.seq;
    this.handler(message);
  }
}

export function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
