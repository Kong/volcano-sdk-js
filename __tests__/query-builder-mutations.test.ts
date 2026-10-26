/** @jest-environment ./__tests__/node-environment.cjs */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { VolcanoAuth } from '../src/index.ts';
import { fetchBody } from './auth-concurrency-fixtures.ts';
import { filterOperators, responseFixture } from './support/query-builder-fixtures.ts';

const fetchMock = jest.mocked(globalThis.fetch);

const config = {
  apiUrl: 'https://api.test.com',
  anonKey: 'ak-test-anon-key',
};

let volcano: VolcanoAuth;

function insertsRows(): void {
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
}

function updatesRows(): void {
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

      const requestBody: unknown = JSON.parse(fetchBody(0));
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
}

function deletesRows(): void {
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

      expect(fetchMock).toHaveBeenCalledWith('https://api.test.com/databases/test_db/query/delete', expect.any(Object));
    });
  });
}

function reportsMutationFailures(): void {
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
}

function supportsThenables(): void {
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
}

function filtersMutations(): void {
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
      expect(filterOperators(builder)).toEqual(['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'like', 'ilike', 'is', 'in']);
    });

    it('should support all filter methods on delete', () => {
      const builder = volcano.delete('posts');

      builder.eq('status', 'spam');
      builder.lt('created_at', '2020-01-01');

      expect(Reflect.get(builder, 'filters')).toHaveLength(2);
    });
  });
}

describe('MutationBuilder', () => {
  beforeEach(() => {
    volcano = new VolcanoAuth({ ...config, accessToken: 'test-access-token' }).database('test_db');
  });

  insertsRows();
  updatesRows();
  deletesRows();
  reportsMutationFailures();
  supportsThenables();
  filtersMutations();
});
