/** @jest-environment ./__tests__/node-environment.cjs */
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { VolcanoAuth } from '../src/index.ts';
import { fetchCall, fetchUrl, reply } from './auth-concurrency-fixtures.ts';
import { testAccessToken } from './auth-token-fixtures.ts';

const fetchMock = jest.mocked(globalThis.fetch);
const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
const config = { apiUrl: 'https://api.test.com', anonKey: 'ak-test-anon-key' };
const TEST_ACCESS_TOKEN = testAccessToken();
let volcano: VolcanoAuth;

function lastRequestUrl(): string {
  return fetchUrl(fetchCall(fetchMock.mock.calls.length - 1)[0]);
}

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

describe('VolcanoAuth database and initialization', () => {
  describe('Database Methods', () => {
    it('should set database name', () => {
      volcano.database('my-database');
      expect(volcano._currentDatabaseName).toBe('my-database');
    });

    it('should chain database() call', () => {
      const result = volcano.database('my-database');
      expect(result).toBe(volcano);
    });
  });

  describe('Database Query - URL Encoding', () => {
    it('should URL-encode databaseName in SELECT query URL', async () => {
      volcano.accessToken = TEST_ACCESS_TOKEN;
      volcano.database('db-with/special&chars');

      fetchMock.mockResolvedValue(reply(200, { data: [], count: 0 }));

      await volcano.from('users').execute();

      const lastUrl = lastRequestUrl();
      expect(lastUrl).toContain(encodeURIComponent('db-with/special&chars'));
      expect(lastUrl).not.toContain('db-with/special&chars');
    });

    it('should URL-encode databaseName in INSERT mutation URL', async () => {
      volcano.accessToken = TEST_ACCESS_TOKEN;
      volcano.database('db-with/special&chars');

      fetchMock.mockResolvedValue(reply(200, { data: [], count: 0 }));

      await volcano.insert('users', { name: 'test' }).execute();

      const lastUrl = lastRequestUrl();
      expect(lastUrl).toContain(encodeURIComponent('db-with/special&chars'));
    });

    it('should URL-encode databaseName in UPDATE mutation URL', async () => {
      volcano.accessToken = TEST_ACCESS_TOKEN;
      volcano.database('db-with/special&chars');

      fetchMock.mockResolvedValue(reply(200, { data: [], count: 0 }));

      await volcano.update('users', { name: 'test' }).eq('id', '1').execute();

      const lastUrl = lastRequestUrl();
      expect(lastUrl).toContain(encodeURIComponent('db-with/special&chars'));
    });

    it('should URL-encode databaseName in DELETE mutation URL', async () => {
      volcano.accessToken = TEST_ACCESS_TOKEN;
      volcano.database('db-with/special&chars');

      fetchMock.mockResolvedValue(reply(200, { data: [], count: 0 }));

      await volcano.delete('users').eq('id', '1').execute();

      const lastUrl = lastRequestUrl();
      expect(lastUrl).toContain(encodeURIComponent('db-with/special&chars'));
    });
  });

  describe('Initialize', () => {
    it('should restore session from localStorage', async () => {
      localStorage.setItem('volcano_access_token', 'stored-token');
      localStorage.setItem('volcano_refresh_token', 'stored-refresh');

      const newVolcano = new VolcanoAuth(config);

      fetchMock.mockResolvedValueOnce(
        reply(200, {
          user: { id: 'restored-user', email: 'fixture@example.com', status: 'active' },
        }),
      );

      const result = await newVolcano.initialize();

      expect(result.user?.id).toBe('restored-user');
    });

    it('should return null user when no stored session', async () => {
      const result = await volcano.initialize();

      expect(result.user).toBeNull();
      expect(result.error).toBeNull();
    });
  });
});
