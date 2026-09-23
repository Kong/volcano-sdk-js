/** @jest-environment ./__tests__/node-environment.cjs */
import { expect, test } from '@jest/globals';
import { logActivityResult, logSearchResult } from '../src/project-logs.ts';

const event = {
  id: 'log-1',
  timestamp: '2026-09-23T12:00:00Z',
  body: { nested: ['message', 1, true, null] },
  level: 'warn',
  region: 'aws-us-east-1',
  resource: { type: 'function', id: 'fn-1', name: 'orders' },
  deployment: { id: 'deployment-1', stage: 'compile' },
  invocation_id: 'invocation-1',
};

const search = { data: [event], limit: 25, has_more: true, next_cursor: 'next' };
const bucket = {
  start_time: '2026-09-23T12:00:00Z',
  end_time: '2026-09-23T13:00:00Z',
  counts: { levels: { warn: 1 }, regions: { 'aws-us-east-1': 1 }, resource_ids: { 'fn-1': 1 } },
  total: 1,
};
const activity = { data: [bucket], total: 1 };

test('accepts complete log responses without changing the wire objects', () => {
  expect(logSearchResult(search)).toEqual({ data: search, error: null });
  expect(logActivityResult(activity)).toEqual({ data: activity, error: null });
});

test('accepts optional log fields omitted and all documented resource kinds', () => {
  for (const type of ['function', 'frontend', 'database']) {
    const item = {
      id: 'log-2',
      timestamp: event.timestamp,
      body: ['message', { ok: true }],
      resource: { type, id: 'resource-1' },
    };
    expect(logSearchResult({ data: [item], limit: 1, has_more: false })).toMatchObject({
      error: null,
    });
  }
});

test.each([
  null,
  {},
  { ...search, data: {} },
  { ...search, limit: '25' },
  { ...search, has_more: 'yes' },
  { ...search, next_cursor: 10 },
  { ...search, data: [{ ...event, id: null }] },
  { ...search, data: [{ ...event, timestamp: null }] },
  { ...search, data: [{ ...event, body: { invalid: undefined } }] },
  { ...search, data: [{ ...event, body: [Symbol('invalid')] }] },
  { ...search, data: [{ ...event, resource: null }] },
  { ...search, data: [{ ...event, resource: { type: 'other', id: 'fn-1' } }] },
  { ...search, data: [{ ...event, resource: { type: 'function', id: null } }] },
  { ...search, data: [{ ...event, resource: { type: 'function', id: 'fn-1', name: 1 } }] },
  { ...search, data: [{ ...event, level: 'severe' }] },
  { ...search, data: [{ ...event, region: 1 }] },
  { ...search, data: [{ ...event, deployment: { id: null } }] },
  { ...search, data: [{ ...event, deployment: { id: 'deployment-1', stage: 1 } }] },
  { ...search, data: [{ ...event, invocation_id: 1 }] },
])('rejects malformed search response %#', (value) => {
  expect(logSearchResult(value)).toMatchObject({ data: null, error: expect.any(TypeError) });
});

test.each([
  null,
  {},
  { ...activity, data: {} },
  { ...activity, total: '1' },
  { ...activity, data: [{ ...bucket, start_time: null }] },
  { ...activity, data: [{ ...bucket, end_time: null }] },
  { ...activity, data: [{ ...bucket, total: null }] },
  { ...activity, data: [{ ...bucket, counts: null }] },
  { ...activity, data: [{ ...bucket, counts: { ...bucket.counts, levels: { warn: '1' } } }] },
  { ...activity, data: [{ ...bucket, counts: { ...bucket.counts, regions: null } }] },
  { ...activity, data: [{ ...bucket, counts: { ...bucket.counts, resource_ids: null } }] },
])('rejects malformed activity response %#', (value) => {
  expect(logActivityResult(value)).toMatchObject({ data: null, error: expect.any(TypeError) });
});
