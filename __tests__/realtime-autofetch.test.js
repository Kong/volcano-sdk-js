/**
 * Realtime Auto-Fetch Unit Tests
 *
 * These tests verify the auto-fetch functionality for lightweight notifications
 * in Phase 3 of the realtime scalability implementation.
 */

const { VolcanoRealtime } = require('../src/realtime.js');

// Mock volcano client for database queries
const createMockVolcanoClient = (mockData = []) => {
  const query = {
    select: jest.fn().mockReturnThis(),
    in: jest.fn().mockResolvedValue({ data: mockData, error: null }),
  };

  const client = {
    _currentDatabaseName: null,
    database: jest.fn((name) => {
      client._currentDatabaseName = name;
      return client;
    }),
    from: jest.fn(() => query),
  };

  return { client, query };
};

describe('Realtime Auto-Fetch', () => {
  let realtime;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    realtime = new VolcanoRealtime({
      apiUrl: 'https://api.example.com',
      anonKey: 'project123.secret',
      accessToken: 'token123',
      databaseName: 'testdb',
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('constructor', () => {
    test('stores volcanoClient when provided', () => {
      const { client: mockClient } = createMockVolcanoClient();
      const rt = new VolcanoRealtime({
        apiUrl: 'https://api.example.com',
        anonKey: 'test.key',
        volcanoClient: mockClient,
        databaseName: 'testdb',
      });

      expect(rt.getVolcanoClient()).toBe(mockClient);
    });

    test('default fetch config is set', () => {
      const config = realtime.getFetchConfig();

      expect(config.batchWindowMs).toBe(20);
      expect(config.maxBatchSize).toBe(50);
      expect(config.enabled).toBe(true);
    });

    test('custom fetch config is applied', () => {
      const rt = new VolcanoRealtime({
        apiUrl: 'https://api.example.com',
        anonKey: 'test.key',
        fetchConfig: {
          batchWindowMs: 100,
          maxBatchSize: 25,
          enabled: false,
        },
      });

      const config = rt.getFetchConfig();
      expect(config.batchWindowMs).toBe(100);
      expect(config.maxBatchSize).toBe(25);
      expect(config.enabled).toBe(false);
    });
  });

  describe('setVolcanoClient', () => {
    test('sets volcanoClient after construction', () => {
      const { client: mockClient } = createMockVolcanoClient();

      expect(realtime.getVolcanoClient()).toBeNull();

      realtime.setVolcanoClient(mockClient);

      expect(realtime.getVolcanoClient()).toBe(mockClient);
    });
  });

  describe('channel fetch config', () => {
    test('channel inherits fetch config from realtime', () => {
      const rt = new VolcanoRealtime({
        apiUrl: 'https://api.example.com',
        anonKey: 'test.key',
        fetchConfig: {
          batchWindowMs: 100,
        },
      });

      const channel = rt.channel('test', { type: 'postgres' });

      expect(channel._fetchConfig.batchWindowMs).toBe(100);
    });

    test('channel can override fetch config', () => {
      const rt = new VolcanoRealtime({
        apiUrl: 'https://api.example.com',
        anonKey: 'test.key',
        fetchConfig: {
          batchWindowMs: 100,
        },
      });

      const channel = rt.channel('test', {
        type: 'postgres',
        fetchBatchWindowMs: 50,
      });

      expect(channel._fetchConfig.batchWindowMs).toBe(50);
    });

    test('autoFetch:false disables fetch for channel', () => {
      const channel = realtime.channel('test', {
        type: 'postgres',
        autoFetch: false,
      });

      expect(channel._fetchConfig.enabled).toBe(false);
    });
  });

  describe('_handlePublication', () => {
    test('full payloads delivered immediately', () => {
      const channel = realtime.channel('public:users', { type: 'postgres' });

      const callback = jest.fn();
      channel.on('INSERT', callback);

      // Simulate full payload
      channel._handlePublication({
        data: {
          type: 'INSERT',
          schema: 'public',
          table: 'users',
          record: { id: 1, name: 'Alice' },
        },
      });

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'INSERT',
          record: { id: 1, name: 'Alice' },
        }),
        expect.anything(),
      );
    });

    test('DELETE delivers without fetch (old_record optional)', () => {
      const channel = realtime.channel('public:users', { type: 'postgres' });

      const callback = jest.fn();
      channel.on('DELETE', callback);

      // Simulate lightweight DELETE
      channel._handlePublication({
        data: {
          mode: 'lightweight',
          type: 'DELETE',
          schema: 'public',
          table: 'users',
          id: 42,
          timestamp: '2024-01-01T00:00:00Z',
        },
      });

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'DELETE',
          old_record: { id: 42 },
        }),
        expect.anything(),
      );
    });

    test('autoFetch:false delivers lightweight as-is', () => {
      const channel = realtime.channel('public:users', {
        type: 'postgres',
        autoFetch: false,
      });

      const callback = jest.fn();
      channel.on('*', callback);

      // Simulate lightweight INSERT
      channel._handlePublication({
        data: {
          mode: 'lightweight',
          type: 'INSERT',
          schema: 'public',
          table: 'users',
          id: 1,
          timestamp: '2024-01-01T00:00:00Z',
        },
      });

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          mode: 'lightweight',
          id: 1,
        }),
        expect.anything(),
      );
    });

    test('no volcanoClient delivers lightweight as-is', () => {
      // No volcanoClient set
      const channel = realtime.channel('public:users', { type: 'postgres' });

      const callback = jest.fn();
      channel.on('*', callback);

      // Simulate lightweight INSERT
      channel._handlePublication({
        data: {
          mode: 'lightweight',
          type: 'INSERT',
          schema: 'public',
          table: 'users',
          id: 1,
          timestamp: '2024-01-01T00:00:00Z',
        },
      });

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          mode: 'lightweight',
          id: 1,
        }),
        expect.anything(),
      );
    });
  });

  describe('_handleLightweightNotification', () => {
    test('converts lightweight INSERT to full payload', async () => {
      const { client: mockClient } = createMockVolcanoClient([
        { id: 1, name: 'Alice', email: 'alice@test.com' },
      ]);
      realtime.setVolcanoClient(mockClient);

      const channel = realtime.channel('public:users', { type: 'postgres' });

      const callback = jest.fn();
      channel.on('INSERT', callback);

      // Simulate lightweight INSERT
      channel._handlePublication({
        data: {
          mode: 'lightweight',
          type: 'INSERT',
          schema: 'public',
          table: 'users',
          id: 1,
          timestamp: '2024-01-01T00:00:00Z',
        },
      });

      // Fast-forward timer to flush batch
      jest.advanceTimersByTime(50);

      // Wait for promises to resolve
      await Promise.resolve();
      await Promise.resolve();

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'INSERT',
          record: { id: 1, name: 'Alice', email: 'alice@test.com' },
        }),
        expect.anything(),
      );
    });

    test('converts lightweight UPDATE to full payload', async () => {
      const { client: mockClient } = createMockVolcanoClient([{ id: 2, name: 'Bob Updated' }]);
      realtime.setVolcanoClient(mockClient);

      const channel = realtime.channel('public:users', { type: 'postgres' });

      const callback = jest.fn();
      channel.on('UPDATE', callback);

      // Simulate lightweight UPDATE
      channel._handlePublication({
        data: {
          mode: 'lightweight',
          type: 'UPDATE',
          schema: 'public',
          table: 'users',
          id: 2,
          timestamp: '2024-01-01T00:00:00Z',
        },
      });

      jest.advanceTimersByTime(50);
      await Promise.resolve();
      await Promise.resolve();

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'UPDATE',
          record: { id: 2, name: 'Bob Updated' },
        }),
        expect.anything(),
      );
    });
  });

  describe('_fetchRow batching', () => {
    test('batches multiple fetch requests within window', async () => {
      const { client: mockClient } = createMockVolcanoClient([
        { id: 1, name: 'Alice' },
        { id: 2, name: 'Bob' },
        { id: 3, name: 'Charlie' },
      ]);
      realtime.setVolcanoClient(mockClient);

      const channel = realtime.channel('public:users', { type: 'postgres' });

      const callback = jest.fn();
      channel.on('*', callback);

      // Send 3 lightweight INSERTs
      for (let i = 1; i <= 3; i++) {
        channel._handlePublication({
          data: {
            mode: 'lightweight',
            type: 'INSERT',
            schema: 'public',
            table: 'users',
            id: i,
            timestamp: '2024-01-01T00:00:00Z',
          },
        });
      }

      jest.advanceTimersByTime(50);
      await Promise.resolve();
      await Promise.resolve();

      // Should have made only ONE database query
      expect(mockClient.database).toHaveBeenCalledWith('testdb');
      expect(mockClient.from).toHaveBeenCalledTimes(1);
      expect(mockClient.from).toHaveBeenCalledWith('users');
    });

    test('uses schema-qualified table names for non-public schemas', async () => {
      const { client: mockClient } = createMockVolcanoClient([{ id: 1, name: 'Secret' }]);
      realtime.setVolcanoClient(mockClient);

      const channel = realtime.channel('private:secrets', { type: 'postgres' });

      channel._handlePublication({
        data: {
          mode: 'lightweight',
          type: 'INSERT',
          schema: 'private',
          table: 'secrets',
          id: 1,
          timestamp: '2024-01-01T00:00:00Z',
        },
      });

      jest.advanceTimersByTime(50);
      await Promise.resolve();
      await Promise.resolve();

      expect(mockClient.from).toHaveBeenCalledWith('private.secrets');
    });

    test('forces flush at max batch size', async () => {
      const mockData = Array.from({ length: 50 }, (_, i) => ({ id: i + 1, name: `User ${i + 1}` }));
      const { client: mockClient } = createMockVolcanoClient(mockData);
      realtime.setVolcanoClient(mockClient);

      const channel = realtime.channel('public:users', {
        type: 'postgres',
        fetchMaxBatchSize: 5, // Lower threshold for testing
      });

      const callback = jest.fn();
      channel.on('*', callback);

      // Send 6 lightweight INSERTs (exceeds max batch size of 5)
      for (let i = 1; i <= 6; i++) {
        channel._handlePublication({
          data: {
            mode: 'lightweight',
            type: 'INSERT',
            schema: 'public',
            table: 'users',
            id: i,
            timestamp: '2024-01-01T00:00:00Z',
          },
        });
      }

      // First 5 should trigger immediate flush
      await Promise.resolve();

      // Should have flushed when hitting batch size
      expect(mockClient.from).toHaveBeenCalled();
    });
  });

  describe('handles fetch errors gracefully', () => {
    test('delivers lightweight on database error', async () => {
      const query = {
        select: jest.fn().mockReturnThis(),
        in: jest.fn().mockResolvedValue({ data: null, error: { message: 'Database error' } }),
      };
      const mockClient = {
        _currentDatabaseName: null,
        database: jest.fn(() => mockClient),
        from: jest.fn(() => query),
      };
      realtime.setVolcanoClient(mockClient);

      const channel = realtime.channel('public:users', { type: 'postgres' });

      const callback = jest.fn();
      channel.on('*', callback);

      // Suppress console.warn for this test
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      channel._handlePublication({
        data: {
          mode: 'lightweight',
          type: 'INSERT',
          schema: 'public',
          table: 'users',
          id: 1,
          timestamp: '2024-01-01T00:00:00Z',
        },
      });

      jest.advanceTimersByTime(50);
      await Promise.resolve();
      await Promise.resolve();

      // Should still deliver the notification (lightweight)
      expect(callback).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    test('RLS enforced on fetch - user cannot see row', async () => {
      // Empty response simulates RLS denial
      const { client: mockClient } = createMockVolcanoClient([]);
      realtime.setVolcanoClient(mockClient);

      const channel = realtime.channel('public:secrets', { type: 'postgres' });

      const callback = jest.fn();
      channel.on('*', callback);

      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      channel._handlePublication({
        data: {
          mode: 'lightweight',
          type: 'INSERT',
          schema: 'public',
          table: 'secrets',
          id: 999,
          timestamp: '2024-01-01T00:00:00Z',
        },
      });

      jest.advanceTimersByTime(50);
      await Promise.resolve();
      await Promise.resolve();

      // Callback should still be called (with lightweight data as fallback)
      expect(callback).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });

  describe('_deliverPayload', () => {
    test('delivers to event-specific callbacks', () => {
      const channel = realtime.channel('test', { type: 'postgres' });

      const insertCallback = jest.fn();
      const updateCallback = jest.fn();

      channel.on('INSERT', insertCallback);
      channel.on('UPDATE', updateCallback);

      channel._deliverPayload({ type: 'INSERT', record: { id: 1 } }, {});

      expect(insertCallback).toHaveBeenCalled();
      expect(updateCallback).not.toHaveBeenCalled();
    });

    test('delivers to wildcard callbacks', () => {
      const channel = realtime.channel('test', { type: 'postgres' });

      const wildcardCallback = jest.fn();
      channel.on('*', wildcardCallback);

      channel._deliverPayload({ type: 'INSERT', record: { id: 1 } }, {});
      channel._deliverPayload({ type: 'UPDATE', record: { id: 1 } }, {});
      channel._deliverPayload({ type: 'DELETE', old_record: { id: 1 } }, {});

      expect(wildcardCallback).toHaveBeenCalledTimes(3);
    });

    test('uses event field when present', () => {
      const channel = realtime.channel('test');

      const customCallback = jest.fn();
      channel.on('custom_event', customCallback);

      channel._deliverPayload({ event: 'custom_event', data: 'test' }, {});

      expect(customCallback).toHaveBeenCalled();
    });
  });
});
