/** @jest-environment ./__tests__/node-environment.cjs */
import { expect, test } from '@jest/globals';
import { assert, constant, oneof, property, string } from 'fast-check';
import { databaseConnectionString } from '../src/database-connection-string.ts';
import { propertyOptions } from './support/property-options.ts';

const userId = string({ unit: 'binary', maxLength: 128 });
/** A user ID paired with the application_name it selects; an empty ID means full access. */
const userIdWithApplicationName = oneof(
  constant({ value: '', applicationName: 'volcano_full_access' }),
  string({ unit: 'binary', minLength: 1, maxLength: 128 }).map((value) => ({
    value,
    applicationName: `volcano_user_access:${value}`,
  })),
);
const base = 'postgres://owner:secret@host:5432/db?sslmode=require&options=-c+search_path%3Dapp';

test('arbitrary user IDs remain one query value and preserve database credentials', () => {
  assert(
    property(userIdWithApplicationName, ({ value, applicationName }) => {
      const result = databaseConnectionString(base, { userId: value });
      expect(result.startsWith(`${base}&`)).toBe(true);
      const url = new URL(result);
      expect(url.username).toBe('owner');
      expect(url.password).toBe('secret');
      expect(url.searchParams.getAll('application_name')).toEqual([applicationName]);
      expect([...url.searchParams.keys()]).toEqual(['sslmode', 'options', 'application_name']);
    }),
    propertyOptions(),
  );
});

test('changing arbitrary user IDs removes the previous scope and stays idempotent', () => {
  assert(
    property(userId, userId, (first, second) => {
      const scoped = databaseConnectionString(base, { userId: first });
      const replaced = databaseConnectionString(scoped, { userId: second });
      expect(replaced).toBe(databaseConnectionString(base, { userId: second }));
      expect(databaseConnectionString(replaced, { userId: second })).toBe(replaced);
      expect(databaseConnectionString(replaced)).toBe(`${base}&application_name=volcano_full_access`);
    }),
    propertyOptions(),
  );
});
