const VolcanoAuth = require('../src/index.js');

describe('QueryBuilder', () => {
  const config = {
    apiUrl: 'https://api.test.com',
    anonKey: 'ak-test-anon-key',
  };

  let volcano;

  beforeEach(() => {
    volcano = new VolcanoAuth(config);
    volcano.accessToken = 'test-access-token';
    volcano._currentDatabaseName = 'test_db';
  });

  describe('from()', () => {
    it('should create a QueryBuilder for table', () => {
      const qb = volcano.from('posts');
      expect(qb.table).toBe('posts');
      expect(qb.databaseName).toBe('test_db');
    });
  });

  describe('select()', () => {
    it('should set select columns', () => {
      const qb = volcano.from('posts').select('id, title, content');
      expect(qb.selectColumns).toEqual(['id', 'title', 'content']);
    });

    it('should handle * selector', () => {
      const qb = volcano.from('posts').select('*');
      expect(qb.selectColumns).toEqual([]);
    });
  });

  describe('Filter methods', () => {
    it('should add eq filter', () => {
      const qb = volcano.from('posts').eq('status', 'published');
      expect(qb.filters).toContainEqual({ column: 'status', operator: 'eq', value: 'published' });
    });

    it('should add neq filter', () => {
      const qb = volcano.from('posts').neq('status', 'draft');
      expect(qb.filters).toContainEqual({ column: 'status', operator: 'neq', value: 'draft' });
    });

    it('should add gt filter', () => {
      const qb = volcano.from('posts').gt('views', 100);
      expect(qb.filters).toContainEqual({ column: 'views', operator: 'gt', value: 100 });
    });

    it('should add gte filter', () => {
      const qb = volcano.from('posts').gte('views', 100);
      expect(qb.filters).toContainEqual({ column: 'views', operator: 'gte', value: 100 });
    });

    it('should add lt filter', () => {
      const qb = volcano.from('posts').lt('views', 1000);
      expect(qb.filters).toContainEqual({ column: 'views', operator: 'lt', value: 1000 });
    });

    it('should add lte filter', () => {
      const qb = volcano.from('posts').lte('views', 1000);
      expect(qb.filters).toContainEqual({ column: 'views', operator: 'lte', value: 1000 });
    });

    it('should add like filter', () => {
      const qb = volcano.from('posts').like('title', '%hello%');
      expect(qb.filters).toContainEqual({ column: 'title', operator: 'like', value: '%hello%' });
    });

    it('should add ilike filter', () => {
      const qb = volcano.from('posts').ilike('title', '%hello%');
      expect(qb.filters).toContainEqual({ column: 'title', operator: 'ilike', value: '%hello%' });
    });

    it('should add is filter', () => {
      const qb = volcano.from('posts').is('deleted_at', null);
      expect(qb.filters).toContainEqual({ column: 'deleted_at', operator: 'is', value: null });
    });

    it('should add in filter', () => {
      const qb = volcano.from('posts').in('status', ['published', 'featured']);
      expect(qb.filters).toContainEqual({
        column: 'status',
        operator: 'in',
        value: ['published', 'featured'],
      });
    });
  });

  describe('order()', () => {
    it('should add order clause ascending', () => {
      const qb = volcano.from('posts').order('created_at', { ascending: true });
      expect(qb.orderClauses).toContainEqual({ column: 'created_at', ascending: true });
    });

    it('should add order clause descending', () => {
      const qb = volcano.from('posts').order('created_at', { ascending: false });
      expect(qb.orderClauses).toContainEqual({ column: 'created_at', ascending: false });
    });

    it('should default to ascending', () => {
      const qb = volcano.from('posts').order('created_at');
      expect(qb.orderClauses).toContainEqual({ column: 'created_at', ascending: true });
    });
  });

  describe('limit() and offset()', () => {
    it('should set limit', () => {
      const qb = volcano.from('posts').limit(10);
      expect(qb.limitValue).toBe(10);
    });

    it('should set offset', () => {
      const qb = volcano.from('posts').offset(20);
      expect(qb.offsetValue).toBe(20);
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

      expect(qb.selectColumns).toEqual(['id', 'title']);
      expect(qb.filters).toHaveLength(2);
      expect(qb.orderClauses).toHaveLength(1);
      expect(qb.limitValue).toBe(10);
      expect(qb.offsetValue).toBe(0);
    });
  });

  describe('execute()', () => {
    it('should execute query and return results', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            data: [
              { id: 1, title: 'Post 1' },
              { id: 2, title: 'Post 2' },
            ],
            count: 2,
          }),
      });

      const result = await volcano
        .from('posts')
        .select('id, title')
        .eq('status', 'published')
        .execute();

      expect(result.data).toHaveLength(2);
      expect(result.error).toBeNull();
      expect(result.count).toBe(2);

      expect(fetch).toHaveBeenCalledWith(
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
      volcano.accessToken = 'expired-token';
      volcano.refreshToken = 'valid-refresh';

      // First call returns 401
      global.fetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: () => Promise.resolve({ error: 'Token expired' }),
      });

      // Refresh call succeeds
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            access_token: 'new-access-token',
            refresh_token: 'new-refresh-token',
            expires_in: 3600,
          }),
      });

      // Retry call succeeds
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: [{ id: 1 }], count: 1 }),
      });

      const result = await volcano.from('posts').execute();

      expect(result.error).toBeNull();
      expect(result.data).toEqual([{ id: 1 }]);
      expect(volcano.accessToken).toBe('new-access-token');
    });

    it('should return error when not authenticated', async () => {
      volcano.accessToken = null;

      const result = await volcano.from('posts').execute();

      expect(result.data).toBeNull();
      expect(result.error.message).toContain('No active session');
    });

    it('should return error when database not set', async () => {
      volcano._currentDatabaseName = null;

      const result = await volcano.from('posts').execute();

      expect(result.data).toBeNull();
      expect(result.error.message).toContain('Database name not set');
    });

    it('should handle API errors', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ error: 'Table not found' }),
      });

      const result = await volcano.from('nonexistent').execute();

      expect(result.data).toBeNull();
      expect(result.error.message).toBe('Table not found');
    });

    it('should handle network errors', async () => {
      global.fetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await volcano.from('posts').execute();

      expect(result.data).toBeNull();
      expect(result.error.message).toBe('Network error');
      expect(result.count).toBe(0);
    });
  });

  describe('Promise/thenable support', () => {
    it('should support await directly', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: [{ id: 1 }], count: 1 }),
      });

      const { data, error } = await volcano.from('posts').select('*');

      expect(data).toEqual([{ id: 1 }]);
      expect(error).toBeNull();
    });

    it('should support .then()', (done) => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: [{ id: 1 }], count: 1 }),
      });

      volcano.from('posts').then((result) => {
        expect(result.data).toEqual([{ id: 1 }]);
        done();
      });
    });
  });
});

