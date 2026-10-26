import { subscribeChannel } from '../src/realtime-channel-lifecycle.ts';
import { deferred } from './realtime-transport-fixtures.ts';
import { expectPresent } from './support/assertions.ts';
import { presenceState } from './support/realtime-channel-lifecycle-state.ts';

test('presence events update state and are ignored while paused or malformed', async () => {
  const state = presenceState();
  await subscribeChannel(state);
  const client = state.client;
  expectPresent(client);
  const subscription = client.subscription;
  expect(client.created).toEqual([{ name: 'presence:lobby', joinLeave: true }]);
  await subscription.emit('presence', { clients: {} });
  expect(state.updated).toEqual([{ clients: {} }]);
  await subscription.emit('join', { info: { client: 'alice', user: 'user' } });
  expect(state._presenceState).toEqual({ alice: { client: 'alice', user: 'user' } });
  await subscription.emit('leave', { info: { client: 'alice' } });
  expect(state._presenceState).toEqual({});
  expect(state.syncs).toBe(3);
  expect(state.events).toEqual([
    { event: 'join', data: { client: 'alice', user: 'user' } },
    { event: 'leave', data: { client: 'alice' } },
  ]);
  await subscription.emit('join', { info: { client: 3 } });
  await subscription.emit('leave', null);
  expect(state.events).toHaveLength(2);
  state._paused = true;
  await subscription.emit('presence', {});
  await subscription.emit('join', { info: { client: 'bob' } });
  await subscription.emit('leave', { info: { client: 'bob' } });
  await subscription.emit('subscribed', {});
  expect(state.updated).toHaveLength(1);
  expect(state.events).toHaveLength(2);
  expect(state._presenceState).toEqual({});
  expect(state._presenceTimeoutId).toBeNull();
});

test('presence snapshot applies after delay and ignores stale and malformed results', async () => {
  jest.useFakeTimers();
  try {
    const state = presenceState();
    await subscribeChannel(state);
    const client = state.client;
    expectPresent(client);
    const refreshPresence = async (result: Promise<unknown>): Promise<void> => {
      client.presenceResult = result;
      await client.subscription.emit('subscribed', {});
      await jest.advanceTimersByTimeAsync(150);
    };
    await refreshPresence(Promise.resolve({ clients: { alice: { client: 'alice' } } }));
    expect(client.presenceCalls).toEqual(['presence:lobby']);
    expect(state._presenceState).toEqual({ alice: { client: 'alice' } });
    expect(state.syncs).toBe(1);
    expect(state._presenceTimeoutId).toBeNull();

    await refreshPresence(Promise.resolve({ clients: [] }));
    expect(state._presenceState).toEqual({ alice: { client: 'alice' } });

    for (const malformed of [null, 7, 'invalid']) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- Each refresh advances the shared fake clock before the next.
      await refreshPresence(Promise.resolve({ clients: malformed }));
      expect(state._presenceState).toEqual({ alice: { client: 'alice' } });
    }

    const waiting = deferred<unknown>();
    await refreshPresence(waiting.promise);
    state.unsubscribe();
    waiting.resolve({ clients: { stale: { client: 'stale' } } });
    await jest.advanceTimersByTimeAsync(0);
    expect(state._presenceState).toEqual({});
    expect(state.syncs).toBe(1);
  } finally {
    jest.useRealTimers();
  }
});

test('presence refresh tolerates absent client, absent subscription and query failures', async () => {
  jest.useFakeTimers();
  try {
    const state = presenceState();
    await subscribeChannel(state);
    const client = state.client;
    expectPresent(client);
    await client.subscription.emit('subscribed', {});
    state.client = null;
    await jest.advanceTimersByTimeAsync(150);
    expect(client.presenceCalls).toEqual([]);

    state.client = client;
    state._realtime = {
      getClient() {
        throw new Error('client registry unavailable');
      },
    };
    await client.subscription.emit('subscribed', {});
    await jest.advanceTimersByTimeAsync(150);
    expect(client.presenceCalls).toEqual([]);

    state._realtime = { getClient: () => state.client };
    await client.subscription.emit('subscribed', {});
    state._subscription = null;
    await jest.advanceTimersByTimeAsync(150);
    expect(client.presenceCalls).toEqual([]);

    state._subscription = client.subscription;
    client.presenceResult = Promise.reject(new Error('unavailable'));
    await client.subscription.emit('subscribed', {});
    await jest.advanceTimersByTimeAsync(150);
    expect(state._presenceState).toEqual({});
  } finally {
    jest.useRealTimers();
  }
});
