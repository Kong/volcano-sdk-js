/** @jest-environment ./__tests__/node-environment.cjs */
import { afterEach, expect, jest, test } from '@jest/globals';
import { VolcanoAuth } from '../src/index.ts';
import { deployment, firstCall, projectId, requestId, templateId } from './support/sandbox-fixtures.ts';

const originalFetch = globalThis.fetch;
function client(): VolcanoAuth {
  return new VolcanoAuth({
    apiUrl: 'https://api.test.com',
    anonKey: 'ak-project',
    accessToken: 'sk-service',
  });
}
afterEach(() => {
  globalThis.fetch = originalFetch;
});

test('reads deployment history, detail and exact source bytes', async () => {
  const bytes = new Uint8Array([31, 139, 0, 255]);
  const fetchMock = jest
    .fn<typeof fetch>()
    .mockResolvedValueOnce(
      Response.json({
        data: [deployment],
        pagination: { limit: 1, has_more: true, next_cursor: 'next' },
      }),
    )
    .mockResolvedValueOnce(Response.json(deployment))
    .mockResolvedValueOnce(new Response(bytes, { headers: { 'Content-Type': 'application/gzip' } }));
  globalThis.fetch = fetchMock;
  const sdk = client();
  const history = await sdk.sandboxes.deployments(projectId, templateId, {
    cursor: 'first',
    limit: 1,
  });
  expect(history.data).toMatchObject({ pagination: { nextCursor: 'next', hasMore: true } });
  const detail = await sdk.sandboxes.deployment(projectId, templateId, requestId);
  expect(detail.data?.id).toBe(requestId);
  const source = await sdk.sandboxes.source(projectId, templateId, requestId);
  expect(source.data).toEqual(bytes);
  expect(fetchMock.mock.calls[0]?.[0]).toContain('cursor=first');
  expect(fetchMock.mock.calls[0]?.[0]).toContain('limit=1');
});

test('reads regional build logs with pagination and preserves failures', async () => {
  const fetchMock = jest
    .fn<typeof fetch>()
    .mockResolvedValueOnce(
      Response.json({
        data: [{ timestamp: deployment.created_at, message: 'Building image' }],
        next_cursor: 'next',
      }),
    )
    .mockResolvedValueOnce(Response.json({ error: 'Forbidden', code: 'forbidden' }, { status: 403 }));
  globalThis.fetch = fetchMock;
  const sdk = client();
  const logs = await sdk.sandboxes.logs(projectId, templateId, requestId, {
    region: 'aws-us-east-1',
    cursor: 'first',
    limit: 10,
  });
  expect(logs.data).toEqual({
    data: [{ timestamp: deployment.created_at, message: 'Building image' }],
    nextCursor: 'next',
  });
  expect(firstCall(fetchMock.mock.calls)[0]).toContain('region=aws-us-east-1&cursor=first&limit=10');
  const failure = await sdk.sandboxes.deployment(projectId, templateId, requestId);
  expect(failure.data).toBeNull();
  expect(failure.error).toMatchObject({ status: 403, code: 'forbidden' });
});

test('reads complete deployment history without optional pagination', async () => {
  const fetchMock = jest.fn<typeof fetch>().mockResolvedValue(
    Response.json({
      data: [deployment],
      pagination: { limit: 10, has_more: false },
    }),
  );
  globalThis.fetch = fetchMock;
  const outcome = await client().sandboxes.deployments(projectId, templateId);
  expect(outcome).toEqual({
    error: null,
    data: {
      data: [
        {
          id: requestId,
          status: 'building',
          createdAt: deployment.created_at,
          updatedAt: deployment.updated_at,
        },
      ],
      pagination: { limit: 10, hasMore: false },
    },
  });
  expect(firstCall(fetchMock.mock.calls)[0]).toBe(
    `https://api.test.com/projects/${projectId}/sandboxes/${templateId}/deployments`,
  );
});

test.each([
  [{ data: {} }, 'Invalid Sandbox deployment page'],
  [{ data: [], pagination: { limit: '10', has_more: false } }, 'Invalid Sandbox deployment pagination'],
  [{ data: [], pagination: { limit: 10, has_more: 'false' } }, 'Invalid Sandbox deployment pagination'],
] as const)('rejects malformed deployment history %j', async (body, message) => {
  globalThis.fetch = jest.fn<typeof fetch>().mockResolvedValue(Response.json(body));
  const outcome = await client().sandboxes.deployments(projectId, templateId);
  expect(outcome).toEqual({ data: null, error: new TypeError(message) });
});

test('reads build logs with only the required region', async () => {
  const fetchMock = jest.fn<typeof fetch>().mockResolvedValue(
    Response.json({
      data: [{ timestamp: deployment.created_at, message: 'ready' }],
    }),
  );
  globalThis.fetch = fetchMock;
  const outcome = await client().sandboxes.logs(projectId, templateId, requestId, {
    region: 'aws-us-east-1',
  });
  expect(outcome).toEqual({
    error: null,
    data: { data: [{ timestamp: deployment.created_at, message: 'ready' }] },
  });
  expect(firstCall(fetchMock.mock.calls)[0]).toBe(
    `https://api.test.com/projects/${projectId}/sandboxes/${templateId}/deployments/${requestId}/logs?region=aws-us-east-1`,
  );
});

test('rejects malformed build log pages', async () => {
  globalThis.fetch = jest.fn<typeof fetch>().mockResolvedValue(Response.json({ data: {} }));
  const outcome = await client().sandboxes.logs(projectId, templateId, requestId, {
    region: 'aws-us-east-1',
  });
  expect(outcome).toEqual({ data: null, error: new TypeError('Invalid Sandbox build logs') });
});

test('rejects invalid binary source responses', async () => {
  const response = new Response();
  Object.defineProperty(response, 'blob', { value: () => Promise.resolve(null) });
  globalThis.fetch = jest.fn<typeof fetch>().mockResolvedValue(response);
  const outcome = await client().sandboxes.source(projectId, templateId, requestId);
  expect(outcome).toEqual({ data: null, error: new TypeError('Invalid Sandbox source archive') });
});

test('downloads exact archive bytes even when the server labels them as text', async () => {
  const bytes = new Uint8Array([31, 139, 0, 255]);
  globalThis.fetch = jest
    .fn<typeof fetch>()
    .mockResolvedValue(new Response(bytes, { headers: { 'Content-Type': 'text/plain' } }));
  const outcome = await client().sandboxes.source(projectId, templateId, requestId);
  expect(outcome).toEqual({ data: bytes, error: null });
});
