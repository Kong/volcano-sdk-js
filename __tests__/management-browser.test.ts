/** @jest-environment ./__tests__/node-environment.cjs */
import { expect, jest, test } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

test('the browser bundle exposes the management client without bootstrap', () => {
  const fetchMock = jest.fn<typeof fetch>();
  const source = readFileSync('dist/index.js', 'utf8');
  const result: unknown = runInNewContext(
    `${source}\nJSON.stringify(new ManagementClient({ token: 'browser-explicit-token' }));`,
    { URL, fetch: fetchMock },
  );
  expect(result).toBe('{"git":{"repositories":{},"revisions":{}}}');
  expect(fetchMock).not.toHaveBeenCalled();
});
