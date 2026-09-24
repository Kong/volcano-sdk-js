import type { PresenceState } from '../../src/realtime.ts';
import { observedMembership } from './observed-membership.ts';

interface PresenceChannel {
  onPresenceSync(callback: (state: PresenceState) => void): () => void;
  getPresenceState(): PresenceState;
  subscribe(): Promise<void>;
  unsubscribe(): void;
}

interface PresenceWorld {
  fixture: { user_id: string };
  realtimeChannel: string;
  realtimeClients: {
    channel(name: string, options: { type: 'presence' }): PresenceChannel;
  }[];
}

class PresenceObserver {
  readonly channel: PresenceChannel;
  readonly userId: string;
  readonly snapshots: string[][] = [];
  readonly listeners = new Set<() => void>();
  readonly unsubscribe: () => void;

  constructor(channel: PresenceChannel, userId: string) {
    this.channel = channel;
    this.userId = userId;
    this.unsubscribe = channel.onPresenceSync((state) => {
      this.snapshots.push(Object.keys(state).sort((left, right) => left.localeCompare(right)));
      for (const listener of this.listeners) {
        listener();
      }
    });
  }

  async wait(predicate: () => boolean): Promise<void> {
    if (predicate()) {
      return;
    }
    await new Promise<void>((resolve, reject) => {
      const controller = new AbortController();
      const check = () => {
        if (predicate()) {
          controller.abort();
          this.listeners.delete(check);
          resolve();
        }
      };
      const timer = setTimeout(() => {
        this.listeners.delete(check);
        reject(new Error('Presence membership did not arrive within 10 seconds'));
      }, 10000);
      controller.signal.addEventListener(
        'abort',
        () => {
          clearTimeout(timer);
        },
        { once: true },
      );
      this.listeners.add(check);
      check();
    });
  }

  async roster(count: number): Promise<string[]> {
    await this.wait(() => Object.keys(this.channel.getPresenceState()).length === count);
    const state = this.channel.getPresenceState();
    for (const [key, info] of Object.entries(state)) {
      expect(key).toBeTruthy();
      expect(info.client).toBe(key);
      expect(info.user).toBe(this.userId);
    }
    return Object.keys(state).sort((left, right) => left.localeCompare(right));
  }
}

async function verifyPresenceMembership(world: PresenceWorld): Promise<number[]> {
  const [first, second] = world.realtimeClients.map((client) =>
    client.channel(world.realtimeChannel, { type: 'presence' }),
  );
  if (first === undefined || second === undefined) {
    throw new Error('Presence contract requires two clients');
  }
  const firstObserver = new PresenceObserver(first, world.fixture.user_id);
  const secondObserver = new PresenceObserver(second, world.fixture.user_id);
  try {
    await first.subscribe();
    const initial = await firstObserver.roster(1);
    await second.subscribe();
    const joined = await firstObserver.roster(2);
    expect(await secondObserver.roster(2)).toEqual(joined);
    expect(joined).toEqual(expect.arrayContaining(initial));
    second.unsubscribe();
    expect(await firstObserver.roster(1)).toEqual(initial);
    await firstObserver.wait(() => observedMembership(firstObserver.snapshots, initial, joined));
    return [1, 2, 1];
  } finally {
    firstObserver.unsubscribe();
    secondObserver.unsubscribe();
    first.unsubscribe();
    second.unsubscribe();
  }
}

export { verifyPresenceMembership };
