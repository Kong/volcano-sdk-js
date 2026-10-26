/** @jest-environment ./__tests__/node-environment.cjs */
import { expect, test } from '@jest/globals';
import { array, assert, boolean, constant, date, double, oneof, property, string } from 'fast-check';
import { FilterBuilder, type FilterValue } from '../src/database-filters.ts';

class Builder extends FilterBuilder {
  readonly table = 'messages';
}

function builder(): Builder {
  return new Builder();
}

const filterValue = oneof(string(), double(), boolean(), constant(null), date({ noInvalidDate: true }));

test.each(['eq', 'neq', 'gt', 'gte', 'lt', 'lte'] as const)(
  '%s preserves its column, value, and builder identity',
  (operator) => {
    assert(
      property(string(), filterValue, (column, value) => {
        const query = builder();
        query.is('existing', null);
        const result: Builder = query[operator](column, value);
        expect(result).toBe(query);
        expect(query.filters).toEqual([
          { column: 'existing', operator: 'is', value: null },
          { column, operator, value },
        ]);
      }),
    );
  },
);

test.each(['like', 'ilike'] as const)('%s preserves wildcard patterns', (operator) => {
  assert(
    property(string(), string(), (column, pattern) => {
      const query = builder();
      expect(query[operator](column, pattern)).toBe(query);
      expect(query.filters).toEqual([{ column, operator, value: pattern }]);
    }),
  );
});

test.each([null, true, false])('is preserves %p without truthiness coercion', (value) => {
  const query = builder();
  expect(query.is('active', value)).toBe(query);
  expect(query.filters).toEqual([{ column: 'active', operator: 'is', value }]);
});

test('in retains array identity and empty arrays', () => {
  assert(
    property(array(filterValue), (values) => {
      const query = builder();
      expect(query.in('id', values)).toBe(query);
      expect(query.filters).toEqual([{ column: 'id', operator: 'in', value: values }]);
      expect(query.filters[0]?.value).toBe(values);
    }),
  );
});

test('chained filters append in order and stay isolated between builders', () => {
  const query = builder();
  const other = builder();
  const sentAt: FilterValue = new Date('2026-09-22T00:00:00Z');
  const result: Builder = query.eq('sent_at', sentAt).is('deleted_at', null).in('id', []);

  expect(result).toBe(query);
  expect(result.table).toBe('messages');
  expect(query.filters).toEqual([
    { column: 'sent_at', operator: 'eq', value: sentAt },
    { column: 'deleted_at', operator: 'is', value: null },
    { column: 'id', operator: 'in', value: [] },
  ]);
  expect(query.filters[0]?.value).toBe(sentAt);
  expect(other.filters).toEqual([]);
});
