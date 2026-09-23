import {
  activateChannelSubscription,
  type ChannelClient,
  type ChannelLifecycleState,
  type ChannelSubscription,
  disposeChannel,
  resetChannelForIdentityChange,
  subscribeChannel,
  unsubscribeChannel,
} from '../src/realtime-channel-lifecycle.ts';

type Handler = (context: unknown) => void | Promise<void>;

function notInitialized(): never {
  throw new Error('not initialized');
}

class Subscription implements ChannelSubscription {
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

class Client implements ChannelClient {
  readonly subscription = new Subscription();
  readonly created: { name: string; joinLeave: boolean; data?: Record<string, unknown> }[] = [];
  readonly removed: ChannelSubscription[] = [];
  presenceResult: Promise<unknown> = Promise.resolve({ clients: {} });
  presenceCalls: string[] = [];
  failRemove = false;

  newSubscription(
    name: string,
    options: { joinLeave: boolean; data?: Record<string, unknown> },
  ): ChannelSubscription {
    this.created.push({
      name,
      joinLeave: options.joinLeave,
      ...('data' in options ? { data: options.data } : {}),
    });
    return this.subscription;
  }

  removeSubscription(subscription: ChannelSubscription): void {
    if (this.failRemove) {
      throw new Error('already removed');
    }
    this.removed.push(subscription);
  }

  async presence(name: string): Promise<unknown> {
    this.presenceCalls.push(name);
    return this.presenceResult;
  }
}

class State implements ChannelLifecycleState {
  client: Client | null = new Client();
  _realtime = { getClient: (): Client | null => this.client };
  _name = 'broadcast:room';
  _type = 'broadcast';
  _databaseName: string | null = null;
  _myPresenceState: Record<string, unknown> | undefined;
  _presenceStateVersion = 0;
  _presenceAcknowledgedVersion = 0;
  _presenceResubscribePromise: Promise<void> | null = null;
  _activationPromise: Promise<void> | null = null;
  _subscription: ChannelSubscription | null = null;
  _lifecycleVersion = 0;
  _paused = false;
  _callbacks = new Map<unknown, ((data: unknown, context?: unknown) => void)[]>();
  _presenceState: Record<string, unknown> = {};
  _presenceTimeoutId: ReturnType<typeof setTimeout> | null = null;
  _pendingFetches = new Map<
    string,
    {
      timer: ReturnType<typeof setTimeout> | null;
      ids: Map<string, { reject(error: Error): void }>;
    }
  >();
  _eventHandlers: Record<string, Handler> = {};
  readonly updated: unknown[] = [];
  readonly events: { event: string; data: unknown }[] = [];
  syncs = 0;

  _updatePresenceState(context: unknown): void {
    this.updated.push(context);
  }

  _triggerPresenceSync(): void {
    this.syncs += 1;
  }

  _triggerEvent(event: string, data: unknown): void {
    this.events.push({ event, data });
  }

  async _activateSubscription(): Promise<void> {
    if (this._subscription === null) {
      throw new Error('subscription missing');
    }
    await activateChannelSubscription(this, this._subscription);
  }

  _awaitActivation(): Promise<void> {
    return this._activateSubscription();
  }

  _resetForIdentityChange(): void {
    resetChannelForIdentityChange(this);
  }

  unsubscribe(): void {
    unsubscribeChannel(this);
  }
}

function presenceState(): State {
  const state = new State();
  state._name = 'presence:lobby';
  state._type = 'presence';
  return state;
}

function deferred<T>(): {
  promise: Promise<T>;
  resolve(value: T): void;
  reject(error: Error): void;
} {
  let resolvePromise: (value: T) => void = notInitialized;
  let rejectPromise: (error: Error) => void = notInitialized;
  const promise = new Promise<T>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });
  return { promise, resolve: resolvePromise, reject: rejectPromise };
}

function deferredVoid(): {
  promise: Promise<void>;
  resolve(): void;
  reject(error: Error): void;
} {
  let resolvePromise: () => void = notInitialized;
  let rejectPromise: (error: Error) => void = notInitialized;
  const promise = new Promise<void>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });
  return { promise, resolve: resolvePromise, reject: rejectPromise };
}

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
  expect(received).toEqual([
    { text: 'default' },
    { text: 'default' },
    { event: 'custom' },
    { event: 'custom' },
  ]);
  await client.subscription.emit('publication', { data: { event: 'unhandled' } });
  expect(received.at(-1)).toEqual({ event: 'unhandled' });
  state.unsubscribe();
  await client.subscription.emit('publication', { data: { text: 'paused' } });
  expect(received).toHaveLength(5);
  await subscribeChannel(state);
  expect(client.created).toHaveLength(1);
  expect(client.subscription.subscribes).toBe(2);
  expect(state._paused).toBe(false);
  await client.subscription.emit('state', { newState: 'subscribing' });
  state._paused = true;
  await client.subscription.emit('state', { newState: 'subscribed' });
  expect(state._paused).toBe(false);
  state._subscription = null;
  state._paused = true;
  await client.subscription.emit('state', { newState: 'subscribed' });
  expect(state._paused).toBe(true);
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
    expect(state._presenceTimeoutId).toBeNull();
    expect(state._pendingFetches.size).toBe(0);
    expect(rejected.map((error) => error.message)).toEqual([
      'Channel unsubscribed',
      'Channel unsubscribed',
    ]);
    expect(state._subscription).toBe(client.subscription);
    expect(state._presenceState).toEqual({});
    expect(client.subscription.unsubscribes).toBe(1);
    await jest.advanceTimersByTimeAsync(150);
    expect(client.presenceCalls).toEqual([]);
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