describe('MutationBuilder', () => {
  const config = {
    apiUrl: 'https://api.test.com',
    anonKey: 'ak-test-anon-key',
  };

  let volcano;

  beforeEach(() => {
    volcano = new VolcanoAuth(config);
    volcano.accessToken = 'test-access-token';
    volcano._currentDatabaseName = 'test_db';
  });

  describe('insert()', () => {
    it('should create insert builder', () => {
      const builder = volcano.insert('posts', { title: 'New Post' });
      expect(builder.table).toBe('posts');
      expect(builder.values).toEqual({ title: 'New Post' });
      expect(builder.operation).toBe('insert');
    });

    it('should execute insert', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: [{ id: 1, title: 'New Post' }] }),
      });

      const result = await volcano.insert('posts', { title: 'New Post' });

      expect(result.data).toEqual([{ id: 1, title: 'New Post' }]);
      expect(result.error).toBeNull();

      expect(fetch).toHaveBeenCalledWith(
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
      expect(builder.operation).toBe('update');
    });

    it('should support filters on update', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: [{ id: 1, title: 'Updated' }] }),
      });

      const result = await volcano.update('posts', { title: 'Updated' }).eq('id', 1);

      expect(result.data).toEqual([{ id: 1, title: 'Updated' }]);

      const requestBody = JSON.parse(fetch.mock.calls[0][1].body);
      expect(requestBody.filters).toContainEqual({ column: 'id', operator: 'eq', value: 1 });
    });

    it('should support all filter methods', () => {
      const builder = volcano
        .update('posts', { views: 0 })
        .eq('status', 'draft')
        .neq('author', 'admin')
        .gt('age', 30)
        .lt('score', 100);

      expect(builder.filters).toHaveLength(4);
    });
  });

  describe('delete()', () => {
    it('should create delete builder', () => {
      const builder = volcano.delete('posts');
      expect(builder.operation).toBe('delete');
      expect(builder.values).toBeNull();
    });

    it('should execute delete with filters', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: [{ id: 1 }] }),
      });

      const result = await volcano.delete('posts').eq('id', 1);

      expect(result.error).toBeNull();

      expect(fetch).toHaveBeenCalledWith(
        'https://api.test.com/databases/test_db/query/delete',
        expect.any(Object),
      );
    });
  });

  describe('Error handling', () => {
    it('should return error when not authenticated', async () => {
      volcano.accessToken = null;

      const result = await volcano.insert('posts', { title: 'Test' });

      expect(result.data).toBeNull();
      expect(result.error.message).toContain('No active session');
    });

    it('should return error when database not set', async () => {
      volcano._currentDatabaseName = null;

      const result = await volcano.insert('posts', { title: 'Test' });

      expect(result.data).toBeNull();
      expect(result.error.message).toContain('Database name not set');
    });

    it('should handle API errors', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ error: 'Constraint violation' }),
      });

      const result = await volcano.insert('posts', { title: null });

      expect(result.data).toBeNull();
      expect(result.error.message).toBe('Constraint violation');
    });

    it('should handle network errors', async () => {
      global.fetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await volcano.insert('posts', { title: 'Test' });

      expect(result.data).toBeNull();
      expect(result.error.message).toBe('Network error');
    });
  });

  describe('Promise/thenable support', () => {
    it('should support await directly on insert', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: [{ id: 1 }] }),
      });

      const { data, error } = await volcano.insert('posts', { title: 'Test' });

      expect(data).toEqual([{ id: 1 }]);
      expect(error).toBeNull();
    });

    it('should support .then() on update', (done) => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: [{ id: 1, title: 'Updated' }] }),
      });

      volcano
        .update('posts', { title: 'Updated' })
        .eq('id', 1)
        .then((result) => {
          expect(result.data).toEqual([{ id: 1, title: 'Updated' }]);
          done();
        });
    });

    it('should support .then() on delete', (done) => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: [] }),
      });

      volcano
        .delete('posts')
        .eq('id', 1)
        .then((result) => {
          expect(result.error).toBeNull();
          done();
        });
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

      expect(builder.filters).toHaveLength(10);
      expect(builder.filters.map((f) => f.operator)).toEqual([
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

      expect(builder.filters).toHaveLength(2);
    });
  });
});
