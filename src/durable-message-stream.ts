import { type DurableResult, failure } from './durable-facade.ts';
import { isDurableMessage } from './durable-message-response.ts';
import type { DurableMessage, DurableMessageList } from './sdk-public-types.ts';

type ListAfter = (after: number) => Promise<DurableResult<DurableMessageList>>;

/**
 * Delivers what an execution publishes in `seq` order, once each, from two
 * sources: the realtime channel and the list endpoint.
 *
 * A live message can only be delivered once everything before it has been
 * listed, or the missed ones would fall below `lastSeq` and be skipped. So
 * live messages are held from `hold()` (the channel is not subscribed) until a
 * catch-up has read what was missed.
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
    if (!isDurableMessage(data) || data.direction !== 'out') {
      return;
    }
    if (this.holding || this.catchUps > 0) {
      this.held.push(data);
      return;
    }
    this.deliver(data);
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
    for (;;) {
      const page = await this.listAfter(this.lastSeq);
      if (page.data === null) {
        return page;
      }
      page.data.data.forEach((message) => {
        this.deliver(message);
      });
      if (!page.data.has_more || page.data.data.length === 0) {
        return page;
      }
    }
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