test('presence events update state and are ignored while paused or malformed', async () => {
  const state = presenceState();
  await subscribeChannel(state);
  const client = state.client;
  if (client === null) {
    throw new Error('client missing');
  }
  const subscription = client.subscription;
  expect(client.created).toEqual([{ name: 'presence:lobby', joinLeave: true }]);
  await subscription.emit('presence', { clients: {} });
  expect(state.updated).toEqual([{ clients: {} }]);
  await subscription.emit('join', { info: { client: 'alice', user: 'user' } });
  expect(state._presenceState).toEqual({ alice: { client: 'alice', user: 'user' } });
  await subscription.emit('leave', { info: { client: 'alice' } });
  expect(state._presenceState).toEqual({});
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
  expect(state._presenceTimeoutId).toBeNull();
});

test('presence snapshot applies after delay and ignores stale and malformed results', async () => {
  jest.useFakeTimers();
  try {
    const state = presenceState();
    await subscribeChannel(state);
    const client = state.client;
    if (client === null) {
      throw new Error('client missing');
    }
    client.presenceResult = Promise.resolve({ clients: { alice: { client: 'alice' } } });
    await client.subscription.emit('subscribed', {});
    await jest.advanceTimersByTimeAsync(150);
    expect(client.presenceCalls).toEqual(['presence:lobby']);
    expect(state._presenceState).toEqual({ alice: { client: 'alice' } });
    expect(state._presenceTimeoutId).toBeNull();

    client.presenceResult = Promise.resolve({ clients: [] });
    await client.subscription.emit('subscribed', {});
    await jest.advanceTimersByTimeAsync(150);
    expect(state._presenceState).toEqual({ alice: { client: 'alice' } });

    const waiting = deferred<unknown>();
    client.presenceResult = waiting.promise;
    await client.subscription.emit('subscribed', {});
    await jest.advanceTimersByTimeAsync(150);
    state.unsubscribe();
    waiting.resolve({ clients: { stale: { client: 'stale' } } });
    await Promise.resolve();
    expect(state._presenceState).toEqual({});
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
    if (client === null) {
      throw new Error('client missing');
    }
    await client.subscription.emit('subscribed', {});
    state.client = null;
    await jest.advanceTimersByTimeAsync(150);
    expect(client.presenceCalls).toEqual([]);

    state.client = client;
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

test('readiness acknowledges only the presence version captured at activation', async () => {
  const state = presenceState();
  const subscription = new Subscription();
  state._subscription = subscription;
  state._presenceStateVersion = 3;
  const waiting = deferredVoid();
  subscription.readyResult = waiting.promise;
  const ready = activateChannelSubscription(state, subscription);
  state._presenceStateVersion = 4;
  waiting.resolve();
  await ready;
  expect(state._presenceAcknowledgedVersion).toBe(3);
  expect(state._paused).toBe(false);
});

test('broadcast readiness does not acknowledge presence state', async () => {
  const state = new State();
  state._presenceStateVersion = 3;
  await subscribeChannel(state);
  expect(state._presenceAcknowledgedVersion).toBe(0);
});

test('only postgres subscriptions send a nonempty database selector', async () => {
  const state = new State();
  state._databaseName = 'db';
  await subscribeChannel(state);
  const client = state.client;
  if (client === null) {
    throw new Error('client missing');
  }
  expect(client.created).toEqual([{ name: 'broadcast:room', joinLeave: false }]);
  resetChannelForIdentityChange(state);
  state._type = 'postgres';
  state._databaseName = null;
  await subscribeChannel(state);
  expect(client.created.at(-1)).toEqual({ name: 'broadcast:room', joinLeave: false });
  resetChannelForIdentityChange(state);
  state._databaseName = '';
  await subscribeChannel(state);
  expect(client.created.at(-1)).toEqual({ name: 'broadcast:room', joinLeave: false });
  resetChannelForIdentityChange(state);
  state._databaseName = 'db';
  await subscribeChannel(state);
  expect(client.created.at(-1)).toEqual({
    name: 'broadcast:room',
    joinLeave: false,
    data: { database_name: 'db' },
  });
});

test('unsubscribe advances lifecycle and does not clear an absent timer', () => {
  const state = new State();
  const clear = jest.spyOn(globalThis, 'clearTimeout');
  try {
    state.unsubscribe();
    expect(state._lifecycleVersion).toBe(1);
    expect(clear).not.toHaveBeenCalled();
  } finally {
    clear.mockRestore();
  }
});

test('unsubscribe clears only the pending fetch timer that exists', () => {
  jest.useFakeTimers();
  const clear = jest.spyOn(globalThis, 'clearTimeout');
  try {
    const state = new State();
    const timer = setTimeout(() => {
      state.syncs += 1;
    }, 100);
    state._pendingFetches.set('timed', { timer, ids: new Map() });
    state._pendingFetches.set('untimed', { timer: null, ids: new Map() });
    state.unsubscribe();
    expect(clear).toHaveBeenCalledTimes(1);
    expect(clear).toHaveBeenCalledWith(timer);
  } finally {
    clear.mockRestore();
    jest.useRealTimers();
  }
});
