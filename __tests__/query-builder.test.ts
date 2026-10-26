/** @jest-environment ./__tests__/node-environment.cjs */
import { beforeEach, describe, expect, it } from '@jest/globals';
import { VolcanoAuth } from '../src/index.ts';

const config = {
  apiUrl: 'https://api.test.com',
  anonKey: 'ak-test-anon-key',
};

let volcano: VolcanoAuth;

function selectsTablesAndColumns(): void {
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
}

function addsComparisonFilters(): void {
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
}

function addsRangeAndPatternFilters(): void {
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
}

function ordersAndPages(): void {
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
}

function chainsMethods(): void {
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
}

describe('QueryBuilder', () => {
  beforeEach(() => {
    volcano = new VolcanoAuth({ ...config, accessToken: 'test-access-token' }).database('test_db');
  });

  selectsTablesAndColumns();

  describe('Filter methods', () => {
    addsComparisonFilters();
    addsRangeAndPatternFilters();
  });

  ordersAndPages();
  chainsMethods();
});
