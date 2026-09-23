type EventHandler = (context: unknown) => void | Promise<void>;

export interface ChannelSubscription {
  on(event: string, handler: EventHandler): void;
  off(event: string, handler: EventHandler): void;
  subscribe(): void;
  unsubscribe(): void;
  ready(timeout: number): Promise<void>;
}

export interface ChannelClient {
  newSubscription(name: string, options: { joinLeave: boolean }): ChannelSubscription;
  removeSubscription(subscription: ChannelSubscription): void;
  presence(name: string): Promise<unknown>;
}

interface PendingFetch {
  timer: ReturnType<typeof setTimeout> | null;
  ids: Map<string, { reject(error: Error): void }>;
}

export interface ChannelLifecycleState {
  _realtime: { getClient(): ChannelClient | null };
  _name: string;
  _type: string;
  _subscription: ChannelSubscription | null;
  _lifecycleVersion: number;
  _paused: boolean;
  _callbacks: Map<unknown, ((data: unknown, context?: unknown) => void)[]>;
  _presenceState: Record<string, unknown>;
  _presenceTimeoutId: ReturnType<typeof setTimeout> | null;
  _pendingFetches: Map<string, PendingFetch>;
  _eventHandlers: Record<string, EventHandler>;
  _updatePresenceState(context: unknown): void;
  _triggerPresenceSync(): void;
  _triggerEvent(event: string, data: unknown): void;
  _activateSubscription(): Promise<void>;
  _resetForIdentityChange(): void;
  unsubscribe(): void;
}

