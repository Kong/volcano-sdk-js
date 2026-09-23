/** @jest-environment ./__tests__/node-environment.cjs */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { AuthRefreshDiscardedError, VolcanoAuth } from '../src/index.js';
import { sessionToken } from './session-fixtures.ts';

const fetchMock = jest.mocked(globalThis.fetch);

interface JsonResponseFixture {
  ok?: boolean;
  status?: number;
  json: () => Promise<unknown>;
}

function responseFixture(input: JsonResponseFixture): Response {
  const status = input.status ?? (input.ok === false ? 400 : 200);
  const response = Response.json(null, { status });
  jest.spyOn(response, 'json').mockImplementation(input.json);
  return response;
}

function createDeferred<T>() {
  let settle: ((value: T) => void) | undefined;
  const promise = new Promise<T>((resolve) => {
    settle = resolve;
  });
  return {
    promise,
    resolve(value: T): void {
      if (settle === undefined) {
        throw new Error('Deferred promise has no resolver');
      }
      settle(value);
    },
  };
}

function setSessionFixture(client: VolcanoAuth, session: object): void {
  const setter: unknown = Reflect.get(client, '_setSession');
  if (typeof setter !== 'function') {
    throw new TypeError('Expected the internal session setter');
  }
  Reflect.apply(setter, client, [session]);
}

function filterOperators(builder: object): string[] {
  const filters: unknown = Reflect.get(builder, 'filters');
  if (!Array.isArray(filters)) {
    throw new TypeError('Expected filter entries');
  }
  return filters.map((filter: unknown) => {
    if (typeof filter !== 'object' || filter === null) {
      throw new TypeError('Expected a filter object');
    }
    const operator: unknown = Reflect.get(filter, 'operator');
    if (typeof operator !== 'string') {
      throw new TypeError('Expected a filter operator');
    }
    return operator;
  });
}

