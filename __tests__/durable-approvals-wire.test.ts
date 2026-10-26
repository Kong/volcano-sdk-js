/** @jest-environment ./__tests__/node-environment.cjs */
import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import { VolcanoClient } from '../src/index.ts';
import { approval, approved, page, stats } from './support/durable-approval-api-fixtures.ts';

// The durable-approvals transport tests settle the credential and the
// validation; the route, the method, the query, and how a refusal reads are
// the real transport's work.
function realClient() {
  return new VolcanoClient({
    apiUrl: 'https://api.test.com',
    anonKey: 'ak-durable',
    accessToken: 'owner-token',
  });
}

function lastRequest() {
  const [url, init] = jest.mocked(globalThis.fetch).mock.calls.at(-1) ?? [];
  return { url, method: init?.method, headers: new Headers(init?.headers), body: init?.body };
}

beforeEach(() => {
  jest.mocked(globalThis.fetch).mockReset();
});

function readsOverTheWire(): void {
  test('lists approvals from the project collection with its filters', async () => {
    jest.mocked(globalThis.fetch).mockResolvedValue(Response.json(page));

    const { data, error } = await realClient().durable.approvals.list('proj-1', {
      status: 'pending',
      executionId: 'exec-1',
      limit: 5,
    });

    expect(error).toBeNull();
    expect(data).toEqual(page);
    expect(lastRequest()).toMatchObject({
      url: 'https://api.test.com/projects/proj-1/durable-approvals?status=pending&execution_id=exec-1&limit=5',
      method: 'GET',
    });
    expect(lastRequest().headers.get('authorization')).toBe('Bearer owner-token');
  });

  test('reads stats and one approval', async () => {
    jest.mocked(globalThis.fetch).mockResolvedValueOnce(Response.json(stats));
    await realClient().durable.approvals.stats('proj-1', { function: 'order-pipeline' });
    expect(lastRequest()).toMatchObject({
      url: 'https://api.test.com/projects/proj-1/durable-approvals/stats?function=order-pipeline',
      method: 'GET',
    });

    jest.mocked(globalThis.fetch).mockResolvedValueOnce(Response.json(approval));
    await realClient().durable.approvals.get('proj-1', 'apr-1');
    expect(lastRequest()).toMatchObject({
      url: 'https://api.test.com/projects/proj-1/durable-approvals/apr-1',
      method: 'GET',
    });
    expect(lastRequest().headers.get('authorization')).toBe('Bearer owner-token');
  });
}

function postsDecisions(): void {
  test('posts a decision with its comment as JSON', async () => {
    jest.mocked(globalThis.fetch).mockResolvedValueOnce(Response.json(approved));
    const { data, status } = await realClient().durable.approvals.approve('proj-1', 'apr-1', {
      comment: 'Address checked',
    });
    expect(status).toBe(200);
    expect(data).toEqual(approved);
    expect(lastRequest()).toMatchObject({
      url: 'https://api.test.com/projects/proj-1/durable-approvals/apr-1/approve',
      method: 'POST',
      body: JSON.stringify({ comment: 'Address checked' }),
    });
    expect(lastRequest().headers.get('content-type')).toBe('application/json');
    expect(lastRequest().headers.get('authorization')).toBe('Bearer owner-token');

    jest.mocked(globalThis.fetch).mockResolvedValueOnce(Response.json({ ...approved, status: 'denied' }));
    await realClient().durable.approvals.deny('proj-1', 'apr-1');
    expect(lastRequest()).toMatchObject({
      url: 'https://api.test.com/projects/proj-1/durable-approvals/apr-1/deny',
      method: 'POST',
      body: '{}',
    });
  });
}

function surfacesRefusals(): void {
  // A refusal is a result, not an exception, and keeps the platform's code so
  // a caller can tell a decision that lost a race from one it may not make.
  test.each([
    [
      403,
      undefined,
      'project access tokens cannot decide durable approvals; a person decides in the dashboard or with a platform token',
    ],
    [404, undefined, 'durable approval not found'],
    [409, 'approval_decided', 'approval was already denied'],
    [409, 'approval_expired', 'approval expired'],
  ])('surfaces a %d refusal with its status and code', async (status, code, message) => {
    jest.mocked(globalThis.fetch).mockResolvedValueOnce(Response.json({ error: message, code }, { status }));

    const result = await realClient().durable.approvals.approve('proj-1', 'apr-1');

    expect(result.data).toBeNull();
    expect(result.status).toBe(status);
    expect(result.error).toBeInstanceOf(Error);
    expect(result.error).toMatchObject({
      status,
      message,
      ...(code === undefined ? {} : { code }),
    });
  });
}

describe('durable.approvals over the wire', () => {
  readsOverTheWire();
  postsDecisions();
  surfacesRefusals();
});
