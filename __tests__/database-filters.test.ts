/** @jest-environment node */
import { expect, test } from '@jest/globals';
import fc from 'fast-check';
import {
  type DatabaseFilter,
  FilterMixin,
  type FilterTarget,
  type FilterValue,
} from '../src/database-filters.ts';

type Builder = FilterTarget & typeof FilterMixin & { table: string };

function builder(): Builder {
  const filters: DatabaseFilter[] = [];
  return Object.assign({ filters, table: 'messages' }, FilterMixin);
}

const filterValue = fc.oneof(
  fc.string(),
  fc.double(),
  fc.boolean(),
  fc.constant(null),
  fc.date({ noInvalidDate: true }),
);

test.each(['eq', 'neq', 'gt', 'gte', 'lt', 'lte'] as const)(
  '%s preserves its column, value, and builder identity',
  (operator) => {
    fc.assert(
      fc.property(fc.string(), filterValue, (column, value) => {
        const query = builder();
        const result: Builder = query[operator](column, value);
        expect(result).toBe(query);
        expect(query.filters).toEqual([{ column, operator, value }]);
      }),
    );
  },
);

test.each(['like', 'ilike'] as const)('%s preserves wildcard patterns', (operator) => {
  fc.assert(
    fc.property(fc.string(), fc.string(), (column, pattern) => {
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
  fc.assert(
    fc.property(fc.array(filterValue), (values) => {
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
  const date: FilterValue = new Date('2026-09-22T00:00:00Z');
  const result: Builder = query.eq('sent_at', date).is('deleted_at', null).in('id', []);

  expect(result).toBe(query);
  expect(result.table).toBe('messages');
  expect(query.filters).toEqual([
    { column: 'sent_at', operator: 'eq', value: date },
    { column: 'deleted_at', operator: 'is', value: null },
    { column: 'id', operator: 'in', value: [] },
  ]);
  expect(query.filters[0]?.value).toBe(date);
  expect(other.filters).toEqual([]);
});