describe('QueryBuilder', () => {
  const config = {
    apiUrl: 'https://api.test.com',
    anonKey: 'ak-test-anon-key',
  };

  let volcano: VolcanoAuth;

  beforeEach(() => {
    volcano = new VolcanoAuth({ ...config, accessToken: 'test-access-token' }).database('test_db');
  });

  describe('from()', () => {
    it('should create a QueryBuilder for table', () => {
      const qb = volcano.from('posts');
      expect(Reflect.get(qb, 'table')).toBe('posts');
      expect(Reflect.get(qb, 'databaseName')).toBe('test_db');
    });
  });

  describe('select()', () => {
    it('should set select columns', () => {
      const qb = volcano.from('posts').select('id, title, content');
      expect(Reflect.get(qb, 'selectColumns')).toEqual(['id', 'title', 'content']);
    });

    it('should handle * selector', () => {
      const qb = volcano.from('posts').select('*');
      expect(Reflect.get(qb, 'selectColumns')).toEqual([]);
    });
  });

  describe('Filter methods', () => {
    it('should add eq filter', () => {
      const qb = volcano.from('posts').eq('status', 'published');
      expect(Reflect.get(qb, 'filters')).toContainEqual({
        column: 'status',
        operator: 'eq',
        value: 'published',
      });
    });

    it('should add neq filter', () => {
      const qb = volcano.from('posts').neq('status', 'draft');
      expect(Reflect.get(qb, 'filters')).toContainEqual({
        column: 'status',
        operator: 'neq',
        value: 'draft',
      });
    });

    it('should add gt filter', () => {
      const qb = volcano.from('posts').gt('views', 100);
      expect(Reflect.get(qb, 'filters')).toContainEqual({
        column: 'views',
        operator: 'gt',
        value: 100,
      });
    });

    it('should add gte filter', () => {
      const qb = volcano.from('posts').gte('views', 100);
      expect(Reflect.get(qb, 'filters')).toContainEqual({
        column: 'views',
        operator: 'gte',
        value: 100,
      });
    });

    it('should add lt filter', () => {
      const qb = volcano.from('posts').lt('views', 1000);
      expect(Reflect.get(qb, 'filters')).toContainEqual({
        column: 'views',
        operator: 'lt',
        value: 1000,
      });
    });

    it('should add lte filter', () => {
      const qb = volcano.from('posts').lte('views', 1000);
      expect(Reflect.get(qb, 'filters')).toContainEqual({
        column: 'views',
        operator: 'lte',
        value: 1000,
      });
    });

    it('should add like filter', () => {
      const qb = volcano.from('posts').like('title', '%hello%');
      expect(Reflect.get(qb, 'filters')).toContainEqual({
        column: 'title',
        operator: 'like',
        value: '%hello%',
      });
    });

    it('should add ilike filter', () => {
      const qb = volcano.from('posts').ilike('title', '%hello%');
      expect(Reflect.get(qb, 'filters')).toContainEqual({
        column: 'title',
        operator: 'ilike',
        value: '%hello%',
      });
    });

    it('should add is filter', () => {
      const qb = volcano.from('posts').is('deleted_at', null);
      expect(Reflect.get(qb, 'filters')).toContainEqual({
        column: 'deleted_at',
        operator: 'is',
        value: null,
      });
    });

    it('should add in filter', () => {
      const qb = volcano.from('posts').in('status', ['published', 'featured']);
      expect(Reflect.get(qb, 'filters')).toContainEqual({
        column: 'status',
        operator: 'in',
        value: ['published', 'featured'],
      });
    });
  });

  describe('order()', () => {
    it('should add order clause ascending', () => {
      const qb = volcano.from('posts').order('created_at', { ascending: true });
      expect(Reflect.get(qb, 'orderClauses')).toContainEqual({
        column: 'created_at',
        ascending: true,
      });
    });

    it('should add order clause descending', () => {
      const qb = volcano.from('posts').order('created_at', { ascending: false });
      expect(Reflect.get(qb, 'orderClauses')).toContainEqual({
        column: 'created_at',
        ascending: false,
      });
    });

    it('should default to ascending', () => {
      const qb = volcano.from('posts').order('created_at');
      expect(Reflect.get(qb, 'orderClauses')).toContainEqual({
        column: 'created_at',
        ascending: true,
      });
    });
  });

  describe('limit() and offset()', () => {
    it('should set limit', () => {
      const qb = volcano.from('posts').limit(10);
      expect(Reflect.get(qb, 'limitValue')).toBe(10);
    });

    it('should set offset', () => {
      const qb = volcano.from('posts').offset(20);
      expect(Reflect.get(qb, 'offsetValue')).toBe(20);
    });
  });

  describe('Chaining', () => {
    it('should support method chaining', () => {
      const qb = volcano
        .from('posts')
        .select('id, title')
        .eq('status', 'published')
        .gt('views', 100)
        .order('created_at', { ascending: false })
        .limit(10)
        .offset(0);

      expect(Reflect.get(qb, 'selectColumns')).toEqual(['id', 'title']);
      expect(Reflect.get(qb, 'filters')).toHaveLength(2);
      expect(Reflect.get(qb, 'orderClauses')).toHaveLength(1);
      expect(Reflect.get(qb, 'limitValue')).toBe(10);
      expect(Reflect.get(qb, 'offsetValue')).toBe(0);
    });
  });

  describe('execute()', () => {
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

      const result = await volcano
        .from('posts')
        .select('id, title')
        .eq('status', 'published')
        .execute();

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
              user: { id: 'user-123' },
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

    it('does not replay a query after its refresh is superseded', async () => {
      const refreshResponse = createDeferred<Response>();
      const refreshStarted = createDeferred<true>();
      setSessionFixture(volcano, {
        access_token: 'old-access',
        refresh_token: 'old-refresh',
        user: { id: 'user-1' },
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
        user: { id: 'user-2' },
      });
      refreshResponse.resolve(
        responseFixture({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              access_token: 'stale-access',
              refresh_token: 'stale-refresh',
              user: { id: 'user-1' },
              expires_in: 3600,
            }),
        }),
      );

      const result = await query;

      expect(result.data).toBeNull();
      expect(AuthRefreshDiscardedError.is(result.error)).toBe(true);
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(Reflect.get(volcano, 'accessToken')).toBe('replacement-access');
      expect(Reflect.get(volcano, 'currentUser')).toEqual({ id: 'user-2' });
    });

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

      await expect(volcano.from('posts').then((result) => result.data)).resolves.toEqual([
        { id: 1 },
      ]);
    });
  });
});

