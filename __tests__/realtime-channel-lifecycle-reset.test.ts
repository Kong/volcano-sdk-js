import { disposeChannel, resetChannelForIdentityChange, subscribeChannel } from '../src/realtime-channel-lifecycle.ts';
import { presenceState, State } from './support/realtime-channel-lifecycle-state.ts';

test('unsubscribe cancels timers and pending fetches while retaining the subscription', async () => {
  jest.useFakeTimers();
  try {
    const state = presenceState();
    await subscribeChannel(state);
    const client = state.client;
    if (client === null) {
      throw new Error('client missing');
    }
    await client.subscription.emit('subscribed', {});
    const rejected: Error[] = [];
    state._pendingFetches.set('public.items', {
      timer: setTimeout(() => {
        state.syncs += 1;
      }, 20),
      ids: new Map([['1', { reject: (error: Error) => rejected.push(error) }]]),
    });
    state._pendingFetches.set('public.other', {
      timer: null,
      ids: new Map([['2', { reject: (error: Error) => rejected.push(error) }]]),
    });
    state._presenceState = { old: { client: 'old' } };
    state.unsubscribe();
    expect(state._lifecycleVersion).toBe(1);
    expect(state._presenceTimeoutId).toBeNull();
    expect(state._pendingFetches.size).toBe(0);
    expect(rejected.map((error) => error.message)).toEqual(['Channel unsubscribed', 'Channel unsubscribed']);
    expect(state._subscription).toBe(client.subscription);
    expect(state._presenceState).toEqual({});
    expect(client.subscription.unsubscribes).toBe(1);
    await jest.advanceTimersByTimeAsync(150);
    expect(client.presenceCalls).toEqual([]);
    expect(state.syncs).toBe(0);
  } finally {
    jest.useRealTimers();
  }
});

test('reset removes listeners and registry state; disposal also clears callbacks', async () => {
  const state = new State();
  await subscribeChannel(state);
  const client = state.client;
  if (client === null) {
    throw new Error('client missing');
  }
  state._callbacks.set('message', [
    () => {
      state.syncs += 1;
    },
  ]);
  resetChannelForIdentityChange(state);
  expect(client.subscription.removed).toEqual(['state', 'publication']);
  expect(client.removed).toEqual([client.subscription]);
  expect(state._eventHandlers).toEqual({});
  expect(state._subscription).toBeNull();
  resetChannelForIdentityChange(state);
  expect(client.removed).toHaveLength(1);
  await subscribeChannel(state);
  disposeChannel(state);
  expect(state._callbacks.size).toBe(0);
});

test('reset finishes cleanup when event removal or registry removal fails', async () => {
  const state = new State();
  await subscribeChannel(state);
  const client = state.client;
  if (client === null) {
    throw new Error('client missing');
  }
  client.subscription.failOff = true;
  client.failRemove = true;
  resetChannelForIdentityChange(state);
  expect(state._subscription).toBeNull();
  expect(state._eventHandlers).toEqual({});
  await subscribeChannel(state);
  state.client = null;
  resetChannelForIdentityChange(state);
  expect(state._subscription).toBeNull();
});
