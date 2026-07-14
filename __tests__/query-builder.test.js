const { createVolcanoClient } = require('../src/index.ts');

const jsonResponse = (body, status = 200) => ({
  json: () => Promise.resolve(body),
  ok: status >= 200 && status < 300,
  status,
});

describe('database query builder', () => {
  let database;

  beforeEach(() => {
    const volcano = createVolcanoClient({
      accessToken: 'test-access-token',
      anonKey: 'ak-test-anon-key',
      baseUrl: 'https://api.test.com',
    });
    database = volcano.database('test_db');
  });

  it('builds select clauses and filters', () => {
    const query = database
      .from('posts')
      .select('id, title')
      .eq('status', 'published')
      .neq('author', 'bot')
      .gt('views', 10)
      .gte('score', 1)
      .lt('age', 365)
      .lte('priority', 5)
      .like('title', '%Volcano%')
      .ilike('content', '%javascript%')
      .is('deleted_at', null)
      .in('category', ['tech', 'news'])
      .order('created_at', { ascending: false })
      .limit(10)
      .offset(20);

    expect(query.selectColumns).toEqual(['id', 'title']);
    expect(query.filters.map(({ operator }) => operator)).toEqual([
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
    expect(query.orderClauses).toEqual([{ ascending: false, column: 'created_at' }]);
    expect(query.limitValue).toBe(10);
    expect(query.offsetValue).toBe(20);
  });

  it('executes a select through the generated operation', async () => {
    global.fetch.mockResolvedValueOnce(
      jsonResponse({
        count: 2,
        data: [
          { id: 1, title: 'Post 1' },
          { id: 2, title: 'Post 2' },
        ],
      }),
    );

    const result = await database.from('posts').select('id, title').eq('status', 'published');

    expect(result).toEqual({
      count: 2,
      data: [
        { id: 1, title: 'Post 1' },
        { id: 2, title: 'Post 2' },
      ],
      error: null,
    });
    const [url, init] = global.fetch.mock.calls[0];
    expect(url).toBe('https://api.test.com/databases/test_db/query/select');
    expect(init.method).toBe('POST');
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer test-access-token');
    expect(JSON.parse(init.body)).toEqual({
      filters: [{ column: 'status', operator: 'eq', value: 'published' }],
      select: ['id', 'title'],
      table: 'posts',
    });
  });

  it('refreshes an expired access token and retries once', async () => {
    const volcano = createVolcanoClient({
      accessToken: 'expired-token',
      anonKey: 'anon-key',
      baseUrl: 'https://api.test.com',
      refreshToken: 'refresh-token',
    });
    global.fetch
      .mockResolvedValueOnce(jsonResponse({ error: 'expired' }, 401))
      .mockResolvedValueOnce(
        jsonResponse({
          access_token: 'new-token',
          expires_in: 3600,
          refresh_token: 'new-refresh-token',
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ count: 1, data: [{ id: 1 }] }));

    const result = await volcano.database('test_db').from('posts').select();

    expect(result).toEqual({ count: 1, data: [{ id: 1 }], error: null });
    expect(global.fetch).toHaveBeenCalledTimes(3);
    expect(new Headers(global.fetch.mock.calls[2][1].headers).get('Authorization')).toBe(
      'Bearer new-token',
    );
  });

  it('returns an ergonomic error without an access-token session', async () => {
    const volcano = createVolcanoClient({ baseUrl: 'https://api.test.com' });

    const result = await volcano.database('test_db').from('posts').select();

    expect(result.data).toBeNull();
    expect(result.count).toBe(0);
    expect(result.error.message).toContain('No active session');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('normalizes generated API and network errors', async () => {
    global.fetch.mockResolvedValueOnce(jsonResponse({ error: 'Table not found' }, 404));
    const apiFailure = await database.from('missing').select();
    global.fetch.mockRejectedValueOnce(new Error('Network error'));
    const networkFailure = await database.from('posts').select();

    expect(apiFailure.error.message).toBe('Table not found');
    expect(networkFailure).toMatchObject({ count: 0, data: null });
    expect(networkFailure.error.message).toBe('Network error');
  });

  it('executes insert, update, and delete operations', async () => {
    global.fetch
      .mockResolvedValueOnce(jsonResponse({ data: [{ id: 1, title: 'New' }] }))
      .mockResolvedValueOnce(jsonResponse({ data: [{ id: 1, title: 'Updated' }] }))
      .mockResolvedValueOnce(jsonResponse({ data: [{ id: 1 }] }));

    const inserted = await database.from('posts').insert({ title: 'New' });
    const updated = await database.from('posts').update({ title: 'Updated' }).eq('id', 1);
    const deleted = await database.from('posts').delete().eq('id', 1);

    expect(inserted.data).toEqual([{ id: 1, title: 'New' }]);
    expect(updated.data).toEqual([{ id: 1, title: 'Updated' }]);
    expect(deleted.data).toEqual([{ id: 1 }]);
    expect(global.fetch.mock.calls.map(([url]) => url)).toEqual([
      'https://api.test.com/databases/test_db/query/insert',
      'https://api.test.com/databases/test_db/query/update',
      'https://api.test.com/databases/test_db/query/delete',
    ]);
    expect(JSON.parse(global.fetch.mock.calls[1][1].body).filters).toEqual([
      { column: 'id', operator: 'eq', value: 1 },
    ]);
  });

  it('supports thenable builders', async () => {
    global.fetch
      .mockResolvedValueOnce(jsonResponse({ count: 1, data: [{ id: 1 }] }))
      .mockResolvedValueOnce(jsonResponse({ data: [{ id: 2 }] }));

    await expect(database.from('posts').select()).resolves.toMatchObject({ data: [{ id: 1 }] });
    await expect(database.from('posts').insert({ title: 'New' })).resolves.toMatchObject({
      data: [{ id: 2 }],
    });
  });
});
