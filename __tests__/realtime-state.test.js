const { VolcanoRealtime } = require('../src/realtime.ts');
const userToken = `header.${Buffer.from(
  JSON.stringify({ project_id: 'project', sub: 'user' }),
).toString('base64url')}.signature`;

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function createSubscription() {
  const handlers = new Map();
  const subscription = {
    state: 'unsubscribed',
    handlers,
    on: jest.fn((event, handler) => handlers.set(event, handler)),
    off: jest.fn((event) => handlers.delete(event)),
    subscribe: jest.fn(() => {
      subscription.state = 'subscribing';
    }),
    unsubscribe: jest.fn(() => {
      subscription.state = 'unsubscribed';
    }),
    ready: jest.fn(async () => {
      subscription.state = 'subscribed';
    }),
    publish: jest.fn(async () => {}),
    setData: jest.fn(),
  };
  return subscription;
}

function createRealtime(config = {}) {
  const subscriptions = [];
  const realtime = new VolcanoRealtime({
    apiUrl: 'https://api.example.com',
    anonKey: 'project.key',
    ...config,
  });
  const client = {
    newSubscription: jest.fn(() => {
      const subscription = createSubscription();
      subscriptions.push(subscription);
      return subscription;
    }),
    presence: jest.fn(),
    removeSubscription: jest.fn(),
  };
  jest.spyOn(realtime, 'getClient').mockReturnValue(client);
  return { realtime, client, subscriptions };
}

