import { activateChannelSubscription, subscribeChannel } from '../src/realtime-channel-lifecycle.ts';
import { deferredVoid } from './realtime-transport-fixtures.ts';
import { State } from './support/realtime-channel-lifecycle-state.ts';
import { Subscription } from './support/realtime-channel-lifecycle-subscription.ts';

test('rejects subscription before the realtime client connects', async () => {
  const state = new State();
  state.client = null;
  await expect(subscribeChannel(state)).rejects.toThrow('Not connected');
});

test('retains and resumes broadcast subscriptions and event listeners', async () => {
  const state = new State();
  const client = state.client;
  expect(client).not.toBeNull();
  if (client === null) {
    throw new Error('client missing');
  }
  const received: unknown[] = [];
  state._callbacks.set('message', [(data) => received.push(data)]);
  state._callbacks.set('custom', [(data) => received.push(data)]);
  state._callbacks.set('*', [(data) => received.push(data)]);
  await subscribeChannel(state);
  expect(client.created).toEqual([{ name: 'broadcast:room', joinLeave: false }]);
  expect(client.subscription.readyTimeouts).toEqual([10_000]);
  await client.subscription.emit('publication', { data: { text: 'default' } });
  await client.subscription.emit('publication', { data: { event: 'custom' } });
  expect(received).toEqual([{ text: 'default' }, { text: 'default' }, { event: 'custom' }, { event: 'custom' }]);
  await client.subscription.emit('publication', { data: { event: 'unhandled' } });
  expect(received.at(-1)).toEqual({ event: 'unhandled' });
  state.unsubscribe();
  await client.subscription.emit('publication', { data: { text: 'paused' } });
  expect(received).toHaveLength(5);
  await subscribeChannel(state);
  expect(client.created).toHaveLength(1);
  expect(client.subscription.subscribes).toBe(2);
  expect(state._paused).toBe(false);
  state._paused = true;
  await client.subscription.emit('state', { newState: 'subscribing' });
  expect(state._paused).toBe(true);
  await client.subscription.emit('state', { newState: 'subscribed' });
  expect(state._paused).toBe(false);
  state._subscription = null;
  state._paused = true;
  await client.subscription.emit('state', { newState: 'subscribed' });
  expect(state._paused).toBe(true);
});

test('subscribes with the channel data and reports each state of the current subscription', async () => {
  const state = new State();
  const client = state.client;
  if (client === null) {
    throw new Error('client missing');
  }
  state._name = 'durable:execution';
  state._type = 'durable';
  state._subscribeData = { client_token: 'token' };
  const states: string[] = [];
  state._onSubscriptionState = (newState) => states.push(newState);
  await subscribeChannel(state);
  expect(client.created).toEqual([{ name: 'durable:execution', joinLeave: false, data: { client_token: 'token' } }]);
  expect(Object.keys(client.created[0] ?? {})).toEqual(['name', 'joinLeave', 'data']);
  await client.subscription.emit('state', { newState: 'subscribing' });
  await client.subscription.emit('state', { newState: 'subscribed' });
  await client.subscription.emit('state', { newState: 7 });
  await client.subscription.emit('state', null);
  expect(states).toEqual(['subscribing', 'subscribed']);
  state._paused = true;
  state._subscription = null;
  await client.subscription.emit('state', { newState: 'subscribing' });
  expect(states).toEqual(['subscribing', 'subscribed']);
});

test('subscribes without data when the channel has none', async () => {
  const state = new State();
  const client = state.client;
  if (client === null) {
    throw new Error('client missing');
  }
  await subscribeChannel(state);
  await client.subscription.emit('state', { newState: 'subscribed' });
  expect(Object.keys(client.created[0] ?? {})).toEqual(['name', 'joinLeave']);
});

test('listeners registered during delivery receive only subsequent publications', async () => {
  const state = new State();
  const received: string[] = [];
  const callbacks = [
    () => {
      received.push('first');
      callbacks.push(() => {
        received.push('later');
      });
    },
  ];
  state._callbacks.set('message', callbacks);
  await subscribeChannel(state);
  const client = state.client;
  if (client === null) {
    throw new Error('client missing');
  }
  await client.subscription.emit('publication', { data: { text: 'first' } });
  expect(received).toEqual(['first']);
  await client.subscription.emit('publication', { data: { text: 'second' } });
  expect(received).toEqual(['first', 'first', 'later']);
});

test('pauses a failed subscription but preserves the rejection and retained transport', async () => {
  const state = new State();
  const client = state.client;
  if (client === null) {
    throw new Error('client missing');
  }
  const failure = new Error('denied');
  client.subscription.readyResult = Promise.reject(failure);
  await expect(subscribeChannel(state)).rejects.toBe(failure);
  expect(state._subscription).toBe(client.subscription);
  expect(state._paused).toBe(true);
  expect(client.subscription.unsubscribes).toBe(1);
  client.subscription.readyResult = Promise.resolve();
  await subscribeChannel(state);
  expect(state._paused).toBe(false);
});

test('stale readiness cannot pause a newer lifecycle', async () => {
  const state = new State();
  const client = state.client;
  if (client === null) {
    throw new Error('client missing');
  }
  const waiting = deferredVoid();
  client.subscription.readyResult = waiting.promise;
  const first = subscribeChannel(state);
  state.unsubscribe();
  client.subscription.readyResult = Promise.resolve();
  await subscribeChannel(state);
  waiting.reject(new Error('stale'));
  await expect(first).rejects.toThrow('stale');
  expect(state._paused).toBe(false);
  expect(client.subscription.unsubscribes).toBe(1);
});

test('rejects readiness from a removed subscription', async () => {
  const state = new State();
  const client = state.client;
  if (client === null) {
    throw new Error('client missing');
  }
  const waiting = deferredVoid();
  client.subscription.readyResult = waiting.promise;
  const first = subscribeChannel(state);
  state._subscription = null;
  waiting.resolve();
  await expect(first).rejects.toThrow('Subscription changed');
});

test('direct activation preserves the existing subscription and rejects stale identity', async () => {
  const state = new State();
  const subscription = new Subscription();
  state._subscription = subscription;
  const waiting = deferredVoid();
  subscription.readyResult = waiting.promise;
  const first = activateChannelSubscription(state, subscription);
  state._lifecycleVersion += 1;
  waiting.resolve();
  await expect(first).rejects.toThrow('Subscription changed');
  expect(subscription.unsubscribes).toBe(0);
});
