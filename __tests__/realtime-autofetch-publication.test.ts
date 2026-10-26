/** @jest-environment ./__tests__/node-environment.cjs */
import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import { VolcanoAuth } from '../src/index.ts';
import { VolcanoRealtime } from '../src/realtime.ts';
import { mockVolcanoClientFactory } from './support/realtime-autofetch-fixtures.ts';

const createMockVolcanoClient = mockVolcanoClientFactory(VolcanoAuth);

let realtime: VolcanoRealtime;

function deliversFullPayloads(): void {
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
}

function deliversLightweightDeletes(): void {
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
}

function deliversLightweightWithoutAutoFetch(): void {
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
}

function deliversLightweightWithoutClient(): void {
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
}

function fetchesLightweightInserts(): void {
  test('converts lightweight INSERT to full payload', async () => {
    const { client: mockClient } = createMockVolcanoClient([{ id: 1, name: 'Alice', email: 'alice@test.com' }]);
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
    await jest.advanceTimersByTimeAsync(50);

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
}

function fetchesLightweightUpdates(): void {
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

    await jest.advanceTimersByTimeAsync(50);
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

  describe('_handlePublication', () => {
    deliversFullPayloads();
    deliversLightweightDeletes();
    deliversLightweightWithoutAutoFetch();
    deliversLightweightWithoutClient();
  });

  describe('_handleLightweightNotification', () => {
    fetchesLightweightInserts();
    fetchesLightweightUpdates();
  });
});
