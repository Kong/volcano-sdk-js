/** @jest-environment ./__tests__/node-environment.cjs */
import { expect, test } from '@jest/globals';
import { isDurableExecution, isDurablePage } from '../src/durable-response.ts';

const execution = {
  id: 'exec-1',
  function_id: 'fn-1',
  name: 'order-1',
  status: 'succeeded',
  region: 'aws-us-east-1',
  created_at: '2026-09-23T12:00:00Z',
  completed_at: '2026-09-23T12:05:00Z',
  result: { ok: true },
  result_expired: false,
  error: { type: 'application', message: 'none' },
};

const page = { data: [execution], page: 1, limit: 20, total: 1, has_more: false };

test('accepts complete and sparse durable responses', () => {
  expect(isDurableExecution(execution)).toBe(true);
  const sparse = {
    id: execution.id,
    function_id: execution.function_id,
    name: execution.name,
    status: execution.status,
    region: execution.region,
    created_at: execution.created_at,
  };
  expect(isDurableExecution(sparse)).toBe(true);
  expect(isDurablePage(page)).toBe(true);
  expect(isDurablePage({ ...page, data: [] })).toBe(true);
});

test.each(['pending', 'running', 'succeeded', 'failed', 'timed_out', 'stopped', 'unknown'])(
  'accepts the documented durable status %s',
  (status) => {
    expect(isDurableExecution({ ...execution, status })).toBe(true);
  },
);

test('rejects an array even when it carries every execution field', () => {
  expect(isDurableExecution(Object.assign([], execution))).toBe(false);
});

test.each([
  null,
  [],
  { ...execution, id: null },
  { ...execution, function_id: null },
  { ...execution, name: null },
  { ...execution, status: 'queued' },
  { ...execution, region: null },
  { ...execution, created_at: null },
  { ...execution, completed_at: 1 },
  { ...execution, result_expired: 'false' },
  { ...execution, error: null },
  { ...execution, error: { type: 1 } },
  { ...execution, error: { message: 1 } },
])('rejects malformed execution %#', (value) => {
  expect(isDurableExecution(value)).toBe(false);
});

test.each([
  null,
  [],
  { ...page, data: {} },
  { ...page, data: [{ ...execution, status: 'queued' }] },
  { ...page, page: '1' },
  { ...page, limit: '20' },
  { ...page, total: '1' },
  { ...page, has_more: 'no' },
])('rejects malformed durable page %#', (value) => {
  expect(isDurablePage(value)).toBe(false);
});
