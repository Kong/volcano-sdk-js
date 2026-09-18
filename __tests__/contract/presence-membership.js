class PresenceObserver {
  constructor(channel, userId) {
    this.channel = channel;
    this.userId = userId;
    this.snapshots = [];
    this.listeners = new Set();
    this.unsubscribe = channel.onPresenceSync((state) => {
      this.snapshots.push(Object.keys(state).sort());
      for (const listener of this.listeners) listener();
    });
  }

  async wait(predicate) {
    if (predicate()) return;
    await new Promise((resolve, reject) => {
      const cleanup = () => {
        clearTimeout(timer);
        this.listeners.delete(check);
      };
      const check = () => {
        if (predicate()) {
          cleanup();
          resolve();
        }
      };
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error('Presence membership did not arrive within 10 seconds'));
      }, 10000);
      this.listeners.add(check);
      check();
    });
  }

  async roster(count) {
    await this.wait(() => Object.keys(this.channel.getPresenceState()).length === count);
    const state = this.channel.getPresenceState();
    for (const [key, info] of Object.entries(state)) {
      expect(key).toBeTruthy();
      expect(info.client).toBe(key);
      expect(info.user).toBe(this.userId);
    }
    return Object.keys(state).sort();
  }
}

function observedMembership(snapshots, initial, joined) {
  const expected = [initial, joined, initial].map(JSON.stringify);
  let index = 0;
  for (const state of snapshots) {
    if (JSON.stringify(state) === expected[index]) index++;
    if (index === expected.length) return true;
  }
  return false;
}

async function verifyPresenceMembership(world) {
  const [first, second] = world.realtimeClients.map((client) =>
    client.channel(world.realtimeChannel, { type: 'presence' }),
  );
  const firstObserver = new PresenceObserver(first, world.fixture.user_id);
  const secondObserver = new PresenceObserver(second, world.fixture.user_id);
  try {
    await first.subscribe();
    const initial = await firstObserver.roster(1);
    await second.subscribe();
    const joined = await firstObserver.roster(2);
    expect(await secondObserver.roster(2)).toEqual(joined);
    expect(joined).toEqual(expect.arrayContaining(initial));
    await second.unsubscribe();
    expect(await firstObserver.roster(1)).toEqual(initial);
    await firstObserver.wait(() => observedMembership(firstObserver.snapshots, initial, joined));
    return [1, 2, 1];
  } finally {
    firstObserver.unsubscribe();
    secondObserver.unsubscribe();
    await Promise.all([first.unsubscribe(), second.unsubscribe()]);
  }
}

module.exports = { verifyPresenceMembership, observedMembership };