describe('realtime server state contract', () => {
  test('scopes postgres channel identity, subscription data, and publications by database', async () => {
    const { realtime, client } = createRealtime();
    const dbA = realtime.channel('public:items', {
      type: 'postgres',
      databaseName: 'db-a',
    });
    const dbB = realtime.channel('public:items', {
      type: 'postgres',
      databaseName: 'db-b',
    });
    const onA = jest.fn();
    const onB = jest.fn();

    expect(dbA).not.toBe(dbB);
    expect(dbA).toBe(realtime.channel('public:items', { type: 'postgres', databaseName: 'db-a' }));
    expect(dbA.name).toBe('postgres:db-a:public:items');
    expect(dbB.name).toBe('postgres:db-b:public:items');

    dbA.onPostgresChanges('INSERT', 'public', 'items', onA);
    dbB.onPostgresChanges('INSERT', 'public', 'items', onB);
    await dbA.subscribe();
    await dbB.subscribe();

    expect(client.newSubscription.mock.calls[0]).toEqual([
      'postgres:db-a:public:items',
      expect.objectContaining({ data: { database_name: 'db-a' } }),
    ]);
    expect(client.newSubscription.mock.calls[1]).toEqual([
      'postgres:db-b:public:items',
      expect.objectContaining({ data: { database_name: 'db-b' } }),
    ]);

    const change = {
      type: 'INSERT',
      schema: 'public',
      table: 'items',
      timestamp: '2026-09-23T00:00:00Z',
    };
    realtime._handleServerPublication({
      channel: 'project:postgres:db-a:public:items:user-a',
      data: change,
    });
    expect(onA).toHaveBeenCalledWith(change, expect.anything());
    expect(onB).not.toHaveBeenCalled();

    realtime._handleServerPublication({
      channel: 'project:postgres:db-b:public:items:user-b',
      data: change,
    });
    expect(onB).toHaveBeenCalledWith(change, expect.anything());
    expect(onA).toHaveBeenCalledTimes(1);
  });

  test.each([
    {
      name: 'legacy',
      options: { type: 'postgres' },
      serverChannel: 'project:postgres:public:items:service:key-id',
    },
    {
      name: 'database-scoped',
      options: { type: 'postgres', databaseName: 'app' },
      serverChannel: 'project:postgres:app:public:items:service:key-id',
    },
  ])('routes $name service-key postgres publications', ({ options, serverChannel }) => {
    const { realtime } = createRealtime({ accessToken: 'sk-project-key' });
    const channel = realtime.channel('public:items', options);
    const onDelete = jest.fn();
    channel.onPostgresChanges('DELETE', 'public', 'items', onDelete);
    const change = {
      type: 'DELETE',
      schema: 'public',
      table: 'items',
      id: 'row-1',
      timestamp: '2026-09-23T00:00:00Z',
    };

    realtime._handleServerPublication({ channel: serverChannel, data: change });

    expect(onDelete).toHaveBeenCalledWith(change, expect.anything());
  });

  test('keeps one-part user suffix routing for a table named service', () => {
    const { realtime } = createRealtime();
    const channel = realtime.channel('public:service', { type: 'postgres' });
    const onInsert = jest.fn();
    channel.onPostgresChanges('INSERT', 'public', 'service', onInsert);
    const change = {
      type: 'INSERT',
      schema: 'public',
      table: 'service',
      timestamp: '2026-09-23T00:00:00Z',
    };

    realtime._handleServerPublication({
      channel: 'project:postgres:public:service:user-uuid',
      data: change,
    });

    expect(onInsert).toHaveBeenCalledWith(change, expect.anything());
  });

  test('routes a legacy user publication before a colliding scoped channel', () => {
    const token = `header.${Buffer.from(
      JSON.stringify({ project_id: 'project', sub: 'user-id' }),
    ).toString('base64url')}.signature`;
    const { realtime } = createRealtime({ accessToken: token });
    const legacy = realtime.channel('public:items', { type: 'postgres' });
    const scoped = realtime.channel('items:user-id', {
      type: 'postgres',
      databaseName: 'public',
    });
    const onLegacy = jest.fn();
    const onScoped = jest.fn();
    legacy.on('*', onLegacy);
    scoped.on('*', onScoped);
    const change = {
      type: 'INSERT',
      schema: 'public',
      table: 'items',
      timestamp: '2026-09-23T00:00:00Z',
    };

    realtime._handleServerPublication({
      channel: 'project:postgres:public:items:user-id',
      data: change,
    });
    expect(onLegacy).toHaveBeenCalledWith(change, expect.anything());
    expect(onScoped).not.toHaveBeenCalled();

    const scopedChange = {
      type: 'INSERT',
      schema: 'items',
      table: 'user-id',
      timestamp: '2026-09-23T00:00:00Z',
    };
    realtime._handleServerPublication({
      channel: 'project:postgres:public:items:user-id:user-id',
      data: scopedChange,
    });
    expect(onScoped).toHaveBeenCalledWith(scopedChange, expect.anything());
    expect(onLegacy).toHaveBeenCalledTimes(1);

    realtime.removeChannel('public:items', { type: 'postgres', databaseName: null });
    realtime._handleServerPublication({
      channel: 'project:postgres:public:items:user-id',
      data: change,
    });
    expect(onScoped).toHaveBeenCalledTimes(1);
  });

  test('does not treat a malformed service recipient suffix as a scoped publication', () => {
    const { realtime } = createRealtime({ accessToken: 'sk-project-key' });
    const broadcast = realtime.channel('postgres:public:items');
    const scoped = realtime.channel('items:service', {
      type: 'postgres',
      databaseName: 'public',
    });
    const onBroadcast = jest.fn();
    const onScoped = jest.fn();
    broadcast.on('*', onBroadcast);
    scoped.on('*', onScoped);

    realtime._handleServerPublication({
      channel: 'project:broadcast:postgres:public:items:service:key-id',
      data: { type: 'DELETE' },
    });
    realtime._handleServerPublication({
      channel: 'project:postgres:public:items:service:key-id:extra',
      data: { type: 'DELETE' },
    });

    expect(onBroadcast).not.toHaveBeenCalled();
    expect(onScoped).not.toHaveBeenCalled();
  });

  test('does not attempt a Postgres fallback for an unmatched broadcast publication', () => {
    const { realtime } = createRealtime();
    const lookup = jest.spyOn(realtime._channels, 'get');
    realtime._handleServerPublication({ channel: 'project:broadcast:missing', data: {} });
    expect(lookup).toHaveBeenCalledTimes(1);
    expect(lookup).toHaveBeenCalledWith('broadcast:missing');
  });

  function expectExactScopedRecipient(accessToken) {
    const { realtime } = createRealtime({ accessToken });
    const legacy = realtime.channel('public:items', { type: 'postgres' });
    const scoped = realtime.channel('items:other', {
      type: 'postgres',
      databaseName: 'public',
    });
    const onLegacy = jest.fn();
    const onScoped = jest.fn();
    legacy.on('*', onLegacy);
    scoped.on('*', onScoped);
    const publication = {
      channel: 'project:postgres:public:items:other',
      data: { type: 'INSERT', schema: 'items', table: 'other' },
    };

    realtime._handleServerPublication(publication);

    expect(onLegacy).not.toHaveBeenCalled();
    expect(onScoped).toHaveBeenCalledWith(publication.data, expect.anything());
  }

  test('keeps an exact scoped channel for a service key with another suffix', () => {
    expectExactScopedRecipient('sk-project-key');
  });

  test('keeps an exact scoped channel for a user token with another suffix', () => {
    expectExactScopedRecipient(userToken);
  });

  test.each([
    ['service key', 'sk-project-key', 'service:key-id'],
    ['user token', userToken, 'user-uuid'],
  ])(
    'routes colliding legacy and scoped postgres channels for a %s',
    async (_name, accessToken, suffix) => {
      const { realtime } = createRealtime({ accessToken });
      const legacy = realtime.channel('public:items', { type: 'postgres' });
      const scoped = realtime.channel('items:service', {
        type: 'postgres',
        databaseName: 'public',
      });
      const onLegacy = jest.fn();
      const onScoped = jest.fn();
      legacy.onPostgresChanges('DELETE', 'public', 'items', onLegacy);
      scoped.onPostgresChanges('DELETE', 'items', 'service', onScoped);
      await legacy.subscribe();
      await scoped.subscribe();
      const legacyChange = {
        type: 'DELETE',
        schema: 'public',
        table: 'items',
        timestamp: '2026-09-23T00:00:00Z',
      };
      const scopedChange = {
        type: 'DELETE',
        schema: 'items',
        table: 'service',
        timestamp: '2026-09-23T00:00:00Z',
      };

      const legacyPublication = {
        channel: `project:postgres:public:items:${suffix}`,
        data: legacyChange,
      };
      const scopedPublication = {
        channel: `project:postgres:public:items:service:${suffix}`,
        data: scopedChange,
      };
      realtime._handleServerPublication(legacyPublication);
      realtime._handleServerPublication(scopedPublication);

      expect(onLegacy).toHaveBeenCalledWith(legacyChange, expect.anything());
      expect(onScoped).toHaveBeenCalledWith(scopedChange, expect.anything());
      expect(onLegacy).toHaveBeenCalledTimes(1);
      expect(onScoped).toHaveBeenCalledTimes(1);
    },
  );

  test('uses an adopted access token when routing colliding postgres channels', async () => {
    const { realtime } = createRealtime({ accessToken: userToken });
    const legacy = realtime.channel('public:items', { type: 'postgres' });
    const scoped = realtime.channel('items:service', {
      type: 'postgres',
      databaseName: 'public',
    });
    const onLegacy = jest.fn();
    const onScoped = jest.fn();
    legacy.onPostgresChanges('DELETE', 'public', 'items', onLegacy);
    scoped.onPostgresChanges('DELETE', 'items', 'service', onScoped);

    realtime._adoptAccessToken('sk-project-key');
    await legacy.subscribe();
    await scoped.subscribe();
    const legacyChange = {
      type: 'DELETE',
      schema: 'public',
      table: 'items',
      timestamp: '2026-09-23T00:00:00Z',
    };
    realtime._handleServerPublication({
      channel: 'project:postgres:public:items:service:key-id',
      data: legacyChange,
    });
    expect(onLegacy).toHaveBeenCalledWith(legacyChange, expect.anything());
    expect(onScoped).not.toHaveBeenCalled();

    realtime._adoptAccessToken(userToken);
    await legacy.subscribe();
    await scoped.subscribe();
    const scopedChange = {
      type: 'DELETE',
      schema: 'items',
      table: 'service',
      timestamp: '2026-09-23T00:00:00Z',
    };
    realtime._handleServerPublication({
      channel: 'project:postgres:public:items:service:user-uuid',
      data: scopedChange,
    });
    expect(onScoped).toHaveBeenCalledWith(scopedChange, expect.anything());
  });

  test('rejects malformed service-key postgres publication shapes', () => {
    const { realtime } = createRealtime({ accessToken: 'sk-project-key' });
    const channel = realtime.channel('public:items', { type: 'postgres' });
    const onDelete = jest.fn();
    channel.onPostgresChanges('DELETE', 'public', 'items', onDelete);
    const change = {
      type: 'DELETE',
      schema: 'public',
      table: 'items',
      timestamp: '2026-09-23T00:00:00Z',
    };

    realtime._handleServerPublication({
      channel: 'project:postgres:extra:public:items:service:key-id',
      data: change,
    });
    realtime._handleServerPublication({
      channel: 'project:postgres:public:items:service:',
      data: change,
    });

    expect(onDelete).not.toHaveBeenCalled();
  });

  test('uses the global selector in scoped identity when the channel selector is absent', async () => {
    const { realtime, client } = createRealtime({ databaseName: 'db-global' });

    const channel = realtime.channel('public:items', { type: 'postgres' });
    expect(channel.name).toBe('postgres:db-global:public:items');
    await channel.subscribe();

    expect(client.newSubscription).toHaveBeenCalledWith(
      'postgres:db-global:public:items',
      expect.objectContaining({ data: { database_name: 'db-global' } }),
    );
  });

  test('formats only nonempty postgres selectors into channel identity', () => {
    const { realtime } = createRealtime();
    expect(realtime._formatChannelName('public:items', 'postgres', null)).toBe(
      'postgres:public:items',
    );
    expect(realtime._formatChannelName('public:items', 'postgres', '')).toBe(
      'postgres:public:items',
    );
    expect(realtime._formatChannelName('public:items', 'postgres', 'app')).toBe(
      'postgres:app:public:items',
    );
    expect(realtime._formatChannelName('room', 'presence', 'app')).toBe('presence:room');
  });

  test('does not attach a configured database selector to a broadcast transport', async () => {
    const { realtime, client } = createRealtime({ databaseName: 'app' });
    const channel = realtime.channel('room');
    await channel.subscribe();
    expect(channel._databaseName).toBeNull();
    expect(client.newSubscription).toHaveBeenCalledWith('broadcast:room', { joinLeave: false });
  });

  test('keeps no-selector postgres channels on the legacy wire identity', async () => {
    const { realtime, client } = createRealtime();

    const channel = realtime.channel('public:items', { type: 'postgres' });
    expect(channel.name).toBe('postgres:public:items');
    await channel.subscribe();

    expect(client.newSubscription).toHaveBeenCalledWith(
      'postgres:public:items',
      expect.not.objectContaining({ data: expect.anything() }),
    );
  });

  test('keeps a channel selector fixed after the global selector changes', async () => {
    const { realtime, client } = createRealtime();
    const legacy = realtime.channel('public:items', { type: 'postgres' });
    const onLegacy = jest.fn();
    legacy.onPostgresChanges('INSERT', 'public', 'items', onLegacy);

    realtime.setDatabaseName('db-a');
    await legacy.subscribe();

    expect(client.newSubscription).toHaveBeenCalledWith(
      'postgres:public:items',
      expect.not.objectContaining({ data: expect.anything() }),
    );
    const change = {
      type: 'INSERT',
      schema: 'public',
      table: 'items',
      timestamp: '2026-09-23T00:00:00Z',
    };
    realtime._handleServerPublication({
      channel: 'project:postgres:public:items:user-a',
      data: change,
    });
    expect(onLegacy).toHaveBeenCalledWith(change, expect.anything());

    legacy._resetForIdentityChange();
    await legacy.subscribe();
    expect(client.newSubscription).toHaveBeenLastCalledWith(
      'postgres:public:items',
      expect.not.objectContaining({ data: expect.anything() }),
    );

    const scoped = realtime.channel('public:items', { type: 'postgres' });
    expect(scoped).not.toBe(legacy);
    expect(scoped.name).toBe('postgres:db-a:public:items');
    await scoped.subscribe();
    expect(client.newSubscription).toHaveBeenLastCalledWith(
      'postgres:db-a:public:items',
      expect.objectContaining({ data: { database_name: 'db-a' } }),
    );
    realtime.removeChannel('public:items', { type: 'postgres', databaseName: null });
    expect(realtime._channels.has(legacy.name)).toBe(false);
    expect(realtime._channels.has(scoped.name)).toBe(true);
    realtime.removeChannel('public:items', 'postgres');
    expect(realtime._channels.has(scoped.name)).toBe(false);
  });

  test('keeps auto-fetch bound to the selector captured when the channel was created', async () => {
    const query = {
      select: jest.fn().mockReturnThis(),
      in: jest.fn().mockResolvedValue({ data: [{ id: 'row-1' }], error: null }),
    };
    const database = jest.fn(() => ({ from: jest.fn(() => query) }));
    const { realtime } = createRealtime({
      databaseName: 'db-a',
      volcanoClient: { from: jest.fn(), database },
    });
    const channel = realtime.channel('public:items', { type: 'postgres' });
    realtime.setDatabaseName('db-b');

    await expect(channel._fetchRow('public', 'items', 'row-1')).resolves.toEqual({ id: 'row-1' });
    expect(database).toHaveBeenCalledWith('db-a');
  });

  test('does not acquire an auto-fetch selector after creating a legacy channel', async () => {
    const database = jest.fn();
    const { realtime } = createRealtime({ volcanoClient: { from: jest.fn(), database } });
    const channel = realtime.channel('public:items', { type: 'postgres' });
    realtime.setDatabaseName('db-a');

    await expect(channel._fetchRow('public', 'items', 'row-1')).rejects.toThrow(
      'Database name not set',
    );
    expect(database).not.toHaveBeenCalled();
  });

  test('captures the selected volcano client database when creating a channel', async () => {
    const { realtime, client } = createRealtime({
      volcanoClient: { _currentDatabaseName: 'db-a' },
    });
    const channel = realtime.channel('public:items', { type: 'postgres' });

    expect(channel.name).toBe('postgres:db-a:public:items');
    await channel.subscribe();
    expect(client.newSubscription).toHaveBeenCalledWith(
      'postgres:db-a:public:items',
      expect.objectContaining({ data: { database_name: 'db-a' } }),
    );
  });

  test('ignores an empty bound-client database selector for identity and auto-fetch', async () => {
    const database = jest.fn();
    const { realtime } = createRealtime({
      volcanoClient: { _currentDatabaseName: '', from: jest.fn(), database },
    });
    const channel = realtime.channel('public:items', { type: 'postgres' });
    expect(channel.name).toBe('postgres:public:items');
    await expect(channel._fetchRow('public', 'items', 'row-1')).rejects.toThrow(
      'Database name not set',
    );
    expect(database).not.toHaveBeenCalled();
  });

  test('ignores a non-string bound-client database selector', () => {
    const { realtime } = createRealtime({ volcanoClient: { _currentDatabaseName: 7 } });
    expect(realtime.channel('public:items', { type: 'postgres' }).name).toBe(
      'postgres:public:items',
    );
  });

  test('removes and resubscribes only the requested scoped channel', async () => {
    const { realtime, client, subscriptions } = createRealtime();
    const dbA = realtime.channel('public:items', {
      type: 'postgres',
      databaseName: 'db-a',
    });
    const dbB = realtime.channel('public:items', {
      type: 'postgres',
      databaseName: 'db-b',
    });

    await dbA.subscribe();
    await dbB.subscribe();
    dbA.unsubscribe();
    await dbA.subscribe();

    expect(subscriptions[0].unsubscribe).toHaveBeenCalledTimes(1);
    expect(client.newSubscription).toHaveBeenCalledTimes(2);
    expect(subscriptions[0].setData).not.toHaveBeenCalled();

    realtime.removeChannel('public:items', 'postgres', 'db-a');
    expect(subscriptions[0].unsubscribe).toHaveBeenCalledTimes(2);
    expect(realtime.channel('public:items', { type: 'postgres', databaseName: 'db-b' })).toBe(dbB);
    expect(realtime.channel('public:items', { type: 'postgres', databaseName: 'db-a' })).not.toBe(
      dbA,
    );
  });

  test('transmits the configured database selector when subscribing', async () => {
    const { realtime, client } = createRealtime({ databaseName: 'app' });

    await realtime.channel('public:items', { type: 'postgres' }).subscribe();

    const subscriptionOptions = client.newSubscription.mock.calls[0][1];
    expect(subscriptionOptions).toEqual(
      expect.objectContaining({ data: { database_name: 'app' } }),
    );
  });

  test.each([
    { code: 400, message: 'database selector required' },
    { code: 401, message: 'unknown database selector' },
  ])('surfaces the server $message error', async (serverError) => {
    const { realtime, client } = createRealtime({ databaseName: 'app' });
    const channel = realtime.channel('public:items', { type: 'postgres' });
    let receivedOptions;
    client.newSubscription.mockImplementationOnce((_name, options) => {
      receivedOptions = options;
      const subscription = createSubscription();
      subscription.ready.mockRejectedValueOnce(serverError);
      return subscription;
    });

    await expect(channel.subscribe()).rejects.toMatchObject(serverError);
    expect(receivedOptions).toEqual(expect.objectContaining({ data: { database_name: 'app' } }));
  });

  test('publishes tracked state through the presence subscription', async () => {
    const { realtime, subscriptions } = createRealtime();
    const channel = realtime.channel('lobby', { type: 'presence' });
    await channel.subscribe();

    const state = { status: 'working', task: 'build', steps: [{ label: 'compile' }] };
    await channel.track(state);

    expect(subscriptions[0].setData).toHaveBeenCalledWith(state);
    state.status = 'changed-after-track';
    state.steps[0].label = 'changed-after-track';
    expect(subscriptions[0].setData.mock.calls[0][0]).toEqual({
      status: 'working',
      task: 'build',
      steps: [{ label: 'compile' }],
    });
  });

  test('rejects malformed tracked state and does not send it after identity reset', async () => {
    const { realtime, subscriptions } = createRealtime();
    const channel = realtime.channel('lobby', { type: 'presence' });
    await channel.subscribe();
    await expect(channel.track(null)).rejects.toThrow('Presence state must be a JSON object');
    channel._resetForIdentityChange();
    channel._updateTrackedSubscriptionData();
    expect(subscriptions[0].setData).not.toHaveBeenCalled();
  });

  test('includes tracked state in the initial presence subscription', async () => {
    const { realtime, client } = createRealtime();
    const channel = realtime.channel('lobby', { type: 'presence' });
    await channel.track({ status: 'working' });

    await channel.subscribe();

    expect(client.newSubscription.mock.calls[0][1]).toEqual(
      expect.objectContaining({ data: { status: 'working' } }),
    );
  });

  test('keeps initial and live presence callback entries in one shape', async () => {
    const { realtime } = createRealtime();
    const channel = realtime.channel('lobby', { type: 'presence' });
    const onSync = jest.fn();
    channel.onPresenceSync(onSync);
    await channel.subscribe();

    const transportInfo = {
      client: 'remote-client',
      user: 'user-id',
      chanInfo: { status: 'working' },
      connInfo: { user_metadata: { display_name: 'Contract' } },
    };
    realtime._handleServerSubscribed({
      channel: 'project:presence:lobby',
      data: { presence: { 'remote-client': transportInfo } },
    });
    const initial = onSync.mock.lastCall[0];
    realtime._handleServerJoin({ channel: 'project:presence:lobby', info: transportInfo });
    const live = onSync.mock.lastCall[0];

    expect(initial).toEqual({
      'remote-client': {
        ...transportInfo,
        data: { status: 'working' },
      },
    });
    expect(live).toEqual(initial);
    expect(transportInfo).not.toHaveProperty('data');
  });

  test('emits named join and leave events for server presence changes', async () => {
    const { realtime } = createRealtime();
    const channel = realtime.channel('lobby', { type: 'presence' });
    const onJoin = jest.fn();
    const onLeave = jest.fn();
    channel.on('join', onJoin);
    channel.on('leave', onLeave);
    await channel.subscribe();

    const info = { client: 'remote-client', chanInfo: { status: 'working' } };
    realtime._handleServerJoin({ channel: 'project:presence:lobby', info });
    realtime._handleServerLeave({ channel: 'project:presence:lobby', info });

    expect(onJoin).toHaveBeenCalledWith(
      {
        client: 'remote-client',
        chanInfo: { status: 'working' },
        data: { status: 'working' },
      },
      undefined,
    );
    expect(onLeave).toHaveBeenCalledWith(
      {
        client: 'remote-client',
        chanInfo: { status: 'working' },
        data: { status: 'working' },
      },
      undefined,
    );
  });

  test('ignores a malformed leave client when retaining other presence entries', async () => {
    const { realtime } = createRealtime();
    const channel = realtime.channel('lobby', { type: 'presence' });
    await channel.subscribe();
    channel._presenceState.undefined = { client: 'undefined' };

    realtime._handleServerLeave({ channel: 'project:presence:lobby', info: {} });

    expect(channel._presenceState.undefined).toEqual({ client: 'undefined' });
  });

  test('resends the current tracked state after resubscribe', async () => {
    const { realtime, subscriptions } = createRealtime();
    const channel = realtime.channel('lobby', { type: 'presence' });
    await channel.subscribe();
    const state = { status: 'away' };
    await channel.track(state);

    channel.unsubscribe();
    await channel.subscribe();

    expect(subscriptions[0].setData).toHaveBeenCalledTimes(1);
    expect(subscriptions[0].setData.mock.calls[0][0]).toEqual(state);
  });

  test('waits until the latest concurrent tracked state is acknowledged', async () => {
    const { realtime, subscriptions } = createRealtime();
    const channel = realtime.channel('lobby', { type: 'presence' });
    await channel.subscribe();
    const subscription = subscriptions[0];
    const firstReady = deferred();
    const secondReady = deferred();
    const sent = [];
    let currentData;
    subscription.setData.mockImplementation((state) => {
      currentData = state;
    });
    subscription.subscribe.mockImplementation(() => {
      sent.push(JSON.parse(JSON.stringify(currentData)));
    });
    subscription.ready
      .mockReset()
      .mockReturnValueOnce(firstReady.promise)
      .mockReturnValueOnce(secondReady.promise);

    const first = channel.track({ status: 'away' });
    let secondResolved = false;
    const second = channel.track({ status: 'busy' }).then(() => {
      secondResolved = true;
    });
    await Promise.resolve();

    expect(sent).toEqual([{ status: 'away' }]);
    expect(secondResolved).toBe(false);

    firstReady.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(sent).toEqual([{ status: 'away' }, { status: 'busy' }]);
    expect(subscription.setData).toHaveBeenCalledTimes(3);
    expect(secondResolved).toBe(false);

    secondReady.resolve();
    await Promise.all([first, second]);
    expect(secondResolved).toBe(true);
  });

  test('track during first subscribe preserves both acknowledgements', async () => {
    const { realtime, client, subscriptions } = createRealtime();
    const channel = realtime.channel('lobby', { type: 'presence' });
    const firstReady = deferred();
    const secondReady = deferred();
    let initialData;
    client.newSubscription.mockImplementationOnce((_name, options) => {
      initialData = options.data;
      const subscription = createSubscription();
      subscription.ready
        .mockReset()
        .mockReturnValueOnce(firstReady.promise)
        .mockReturnValueOnce(secondReady.promise);
      subscriptions.push(subscription);
      return subscription;
    });
    let subscribed = false;
    let tracked = false;
    const subscribe = channel.subscribe().then(() => {
      subscribed = true;
    });
    const track = channel.track({ status: 'working' }).then(() => {
      tracked = true;
    });
    const subscription = subscriptions[0];

    expect(initialData).toBeUndefined();
    expect(subscription.unsubscribe).not.toHaveBeenCalled();
    expect(subscribed).toBe(false);
    expect(tracked).toBe(false);

    firstReady.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(subscribed).toBe(false);
    expect(tracked).toBe(false);
    expect(subscription.unsubscribe).toHaveBeenCalledTimes(1);
    expect(subscription.subscribe).toHaveBeenCalledTimes(2);
    expect(subscription.setData).toHaveBeenLastCalledWith({ status: 'working' });

    secondReady.resolve();
    await Promise.all([subscribe, track]);
    expect(subscribed).toBe(true);
    expect(tracked).toBe(true);
  });

  test('cleans up when initial subscribe fails while track waits for it', async () => {
    const { realtime, client, subscriptions } = createRealtime();
    const channel = realtime.channel('lobby', { type: 'presence' });
    const ready = deferred();
    client.newSubscription.mockImplementationOnce(() => {
      const subscription = createSubscription();
      subscription.ready.mockReset().mockReturnValue(ready.promise);
      subscriptions.push(subscription);
      return subscription;
    });
    const subscribe = channel.subscribe();
    const track = channel.track({ status: 'working' });
    const failure = new Error('denied');
    ready.reject(failure);

    await expect(subscribe).rejects.toBe(failure);
    await expect(track).rejects.toBe(failure);
    expect(subscriptions[0].unsubscribe).toHaveBeenCalledTimes(1);
    expect(channel._paused).toBe(true);
    expect(channel._presenceResubscribePromise).toBeNull();
  });

  test('stores tracked state without resubscribing an explicitly paused channel', async () => {
    const { realtime, subscriptions } = createRealtime();
    const channel = realtime.channel('lobby', { type: 'presence' });
    await channel.subscribe();
    const subscription = subscriptions[0];
    subscription.subscribe.mockClear();
    channel.unsubscribe();

    await channel.track({ status: 'offline' });

    expect(subscription.setData).toHaveBeenLastCalledWith({ status: 'offline' });
    expect(subscription.subscribe).not.toHaveBeenCalled();

    await channel.subscribe();
    expect(subscription.subscribe).toHaveBeenCalledTimes(1);
  });

  test('subscribe waits for a tracked state update already in flight', async () => {
    const { realtime, subscriptions } = createRealtime();
    const channel = realtime.channel('lobby', { type: 'presence' });
    await channel.subscribe();
    const subscription = subscriptions[0];
    const ready = deferred();
    subscription.ready.mockReturnValueOnce(ready.promise);

    const tracked = channel.track({ status: 'working' });
    const subscribed = channel.subscribe();
    expect(subscription.subscribe).toHaveBeenCalledTimes(2);

    ready.resolve();
    await Promise.all([tracked, subscribed]);
    expect(subscription.subscribe).toHaveBeenCalledTimes(2);
  });

  test('explicit pause cancels an in-flight tracked-state attempt without poisoning immediate resume', async () => {
    const { realtime, subscriptions } = createRealtime();
    const channel = realtime.channel('lobby', { type: 'presence' });
    await channel.subscribe();
    const subscription = subscriptions[0];
    const cancelledReady = deferred();
    const resumedReady = deferred();
    const latestReady = deferred();
    subscription.ready
      .mockReturnValueOnce(cancelledReady.promise)
      .mockReturnValueOnce(resumedReady.promise)
      .mockReturnValueOnce(latestReady.promise);

    const tracked = channel.track({ status: 'working' }).catch((error) => error);
    channel.unsubscribe();
    let resumedCompleted = false;
    const resumed = channel.subscribe().then(() => {
      resumedCompleted = true;
    });
    expect(subscription.subscribe).toHaveBeenCalledTimes(3);
    await Promise.resolve();
    expect(resumedCompleted).toBe(false);

    resumedReady.resolve();
    await expect(resumed).resolves.toBeUndefined();
    expect(resumedCompleted).toBe(true);
    expect(channel._paused).toBe(false);

    const latest = channel.track({ status: 'online' });
    const latestAttempt = channel._presenceResubscribePromise;
    expect(subscription.subscribe).toHaveBeenCalledTimes(4);
    const cancellation = new Error('subscription unsubscribed');
    cancelledReady.reject(cancellation);
    await expect(tracked).resolves.toBe(cancellation);
    expect(channel._presenceResubscribePromise).toBe(latestAttempt);

    latestReady.resolve();
    await expect(latest).resolves.toBeUndefined();
    expect(channel._paused).toBe(false);
    expect(channel._presenceResubscribePromise).toBeNull();
  });

  test('track while explicitly paused saves state as the cancelled attempt settles', async () => {
    const { realtime, subscriptions } = createRealtime();
    const channel = realtime.channel('lobby', { type: 'presence' });
    await channel.subscribe();
    const subscription = subscriptions[0];
    const cancelledReady = deferred();
    subscription.ready.mockReturnValueOnce(cancelledReady.promise);

    const tracked = channel.track({ status: 'working' }).catch((error) => error);
    channel.unsubscribe();
    await expect(channel.track({ status: 'offline' })).resolves.toBeUndefined();
    expect(subscription.setData).toHaveBeenLastCalledWith({ status: 'offline' });
    expect(subscription.subscribe).toHaveBeenCalledTimes(2);

    const cancellation = new Error('subscription unsubscribed');
    cancelledReady.reject(cancellation);
    await expect(tracked).resolves.toBe(cancellation);
    await channel.subscribe();
    expect(subscription.subscribe).toHaveBeenCalledTimes(3);
    expect(subscription.setData).toHaveBeenLastCalledWith({ status: 'offline' });
  });

  test('explicit pause after readiness prevents a stale tracked-state retry', async () => {
    const { realtime, subscriptions } = createRealtime();
    const channel = realtime.channel('lobby', { type: 'presence' });
    await channel.subscribe();
    const subscription = subscriptions[0];
    const ready = deferred();
    subscription.ready.mockReturnValueOnce(ready.promise);

    const tracked = channel.track({ status: 'working' });
    ready.resolve();
    await Promise.resolve();
    channel.unsubscribe();
    await channel.track({ status: 'offline' });
    await tracked;

    expect(channel._paused).toBe(true);
    expect(subscription.subscribe).toHaveBeenCalledTimes(2);
    expect(subscription.setData).toHaveBeenLastCalledWith({ status: 'offline' });
    await channel.subscribe();
    expect(subscription.subscribe).toHaveBeenCalledTimes(3);
  });

  test('fails a tracked-state retry that completes without acknowledging its snapshot', async () => {
    const { realtime } = createRealtime();
    const channel = realtime.channel('lobby', { type: 'presence' });
    channel._presenceStateVersion = 1;
    channel._activateSubscription = jest
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('Unexpected retry'));

    await expect(channel._resubscribeTrackedPresence()).rejects.toThrow(
      'Tracked presence state made no progress',
    );
    expect(channel._activateSubscription).toHaveBeenCalledTimes(1);
  });

  test('fails a completed tracked-state promise that made no acknowledgment progress', async () => {
    const { realtime } = createRealtime();
    const channel = realtime.channel('lobby', { type: 'presence' });
    channel._presenceStateVersion = 1;
    channel._awaitTrackedResubscribe = jest
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('Unexpected retry'));

    await expect(channel._ensureTrackedPresenceAcknowledged()).rejects.toThrow(
      'Tracked presence state made no progress',
    );
    expect(channel._awaitTrackedResubscribe).toHaveBeenCalledTimes(1);
  });

  test('keeps a newer activation promise when an older activation settles', async () => {
    const { realtime } = createRealtime();
    const channel = realtime.channel('room');
    const older = deferred();
    const newer = deferred();
    channel._activationPromise = older.promise;
    const waiting = channel._awaitActivation();
    channel._activationPromise = newer.promise;
    older.resolve();

    await waiting;
    expect(channel._activationPromise).toBe(newer.promise);
    newer.resolve();
  });

  test('track waits for initial activation before attempting a replacement', async () => {
    const { realtime, subscriptions } = createRealtime();
    const channel = realtime.channel('room', { type: 'presence' });
    await channel.subscribe();
    const activation = deferred();
    channel._activationPromise = activation.promise;
    const tracked = channel.track({ status: 'away' });
    expect(subscriptions[0].unsubscribe).not.toHaveBeenCalled();

    activation.resolve();
    await tracked;
    expect(subscriptions[0].unsubscribe).toHaveBeenCalledTimes(1);
  });

  test('does not retry presence after its current state was already acknowledged', async () => {
    const { realtime } = createRealtime();
    const channel = realtime.channel('room', { type: 'presence' });
    channel._presenceStateVersion = 1;
    channel._presenceAcknowledgedVersion = 1;
    channel._activateSubscription = jest.fn();

    await channel._resubscribeTrackedPresence();
    expect(channel._activateSubscription).not.toHaveBeenCalled();
  });

  test('only updates a tracked transport when both subscription and state exist', async () => {
    const { realtime, subscriptions } = createRealtime();
    const channel = realtime.channel('room', { type: 'presence' });
    channel._updateTrackedSubscriptionData();
    await channel.subscribe();
    const subscription = subscriptions[0];
    channel._updateTrackedSubscriptionData();
    expect(subscription.setData).not.toHaveBeenCalled();

    channel._myPresenceState = { status: 'away' };
    channel._updateTrackedSubscriptionData();
    expect(subscription.setData).toHaveBeenCalledTimes(1);
    expect(subscription.setData).toHaveBeenCalledWith({ status: 'away' });
    channel._subscription = null;
    channel._updateTrackedSubscriptionData();
    expect(subscription.setData).toHaveBeenCalledTimes(1);
  });
});