describe('MutationBuilder', () => {
  const config = {
    apiUrl: 'https://api.test.com',
    anonKey: 'ak-test-anon-key',
  };

  let volcano: VolcanoAuth;

  beforeEach(() => {
    volcano = new VolcanoAuth({ ...config, accessToken: 'test-access-token' }).database('test_db');
  });

  describe('insert()', () => {
    it('should create insert builder', () => {
      const builder = volcano.insert('posts', { title: 'New Post' });
      expect(Reflect.get(builder, 'table')).toBe('posts');
      expect(Reflect.get(builder, 'values')).toEqual({ title: 'New Post' });
      expect(Reflect.get(builder, 'operation')).toBe('insert');
    });

    it('should execute insert', async () => {
      fetchMock.mockResolvedValueOnce(
        responseFixture({
          ok: true,
          json: () => Promise.resolve({ data: [{ id: 1, title: 'New Post' }] }),
        }),
      );

      const result = await volcano.insert('posts', { title: 'New Post' });

      expect(result.data).toEqual([{ id: 1, title: 'New Post' }]);
      expect(result.error).toBeNull();

      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.test.com/databases/test_db/query/insert',
        expect.objectContaining({
          method: 'POST',
        }),
      );
    });
  });

  describe('update()', () => {
    it('should create update builder', () => {
      const builder = volcano.update('posts', { title: 'Updated' });
      expect(Reflect.get(builder, 'operation')).toBe('update');
    });

    it('should support filters on update', async () => {
      fetchMock.mockResolvedValueOnce(
        responseFixture({
          ok: true,
          json: () => Promise.resolve({ data: [{ id: 1, title: 'Updated' }] }),
        }),
      );

      const result = await volcano.update('posts', { title: 'Updated' }).eq('id', 1);

      expect(result.data).toEqual([{ id: 1, title: 'Updated' }]);

      const body = fetchMock.mock.calls[0]?.[1]?.body;
      if (typeof body !== 'string') {
        throw new TypeError('Expected a JSON request body');
      }
      const requestBody: unknown = JSON.parse(body);
      expect(requestBody).toMatchObject({
        filters: expect.arrayContaining([{ column: 'id', operator: 'eq', value: 1 }]),
      });
    });

    it('should support all filter methods', () => {
      const builder = volcano
        .update('posts', { views: 0 })
        .eq('status', 'draft')
        .neq('author', 'admin')
        .gt('age', 30)
        .lt('score', 100);

      expect(Reflect.get(builder, 'filters')).toHaveLength(4);
    });
  });

  describe('delete()', () => {
    it('should create delete builder', () => {
      const builder = volcano.delete('posts');
      expect(Reflect.get(builder, 'operation')).toBe('delete');
      expect(Reflect.get(builder, 'values')).toBeNull();
    });

    it('should execute delete with filters', async () => {
      fetchMock.mockResolvedValueOnce(
        responseFixture({
          ok: true,
          json: () => Promise.resolve({ data: [{ id: 1 }] }),
        }),
      );

      const result = await volcano.delete('posts').eq('id', 1);

      expect(result.error).toBeNull();

      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.test.com/databases/test_db/query/delete',
        expect.any(Object),
      );
    });
  });

  describe('Error handling', () => {
    it('should return error when not authenticated', async () => {
      Reflect.set(volcano, 'accessToken', null);

      const result = await volcano.insert('posts', { title: 'Test' });

      expect(result.data).toBeNull();
      expect(result.error?.message).toContain('No active session');
    });

    it('should return error when database not set', async () => {
      Reflect.set(volcano, '_currentDatabaseName', null);

      const result = await volcano.insert('posts', { title: 'Test' });

      expect(result.data).toBeNull();
      expect(result.error?.message).toContain('Database name not set');
    });

    it('should handle API errors', async () => {
      fetchMock.mockResolvedValueOnce(
        responseFixture({
          ok: false,
          json: () => Promise.resolve({ error: 'Constraint violation' }),
        }),
      );

      const result = await volcano.insert('posts', { title: null });

      expect(result.data).toBeNull();
      expect(result.error?.message).toBe('Constraint violation');
    });

    it('should handle network errors', async () => {
      fetchMock.mockRejectedValueOnce(new Error('Network error'));

      const result = await volcano.insert('posts', { title: 'Test' });

      expect(result.data).toBeNull();
      expect(result.error?.message).toBe('Network error');
    });
  });

  describe('Promise/thenable support', () => {
    it('should support await directly on insert', async () => {
      fetchMock.mockResolvedValueOnce(
        responseFixture({
          ok: true,
          json: () => Promise.resolve({ data: [{ id: 1 }] }),
        }),
      );

      const { data, error } = await volcano.insert('posts', { title: 'Test' });

      expect(data).toEqual([{ id: 1 }]);
      expect(error).toBeNull();
    });

    it('should support .then() on update', async () => {
      fetchMock.mockResolvedValueOnce(
        responseFixture({
          ok: true,
          json: () => Promise.resolve({ data: [{ id: 1, title: 'Updated' }] }),
        }),
      );

      await expect(
        volcano
          .update('posts', { title: 'Updated' })
          .eq('id', 1)
          .then((result) => result.data),
      ).resolves.toEqual([{ id: 1, title: 'Updated' }]);
    });

    it('should support .then() on delete', async () => {
      fetchMock.mockResolvedValueOnce(
        responseFixture({
          ok: true,
          json: () => Promise.resolve({ data: [] }),
        }),
      );

      await expect(
        volcano
          .delete('posts')
          .eq('id', 1)
          .then((result) => result.error),
      ).resolves.toBeNull();
    });
  });

  describe('All filter methods work on mutations', () => {
    it('should support all filter methods on update', () => {
      const builder = volcano.update('posts', { status: 'archived' });

      builder.eq('status', 'draft');
      builder.neq('author', 'admin');
      builder.gt('views', 0);
      builder.gte('score', 1);
      builder.lt('age', 365);
      builder.lte('priority', 5);
      builder.like('title', '%test%');
      builder.ilike('content', '%hello%');
      builder.is('deleted_at', null);
      builder.in('category', ['tech', 'news']);

      expect(Reflect.get(builder, 'filters')).toHaveLength(10);
      expect(filterOperators(builder)).toEqual([
        'eq',
        'neq',
        'gt',
        'gte',
        'lt',
        'lte',
        'like',
        'ilike',
        'is',
        'in',
      ]);
    });

    it('should support all filter methods on delete', () => {
      const builder = volcano.delete('posts');

      builder.eq('status', 'spam');
      builder.lt('created_at', '2020-01-01');

      expect(Reflect.get(builder, 'filters')).toHaveLength(2);
    });
  });
});