function property(value: unknown, key: string): unknown {
  if (typeof value !== 'object' || value === null) {
    return undefined;
  }
  return Reflect.get(value, key);
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function subscribeEvent(
  state: ChannelLifecycleState,
  subscription: ChannelSubscription,
  event: string,
  handler: EventHandler,
): void {
  state._eventHandlers[event] = handler;
  subscription.on(event, handler);
}

function notifyCallbacks(
  state: ChannelLifecycleState,
  event: unknown,
  data: unknown,
  context: unknown,
): void {
  for (const callback of state._callbacks.get(event) ?? []) {
    callback(data, context);
  }
}

function deliverPublication(state: ChannelLifecycleState, context: unknown): void {
  if (state._paused) {
    return;
  }
  const data = property(context, 'data');
  const eventValue = property(data, 'event');
  const event = Boolean(eventValue) ? eventValue : 'message';
  notifyCallbacks(state, event, data, context);
  notifyCallbacks(state, '*', data, context);
}

function bindPresence(state: ChannelLifecycleState, subscription: ChannelSubscription): void {
  subscribeEvent(state, subscription, 'presence', (context) => {
    if (state._paused) {
      return;
    }
    state._updatePresenceState(context);
    state._triggerPresenceSync();
  });
}

function bindJoin(state: ChannelLifecycleState, subscription: ChannelSubscription): void {
  subscribeEvent(state, subscription, 'join', (context) => {
    if (state._paused) {
      return;
    }
    const info = property(context, 'info');
    const client = property(info, 'client');
    if (typeof client !== 'string') {
      return;
    }
    state._presenceState[client] = info;
    state._triggerPresenceSync();
    state._triggerEvent('join', info);
  });
}

function bindLeave(state: ChannelLifecycleState, subscription: ChannelSubscription): void {
  subscribeEvent(state, subscription, 'leave', (context) => {
    if (state._paused) {
      return;
    }
    const info = property(context, 'info');
    const client = property(info, 'client');
    if (typeof client !== 'string') {
      return;
    }
    Reflect.deleteProperty(state._presenceState, client);
    state._triggerPresenceSync();
    state._triggerEvent('leave', info);
  });
}

function applyPresenceSnapshot(
  state: ChannelLifecycleState,
  presence: unknown,
  version: number,
): void {
  const clients = property(presence, 'clients');
  if (!record(clients) || version !== state._lifecycleVersion) {
    return;
  }
  state._presenceState = { ...clients };
  state._triggerPresenceSync();
}

async function refreshPresence(state: ChannelLifecycleState, version: number): Promise<void> {
  state._presenceTimeoutId = null;
  try {
    const client = state._realtime.getClient();
    if (client === null || state._subscription === null) {
      return;
    }
    applyPresenceSnapshot(state, await client.presence(state._name), version);
  } catch {
    // A presence snapshot is best effort; later events still update state.
  }
}

function bindSubscribed(state: ChannelLifecycleState, subscription: ChannelSubscription): void {
  subscribeEvent(state, subscription, 'subscribed', () => {
    if (state._paused) {
      return;
    }
    const version = state._lifecycleVersion;
    state._presenceTimeoutId = setTimeout(() => {
      void refreshPresence(state, version);
    }, 150);
  });
}

function bindSubscriptionEvents(
  state: ChannelLifecycleState,
  subscription: ChannelSubscription,
): void {
  subscribeEvent(state, subscription, 'state', (context) => {
    // Recovery publications can arrive before ready() resumes.
    if (state._subscription === subscription && property(context, 'newState') === 'subscribed') {
      state._paused = false;
    }
  });
  subscribeEvent(state, subscription, 'publication', (context) => {
    deliverPublication(state, context);
  });
  if (state._type === 'presence') {
    bindPresence(state, subscription);
    bindJoin(state, subscription);
    bindLeave(state, subscription);
    bindSubscribed(state, subscription);
  }
}

export async function activateChannelSubscription(
  state: ChannelLifecycleState,
  subscription: ChannelSubscription,
): Promise<void> {
  const version = state._lifecycleVersion;
  let ready = false;
  try {
    subscription.subscribe();
    await subscription.ready(10_000);
    if (!isCurrentSubscription(state, subscription, version)) {
      throw new Error('Subscription changed before becoming ready');
    }
    state._paused = false;
    ready = true;
  } finally {
    if (!ready && isCurrentSubscription(state, subscription, version)) {
      state.unsubscribe();
    }
  }
}

function isCurrentSubscription(
  state: ChannelLifecycleState,
  subscription: ChannelSubscription,
  version: number,
): boolean {
  return state._subscription === subscription && state._lifecycleVersion === version;
}

export async function subscribeChannel(state: ChannelLifecycleState): Promise<void> {
  if (state._subscription !== null) {
    await state._activateSubscription();
    return;
  }
  const client = state._realtime.getClient();
  if (client === null) {
    throw new Error('Not connected to realtime server');
  }
  const subscription = client.newSubscription(state._name, {
    joinLeave: state._type === 'presence',
  });
  state._subscription = subscription;
  bindSubscriptionEvents(state, subscription);
  await state._activateSubscription();
}

export function unsubscribeChannel(state: ChannelLifecycleState): void {
  state._paused = true;
  state._lifecycleVersion += 1;
  if (state._presenceTimeoutId !== null) {
    clearTimeout(state._presenceTimeoutId);
    state._presenceTimeoutId = null;
  }
  cancelPendingFetches(state);
  state._subscription?.unsubscribe();
  state._presenceState = {};
}

function cancelPendingFetches(state: ChannelLifecycleState): void {
  for (const batch of state._pendingFetches.values()) {
    if (batch.timer !== null) {
      clearTimeout(batch.timer);
    }
    for (const pending of batch.ids.values()) {
      pending.reject(new Error('Channel unsubscribed'));
    }
  }
  state._pendingFetches.clear();
}

export function resetChannelForIdentityChange(state: ChannelLifecycleState): void {
  state.unsubscribe();
  const subscription = state._subscription;
  if (subscription === null) {
    return;
  }
  detachSubscriptionHandlers(state, subscription);
  state._eventHandlers = {};
  removeSubscription(state, subscription);
  state._subscription = null;
}

function detachSubscriptionHandlers(
  state: ChannelLifecycleState,
  subscription: ChannelSubscription,
): void {
  for (const [event, handler] of Object.entries(state._eventHandlers)) {
    try {
      subscription.off(event, handler);
    } catch {
      // A detached listener must not prevent the rest of the cleanup.
    }
  }
}

function removeSubscription(state: ChannelLifecycleState, subscription: ChannelSubscription): void {
  const client = state._realtime.getClient();
  if (client !== null) {
    try {
      client.removeSubscription(subscription);
    } catch {
      // The client may already have removed this subscription.
    }
  }
}

export function disposeChannel(state: ChannelLifecycleState): void {
  state._resetForIdentityChange();
  state._callbacks.clear();
}
