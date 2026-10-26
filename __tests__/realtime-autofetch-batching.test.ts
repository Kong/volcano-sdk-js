/** @jest-environment ./__tests__/node-environment.cjs */
import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import { QueryBuilder, VolcanoAuth } from '../src/index.ts';
import { VolcanoRealtime } from '../src/realtime.ts';
import { fetchMock, mockVolcanoClientFactory } from './support/realtime-autofetch-fixtures.ts';

const createMockVolcanoClient = mockVolcanoClientFactory(VolcanoAuth);

let realtime: VolcanoRealtime;

function deliversFullPublicationsWithoutFetching(): void {
  test('delivers full publications without trying to fetch a row', () => {
    const { client } = createMockVolcanoClient();
    realtime.setVolcanoClient(client);
    const channel = realtime.channel('public:users', { type: 'postgres' });
    const callback = jest.fn();
    channel.on('*', callback);
    const publication = { type: 'UPDATE', schema: 'public', table: 'users', record: { id: 1 } };

    channel._handlePublication({ data: publication });

    expect(callback).toHaveBeenCalledWith(publication, { data: publication });
    expect(channel._pendingFetches.size).toBe(0);
  });
}

function batchesRequestsWithinTheWindow(): void {
  test('batches multiple fetch requests within window', async () => {
    const {
      client: mockClient,
      databaseSpy,
      fromSpy,
    } = createMockVolcanoClient([
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

    await jest.advanceTimersByTimeAsync(50);
    await Promise.resolve();
    await Promise.resolve();

    // Should have made only ONE database query
    expect(databaseSpy).toHaveBeenCalledWith('testdb');
    expect(fromSpy).toHaveBeenCalledTimes(1);
    expect(fromSpy).toHaveBeenCalledWith('users');
  });
}

function qualifiesTableNames(): void {
  test('uses schema-qualified table names for non-public schemas', async () => {
    const { client: mockClient, fromSpy } = createMockVolcanoClient([{ id: 1, name: 'Secret' }]);
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

    await jest.advanceTimersByTimeAsync(50);
    await Promise.resolve();
    await Promise.resolve();

    expect(fromSpy).toHaveBeenCalledWith('private.secrets');
  });

  test('uses an unqualified table name when the notification omits its schema', async () => {
    const { client: mockClient, fromSpy } = createMockVolcanoClient([{ id: 1 }]);
    realtime.setVolcanoClient(mockClient);
    const channel = realtime.channel('public:secrets', { type: 'postgres' });

    channel._handlePublication({
      data: {
        mode: 'lightweight',
        type: 'INSERT',
        schema: '',
        table: 'secrets',
        id: 1,
        timestamp: '2024-01-01T00:00:00Z',
      },
    });

    await jest.advanceTimersByTimeAsync(50);
    expect(fromSpy).toHaveBeenCalledWith('secrets');
  });
}

function flushesAtMaxBatchSize(): void {
  test('forces flush at max batch size', async () => {
    const mockData = Array.from({ length: 50 }, (_, i) => ({
      id: i + 1,
      name: `User ${String(i + 1)}`,
    }));
    const { client: mockClient, fromSpy } = createMockVolcanoClient(mockData);
    const inSpy = jest.spyOn(QueryBuilder.prototype, 'in');
    realtime.setVolcanoClient(mockClient);

    const channel = realtime.channel('public:users', {
      type: 'postgres',
      // Lower threshold for testing
      fetchMaxBatchSize: 5,
    });

    const callback = jest.fn();
    channel.on('*', callback);

    // Reaching the limit flushes without waiting for the batch timer.
    for (let i = 1; i <= 5; i++) {
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

    await Promise.resolve();
    expect(fromSpy).toHaveBeenCalled();
    expect(inSpy).toHaveBeenCalledWith('id', ['1', '2', '3', '4', '5']);
  });
}

function deliversLightweightOnDatabaseError(): void {
  test('delivers lightweight on database error', async () => {
    const { client: mockClient } = createMockVolcanoClient();
    fetchMock.mockResolvedValue(Response.json({ error: 'Database error' }, { status: 400 }));
    realtime.setVolcanoClient(mockClient);

    const channel = realtime.channel('public:users', { type: 'postgres' });

    const callback = jest.fn();
    channel.on('*', callback);

    // Suppress console.warn for this test
    const warnings: unknown[][] = [];
    const consoleSpy = jest.spyOn(console, 'warn').mockImplementation((...args: unknown[]) => {
      warnings.push(args);
    });

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

    await jest.advanceTimersByTimeAsync(50);
    await Promise.resolve();
    await Promise.resolve();

    // Should still deliver the notification (lightweight)
    expect(callback).toHaveBeenCalled();
    expect(warnings).not.toHaveLength(0);

    consoleSpy.mockRestore();
  });
}

function deliversLightweightWhenRlsHidesTheRow(): void {
  test('RLS enforced on fetch - user cannot see row', async () => {
    // Empty response simulates RLS denial
    const { client: mockClient } = createMockVolcanoClient([]);
    realtime.setVolcanoClient(mockClient);

    const channel = realtime.channel('public:secrets', { type: 'postgres' });

    const callback = jest.fn();
    channel.on('*', callback);

    const warnings: unknown[][] = [];
    const consoleSpy = jest.spyOn(console, 'warn').mockImplementation((...args: unknown[]) => {
      warnings.push(args);
    });

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

    await jest.advanceTimersByTimeAsync(50);
    await Promise.resolve();
    await Promise.resolve();

    // Callback should still be called (with lightweight data as fallback)
    expect(callback).toHaveBeenCalled();
    expect(warnings).not.toHaveLength(0);

    consoleSpy.mockRestore();
  });
}

describe('Realtime Auto-Fetch', () => {
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

  describe('_fetchRow batching', () => {
    deliversFullPublicationsWithoutFetching();
    batchesRequestsWithinTheWindow();
    qualifiesTableNames();
    flushesAtMaxBatchSize();
  });

  describe('handles fetch errors gracefully', () => {
    deliversLightweightOnDatabaseError();
    deliversLightweightWhenRlsHidesTheRow();
  });
});
