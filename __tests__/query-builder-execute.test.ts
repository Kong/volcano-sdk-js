/** @jest-environment ./__tests__/node-environment.cjs */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { AuthRefreshDiscardedError, VolcanoAuth } from '../src/index.ts';
import { sessionToken } from './session-fixtures.ts';
import { createDeferred, responseFixture, setSessionFixture } from './support/query-builder-fixtures.ts';

const fetchMock = jest.mocked(globalThis.fetch);

const config = {
  apiUrl: 'https://api.test.com',
  anonKey: 'ak-test-anon-key',
};

let volcano: VolcanoAuth;

function staleRefreshResponse(): Response {
  return responseFixture({
    ok: true,
    status: 200,
    json: () =>
      Promise.resolve({
        access_token: 'stale-access',
        refresh_token: 'stale-refresh',
        user: { id: 'user-1', email: 'fixture@example.com', status: 'active' },
        expires_in: 3600,
      }),
  });
}

function returnsQueryResults(): void {
  it('should execute query and return results', async () => {
    fetchMock.mockResolvedValueOnce(
      responseFixture({
        ok: true,
        json: () =>
          Promise.resolve({
            data: [
              { id: 1, title: 'Post 1' },
              { id: 2, title: 'Post 2' },
            ],
            count: 2,
          }),
      }),
    );

    const result = await volcano.from('posts').select('id, title').eq('status', 'published').execute();

    expect(result.data).toHaveLength(2);
    expect(result.error).toBeNull();
    expect(result.count).toBe(2);

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.test.com/databases/test_db/query/select',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer test-access-token',
        }),
      }),
    );
  });
}

function refreshesExpiredTokens(): void {
  it('should refresh token on 401 and retry', async () => {
    Reflect.set(volcano, 'accessToken', sessionToken());
    Reflect.set(volcano, 'refreshToken', 'valid-refresh');

    // First call returns 401
    fetchMock.mockResolvedValueOnce(
      responseFixture({
        ok: false,
        status: 401,
        json: () => Promise.resolve({ error: 'Token expired' }),
      }),
    );

    // Refresh call succeeds
    fetchMock.mockResolvedValueOnce(
      responseFixture({
        ok: true,
        json: () =>
          Promise.resolve({
            access_token: sessionToken(undefined, true),
            refresh_token: 'new-refresh-token',
            expires_in: 3600,
            user: { id: 'user-123', email: 'fixture@example.com', status: 'active' },
          }),
      }),
    );

    // Retry call succeeds
    fetchMock.mockResolvedValueOnce(
      responseFixture({
        ok: true,
        json: () => Promise.resolve({ data: [{ id: 1 }], count: 1 }),
      }),
    );

    const result = await volcano.from('posts').execute();

    expect(result.error).toBeNull();
    expect(result.data).toEqual([{ id: 1 }]);
    expect(Reflect.get(volcano, 'accessToken')).toBe(sessionToken(undefined, true));
  });
}

function preservesTokenOnlySessions(): void {
  it('preserves an access-token-only session after a 401', async () => {
    Reflect.set(volcano, 'accessToken', 'server-access-token');
    Reflect.set(volcano, 'refreshToken', null);
    fetchMock.mockResolvedValueOnce(
      responseFixture({
        ok: false,
        status: 401,
        json: () => Promise.resolve({ error: 'Token expired' }),
      }),
    );

    const result = await volcano.from('posts').execute();

    expect(result.error).toBeDefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(Reflect.get(volcano, 'accessToken')).toBe('server-access-token');
    expect(Reflect.get(volcano, 'refreshToken')).toBeNull();
  });
}

function discardsSupersededRefreshes(): void {
  it('does not replay a query after its refresh is superseded', async () => {
    const refreshResponse = createDeferred<Response>();
    const refreshStarted = createDeferred<true>();
    setSessionFixture(volcano, {
      access_token: 'old-access',
      refresh_token: 'old-refresh',
      user: { id: 'user-1', email: 'fixture@example.com', status: 'active' },
    });
    fetchMock
      .mockResolvedValueOnce(
        responseFixture({
          ok: false,
          status: 401,
          json: () => Promise.resolve({ error: 'Token expired' }),
        }),
      )
      .mockImplementationOnce(() => {
        refreshStarted.resolve(true);
        return refreshResponse.promise;
      });

    const query = volcano.from('posts').execute();
    await refreshStarted.promise;
    setSessionFixture(volcano, {
      access_token: 'replacement-access',
      refresh_token: 'replacement-refresh',
      user: { id: 'user-2', email: 'fixture@example.com', status: 'active' },
    });
    refreshResponse.resolve(staleRefreshResponse());

    const result = await query;

    expect(result.data).toBeNull();
    expect(AuthRefreshDiscardedError.is(result.error)).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(Reflect.get(volcano, 'accessToken')).toBe('replacement-access');
    expect(Reflect.get(volcano, 'currentUser')).toEqual({
      id: 'user-2',
      email: 'fixture@example.com',
      status: 'active',
    });
  });
}

function reportsQueryFailures(): void {
  it('should return error when not authenticated', async () => {
    Reflect.set(volcano, 'accessToken', null);

    const result = await volcano.from('posts').execute();

    expect(result.data).toBeNull();
    expect(result.error?.message).toContain('No active session');
  });

  it('should return error when database not set', async () => {
    Reflect.set(volcano, '_currentDatabaseName', null);

    const result = await volcano.from('posts').execute();

    expect(result.data).toBeNull();
    expect(result.error?.message).toContain('Database name not set');
  });

  it('should handle API errors', async () => {
    fetchMock.mockResolvedValueOnce(
      responseFixture({
        ok: false,
        json: () => Promise.resolve({ error: 'Table not found' }),
      }),
    );

    const result = await volcano.from('nonexistent').execute();

    expect(result.data).toBeNull();
    expect(result.error?.message).toBe('Table not found');
  });

  it('should handle network errors', async () => {
    fetchMock.mockRejectedValueOnce(new Error('Network error'));

    const result = await volcano.from('posts').execute();

    expect(result.data).toBeNull();
    expect(result.error?.message).toBe('Network error');
    expect(result.count).toBe(0);
  });
}

describe('QueryBuilder', () => {
  beforeEach(() => {
    volcano = new VolcanoAuth({ ...config, accessToken: 'test-access-token' }).database('test_db');
  });

  describe('execute()', () => {
    returnsQueryResults();
    refreshesExpiredTokens();
    preservesTokenOnlySessions();
    discardsSupersededRefreshes();
    reportsQueryFailures();
  });

  describe('Promise/thenable support', () => {
    it('should support await directly', async () => {
      fetchMock.mockResolvedValueOnce(
        responseFixture({
          ok: true,
          json: () => Promise.resolve({ data: [{ id: 1 }], count: 1 }),
        }),
      );

      const { data, error } = await volcano.from('posts').select('*');

      expect(data).toEqual([{ id: 1 }]);
      expect(error).toBeNull();
    });

    it('should support .then()', async () => {
      fetchMock.mockResolvedValueOnce(
        responseFixture({
          ok: true,
          json: () => Promise.resolve({ data: [{ id: 1 }], count: 1 }),
        }),
      );

      await expect(volcano.from('posts').then((result) => result.data)).resolves.toEqual([{ id: 1 }]);
    });
  });
});
