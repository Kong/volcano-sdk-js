import { type DurableResult, failure } from './durable-facade.ts';
import { liveMessage } from './durable-message-response.ts';
import type { DurableMessage, DurableMessageList } from './sdk-public-types.ts';

type ListAfter = (after: number) => Promise<DurableResult<DurableMessageList>>;

interface Held {
  message: DurableMessage;
  prevSeq: number;
}

// Half a second doubling to a 30 second cap.
const FIRST_RETRY_MS = 500;
const MAX_RETRY_MS = 30_000;
// Live messages held past this are dropped, oldest first. Each one held after
// a dropped one names a predecessor at or past it, so it waits for a read
// that lists the dropped one.
const HELD_LIMIT = 128;
const ENDED = 'The durable message subscription has ended';

/**
 * Delivers what an execution publishes in `seq` order, once each, from two
 * sources: the realtime channel and the list endpoint.
 *
 * A live message can only be delivered once everything before it has been,
 * or the missed ones would fall below `lastSeq` and be skipped. Each broadcast
 * names the publish before it, so a live message is held, with that name,
 * while the channel is not subscribed, while a catch-up reads, while it does
 * not follow `lastSeq`, and behind any message already held. A catch-up that
 * fails, or that leaves a held message still short of its predecessor, is
 * tried again until one reads it.
 */
export class DurableMessageStream {
  private lastSeq = 0;
  private holding = true;
  private catchUps = 0;
  private held: Held[] = [];
  private failures = 0;
  private retry: ReturnType<typeof setTimeout> | undefined;
  private closed = false;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly handler: (message: DurableMessage) => void,
    private readonly listAfter: ListAfter,
  ) {}

  live(data: unknown): void {
    const live = this.published(data);
    if (live === null) {
      return;
    }
    if (this.behind()) {
      this.keep(live);
      return;
    }
    if (live.prevSeq > this.lastSeq) {
      this.keep(live);
      this.catchUpInBackground();
      return;
    }
    this.deliver(live.message, true);
  }

  hold(): void {
    this.holding = true;
    // The catch-up that follows subscribing again replaces any retry.
    this.cancelRetry();
  }

  /**
   * The first catch-up. Resolves with the last page read, or the failure,
   * including a handler's, which closes the stream before anything held is
   * delivered. A stream closed before it is called reads nothing, and one
   * closed while it reads fails.
   */
  catchUp(): Promise<DurableResult<DurableMessageList>> {
    if (this.closed) {
      return Promise.resolve(failure(new Error(ENDED)));
    }
    return this.read(true).then(
      (page) =>
        page.error === null && this.closed ? failure<DurableMessageList>(new Error(ENDED)) : page,
      (error: unknown) => failure<DurableMessageList>(toError(error)),
    );
  }

  /**
   * A catch-up nobody waits for. A failed read is reported and retried; what
   * a handler throws is reported and the read goes on, as live delivery does.
   */
  catchUpInBackground(): void {
    void this.read(false).then(reportFailedRead);
  }

  close(): void {
    this.closed = true;
    this.held.length = 0;
    this.cancelRetry();
  }

  private read(first: boolean): Promise<DurableResult<DurableMessageList>> {
    this.holding = false;
    this.cancelRetry();
    // Counted now, not when the queued read starts, so nothing is delivered
    // live while a catch-up waits its turn.
    this.catchUps += 1;
    const run = this.queue.then(() => this.readMissed(first));
    this.queue = Promise.allSettled([run]);
    return run;
  }

  // A closed stream keeps nothing it can no longer deliver.
  private published(data: unknown): Held | null {
    const live = liveMessage(data);
    return live?.message.direction === 'out' && !this.closed ? live : null;
  }

  private behind(): boolean {
    return this.holding || this.catchUps > 0 || this.held.length > 0;
  }

  private keep(live: Held): void {
    this.held.push(live);
    if (this.held.length > HELD_LIMIT) {
      this.held.sort(bySeq);
      this.held.shift();
    }
  }

  // Past the first read, what a handler throws is reported and the read goes
  // on; backing off is for failed reads. The first read's handler errors end
  // the subscription instead.
  private async readMissed(first: boolean): Promise<DurableResult<DurableMessageList>> {
    const report = !first;
    let read = false;
    try {
      const page = await this.readPages(report);
      read = page.error === null;
      return page;
    } finally {
      this.catchUps -= 1;
      if (first && !read) {
        this.close();
      }
      if (this.catchUps === 0 && !this.holding) {
        this.release(read, report);
      }
    }
  }

  private async readPages(report: boolean): Promise<DurableResult<DurableMessageList>> {
    let after: number;
    let page: DurableResult<DurableMessageList>;
    do {
      after = this.lastSeq;
      page = await this.listAfter(after);
      if (page.data === null) {
        return page;
      }
      page.data.data.forEach((message) => {
        this.deliver(message, report);
      });
      // A page that delivered nothing would be asked for again unchanged.
    } while (page.data.has_more && this.lastSeq !== after);
    return page;
  }

  // Delivers the held messages that follow on from `lastSeq` and keeps the
  // rest. One a handler throws on is already delivered, so a retry resumes
  // after it.
  private release(read: boolean, report: boolean): void {
    this.held.sort(bySeq);
    try {
      let next = this.held[0];
      while (next !== undefined && next.prevSeq <= this.lastSeq) {
        this.held.shift();
        this.deliver(next.message, report);
        next = this.held[0];
      }
    } finally {
      if (read && this.held.length === 0) {
        this.failures = 0;
      } else {
        this.retryLater();
      }
    }
  }

  private retryLater(): void {
    if (this.closed) {
      return;
    }
    const delay = Math.min(FIRST_RETRY_MS * 2 ** this.failures, MAX_RETRY_MS);
    this.failures += 1;
    this.retry = setTimeout(() => {
      this.retry = undefined;
      this.catchUpInBackground();
    }, delay);
  }

  private cancelRetry(): void {
    clearTimeout(this.retry);
    this.retry = undefined;
  }

  // A live throw would reach the realtime client, which then stops
  // dispatching.
  private deliver(message: DurableMessage, report: boolean): void {
    if (this.closed || message.seq <= this.lastSeq) {
      return;
    }
    this.lastSeq = message.seq;
    if (!report) {
      this.handler(message);
      return;
    }
    try {
      this.handler(message);
    } catch (error) {
      reportHandlerError(error);
    }
  }
}

// Centrifuge refuses a subscription with a plain `{ code, message }` object.
export function toError(error: unknown): Error {
  if (error instanceof Error) {
    return error;
  }
  const message: unknown =
    typeof error === 'object' && error !== null ? Reflect.get(error, 'message') : undefined;
  return typeof message === 'string'
    ? new Error(message, { cause: error })
    : new Error(String(error));
}

function bySeq(a: Held, b: Held): number {
  return a.message.seq - b.message.seq;
}

function reportFailedRead(page: DurableResult<DurableMessageList>): void {
  if (page.error !== null) {
    console.error('[Realtime] Durable message catch-up failed:', page.error);
  }
}

function reportHandlerError(error: unknown): void {
  console.error('[Realtime] Error in durable message handler:', error);
}
