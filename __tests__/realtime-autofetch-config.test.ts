/** @jest-environment ./__tests__/node-environment.cjs */
import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
/**
 * Realtime Auto-Fetch Unit Tests
 *
 * These tests verify the auto-fetch functionality for lightweight notifications
 * in Phase 3 of the realtime scalability implementation.
 */
import { VolcanoAuth } from '../src/index.ts';
import { VolcanoRealtime } from '../src/realtime.ts';
import { mockVolcanoClientFactory } from './support/realtime-autofetch-fixtures.ts';
import type { ChannelListener } from './support/realtime-listeners.ts';

const createMockVolcanoClient = mockVolcanoClientFactory(VolcanoAuth);

let realtime: VolcanoRealtime;

function keepsProjectAndVolcanoClients(): void {
  test('keeps same-named channels in separate project clients', () => {
    const first = new VolcanoRealtime({
      apiUrl: 'https://api.example.com',
      anonKey: 'project1.key',
    });
    const second = new VolcanoRealtime({
      apiUrl: 'https://api.example.com',
      anonKey: 'project2.key',
    });
    const firstChannel = first.channel('public:users', { type: 'postgres' });
    const secondChannel = second.channel('public:users', { type: 'postgres' });

    expect(firstChannel.name).toBe('postgres:public:users');
    expect(secondChannel.name).toBe('postgres:public:users');
    expect(firstChannel._realtime).not.toBe(secondChannel._realtime);

    first.disconnect();
    second.disconnect();
  });

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
}

function appliesFetchConfig(): void {
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
}

function setsVolcanoClientLater(): void {
  test('sets volcanoClient after construction', () => {
    const { client: mockClient } = createMockVolcanoClient();

    expect(realtime.getVolcanoClient()).toBeNull();

    realtime.setVolcanoClient(mockClient);

    expect(realtime.getVolcanoClient()).toBe(mockClient);
  });
}

function resolvesChannelFetchConfig(): void {
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
}

function deliversToMatchingCallbacks(): void {
  test('delivers to event-specific callbacks', () => {
    const channel = realtime.channel('test', { type: 'postgres' });

    const insertCallback = jest.fn<ChannelListener>();
    const updateCallback = jest.fn<ChannelListener>();

    channel.on('INSERT', insertCallback);
    channel.on('UPDATE', updateCallback);

    channel._deliverPayload({ type: 'INSERT', record: { id: 1 } }, {});

    expect(insertCallback).toHaveBeenCalled();
    expect(updateCallback).not.toHaveBeenCalled();
  });

  test('delivers to wildcard callbacks', () => {
    const channel = realtime.channel('test', { type: 'postgres' });

    const wildcardCallback = jest.fn<ChannelListener>();
    channel.on('*', wildcardCallback);

    channel._deliverPayload({ type: 'INSERT', record: { id: 1 } }, {});
    channel._deliverPayload({ type: 'UPDATE', record: { id: 1 } }, {});
    channel._deliverPayload({ type: 'DELETE', old_record: { id: 1 } }, {});

    expect(wildcardCallback).toHaveBeenCalledTimes(3);
  });

  test('uses event field when present', () => {
    const channel = realtime.channel('test');

    const customCallback = jest.fn<ChannelListener>();
    channel.on('custom_event', customCallback);

    channel._deliverPayload({ event: 'custom_event', data: 'test' }, {});

    expect(customCallback).toHaveBeenCalled();
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

  describe('constructor', () => {
    keepsProjectAndVolcanoClients();
    appliesFetchConfig();
  });

  describe('setVolcanoClient', () => {
    setsVolcanoClientLater();
  });

  describe('channel fetch config', () => {
    resolvesChannelFetchConfig();
  });

  describe('_deliverPayload', () => {
    deliversToMatchingCallbacks();
  });
});
