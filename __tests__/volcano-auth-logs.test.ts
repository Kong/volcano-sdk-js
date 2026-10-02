/** @jest-environment ./__tests__/node-environment.cjs */
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { VolcanoAuth } from '../src/index.ts';
import type { LogActivityRequest, LogSearchRequest } from '../src/sdk-public-types.ts';
import { reply } from './auth-concurrency-fixtures.ts';
import { testAccessToken } from './auth-token-fixtures.ts';

const fetchMock = jest.mocked(globalThis.fetch);
const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
const config = { apiUrl: 'https://api.test.com', anonKey: 'ak-test-anon-key' };
const TEST_ACCESS_TOKEN = testAccessToken();
let volcano: VolcanoAuth;

beforeEach(() => {
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { document: {}, localStorage },
  });
  volcano = new VolcanoAuth(config);
});

afterEach(() => {
  if (previousWindow === undefined) {
    Reflect.deleteProperty(globalThis, 'window');
  } else {
    Object.defineProperty(globalThis, 'window', previousWindow);
  }
});

describe('VolcanoAuth logs', () => {
  describe('Logs', () => {
    it('should expose log methods', () => {
      expect(volcano.logs).toBeDefined();
      expect(typeof volcano.logs.search).toBe('function');
      expect(typeof volcano.logs.activity).toBe('function');
    });

    it('should search project logs with date-time windows', async () => {
      volcano.accessToken = TEST_ACCESS_TOKEN;
      const request = {
        resource: { type: 'function', ids: ['fn-1'] },
        q: 'build failed',
        levels: ['error'],
        regions: ['us-east-1'],
        start_time: '2024-01-01T00:00:00.000Z',
        end_time: '2024-01-02T00:00:00.000Z',
        limit: 50,
      } satisfies LogSearchRequest;
      const response = {
        data: [
          {
            id: 'log-1',
            timestamp: '2024-01-01T00:00:01.000Z',
            body: 'build failed',
            resource: { type: 'function', id: 'fn-1' },
          },
        ],
        limit: 50,
        has_more: false,
      };

      fetchMock.mockResolvedValueOnce(reply(200, response));

      const result = await volcano.logs.search('project-1', request);

      expect(result.error).toBeNull();
      expect(result.data).toEqual(response);
      expect(fetch).toHaveBeenCalledWith(
        'https://api.test.com/projects/project-1/logs/search',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(request),
          headers: expect.objectContaining({
            Authorization: `Bearer ${TEST_ACCESS_TOKEN}`,
            'Content-Type': 'application/json',
          }),
        }),
      );
    });

    it('should fetch project log activity with date-time windows', async () => {
      volcano.accessToken = TEST_ACCESS_TOKEN;
      const request = {
        resource: { type: 'frontend', ids: ['frontend-1'] },
        levels: ['warn'],
        start_time: '2024-01-01T00:00:00.000Z',
        end_time: '2024-01-01T01:00:00.000Z',
        bucket_count: 12,
      } satisfies LogActivityRequest;
      const response = {
        data: [
          {
            start_time: '2024-01-01T00:00:00.000Z',
            end_time: '2024-01-01T00:05:00.000Z',
            counts: {
              levels: { warn: 2 },
              regions: { 'us-east-1': 2 },
              resource_ids: { 'frontend-1': 2 },
            },
            total: 2,
          },
        ],
        total: 2,
      };

      fetchMock.mockResolvedValueOnce(reply(200, response));

      const result = await volcano.logs.activity('project-1', request);

      expect(result.error).toBeNull();
      expect(result.data).toEqual(response);
      expect(fetch).toHaveBeenCalledWith(
        'https://api.test.com/projects/project-1/logs/activity',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(request),
          headers: expect.objectContaining({
            Authorization: `Bearer ${TEST_ACCESS_TOKEN}`,
            'Content-Type': 'application/json',
          }),
        }),
      );
    });

    it('should return an error when searching logs without a session', async () => {
      const result = await volcano.logs.search('project-1', {
        resource: { type: 'function' },
      });

      expect(result.data).toBeNull();
      expect(result.error?.message).toBe('No active session');
      expect(fetch).not.toHaveBeenCalled();
    });
  });
});
