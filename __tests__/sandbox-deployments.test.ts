/** @jest-environment ./__tests__/node-environment.cjs */
import { afterEach, expect, jest, test } from '@jest/globals';
import { VolcanoAuth } from '../src/index.ts';

const projectId = '11111111-1111-4111-8111-111111111111';
const templateId = '22222222-2222-4222-8222-222222222222';
const requestId = '33333333-3333-4333-8333-333333333333';
const originalFetch = globalThis.fetch;
const deployment = {
  id: requestId,
  status: 'building',
  created_at: '2026-10-07T00:00:00Z',
  updated_at: '2026-10-07T00:00:00Z',
};
function client() {
  return new VolcanoAuth({
    apiUrl: 'https://api.test.com',
    anonKey: 'ak-project',
    accessToken: 'sk-service',
  });
}
afterEach(() => {
  globalThis.fetch = originalFetch;
});

test('uploads raw archive bytes and preserves deployment replay identity', async () => {
  const fetchMock = jest
    .fn<typeof fetch>()
    .mockResolvedValue(Response.json(deployment, { status: 202 }));
  globalThis.fetch = fetchMock;
  const bytes = new Uint8Array([31, 139, 0, 255]);
  const result = await client().sandboxes.deploy(projectId, templateId, bytes, {
    name: 'my-image',
    memoryMB: 2048,
    ports: [8080],
    requestId,
  });
  expect(result.error).toBeNull();
  expect(result.data).toEqual({
    id: requestId,
    status: 'building',
    createdAt: deployment.created_at,
    updatedAt: deployment.updated_at,
  });
  const call = firstCall(fetchMock.mock.calls);
  expect(call[0]).toBe(
    `https://api.test.com/projects/${projectId}/sandboxes/${templateId}/deployments`,
  );
  expect(new Headers(call[1]?.headers).get('Idempotency-Key')).toBe(requestId);
  const body = call[1]?.body;
  if (!(body instanceof FormData)) {
    throw new TypeError('Expected multipart source upload');
  }
  expect(body.get('name')).toBe('my-image');
  expect(body.get('memory_mb')).toBe('2048');
  expect(body.get('ports')).toBe('[8080]');
  const code = body.get('code');
  if (!(code instanceof Blob)) {
    throw new TypeError('Expected binary archive');
  }
  expect(code.type).toBe('application/gzip');
  expect(new Uint8Array(await code.arrayBuffer())).toEqual(bytes);
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
    .mockResolvedValueOnce(
      new Response(bytes, { headers: { 'Content-Type': 'application/gzip' } }),
    );
  globalThis.fetch = fetchMock;
  const sdk = client();
  const history = await sdk.sandboxes.deployments(projectId, templateId, { cursor: 'first' });
  expect(history.data).toMatchObject({ pagination: { nextCursor: 'next', hasMore: true } });
  const detail = await sdk.sandboxes.deployment(projectId, templateId, requestId);
  expect(detail.data?.id).toBe(requestId);
  const source = await sdk.sandboxes.source(projectId, templateId, requestId);
  expect(source.data).toEqual(bytes);
  expect(fetchMock.mock.calls[0]?.[0]).toContain('cursor=first');
});

test('refuses invalid build configuration without issuing a request', async () => {
  const fetchMock = jest.fn<typeof fetch>();
  globalThis.fetch = fetchMock;
  const result = await client().sandboxes.deploy(projectId, templateId, new Uint8Array(), {
    name: 'app',
    ports: [65536],
  });
  expect(result.error).toBeInstanceOf(RangeError);
  expect(fetchMock).not.toHaveBeenCalled();
});

function firstCall(calls: Parameters<typeof fetch>[]): Parameters<typeof fetch> {
  const call = calls[0];
  if (call === undefined) {
    throw new Error('Missing request');
  }
  return call;
}

test('reads regional build logs with pagination and preserves failures', async () => {
  const fetchMock = jest
    .fn<typeof fetch>()
    .mockResolvedValueOnce(
      Response.json({
        data: [{ timestamp: deployment.created_at, message: 'Building image' }],
        next_cursor: 'next',
      }),
    )
    .mockResolvedValueOnce(
      Response.json({ error: 'Forbidden', code: 'forbidden' }, { status: 403 }),
    );
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
  expect(firstCall(fetchMock.mock.calls)[0]).toContain(
    'region=aws-us-east-1&cursor=first&limit=10',
  );
  const failure = await sdk.sandboxes.deployment(projectId, templateId, requestId);
  expect(failure.data).toBeNull();
  expect(failure.error).toMatchObject({ status: 403, code: 'forbidden' });
});

test('deletes a custom template through its project scope', async () => {
  const fetchMock = jest.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 202 }));
  globalThis.fetch = fetchMock;
  const result = await client().sandboxes.deleteTemplate(projectId, templateId);
  expect(result.error).toBeNull();
  expect(firstCall(fetchMock.mock.calls)[0]).toBe(
    `https://api.test.com/projects/${projectId}/sandboxes/${templateId}`,
  );
  expect(firstCall(fetchMock.mock.calls)[1]?.method).toBe('DELETE');
});

test('omits optional deployment fields and accepts boundary ports', async () => {
  const fetchMock = jest
    .fn<typeof fetch>()
    .mockImplementation(() => Promise.resolve(Response.json(deployment, { status: 202 })));
  globalThis.fetch = fetchMock;
  const sdk = client();
  const minimal = await sdk.sandboxes.deploy(projectId, templateId, new Uint8Array(), {
    name: 'minimal',
  });
  expect(minimal.error).toBeNull();
  const body = firstCall(fetchMock.mock.calls)[1]?.body;
  expect(body).toBeInstanceOf(FormData);
  if (!(body instanceof FormData)) {
    throw new TypeError('Expected multipart upload');
  }
  expect(body.has('memory_mb')).toBe(false);
  expect(body.has('ports')).toBe(false);
  const boundary = await sdk.sandboxes.deploy(projectId, templateId, new Uint8Array(), {
    name: 'ports',
    ports: [1, 65535],
    memoryMB: 1024,
  });
  expect(boundary.error).toBeNull();
});

test.each([0, -1, 65536, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
  'rejects invalid deployment port %s before sending',
  async (port) => {
    const fetchMock = jest.fn<typeof fetch>();
    globalThis.fetch = fetchMock;
    const outcome = await client().sandboxes.deploy(projectId, templateId, new Uint8Array(), {
      name: 'ports',
      ports: [port],
    });
    expect(outcome).toEqual({
      data: null,
      error: new RangeError('Sandbox ports must be between 1 and 65535'),
    });
    expect(fetchMock).not.toHaveBeenCalled();
  },
);

test('accepts the archive limit and rejects the next byte before upload', async () => {
  const fetchMock = jest.fn<typeof fetch>().mockResolvedValue(Response.json(deployment));
  globalThis.fetch = fetchMock;
  const sdk = client();
  const limit = 32 * 1024 * 1024;
  const accepted = await sdk.sandboxes.deploy(projectId, templateId, new Uint8Array(limit), {
    name: 'limit',
  });
  expect(accepted.error).toBeNull();
  expect(fetchMock).toHaveBeenCalledTimes(1);
  const rejected = await sdk.sandboxes.deploy(projectId, templateId, new Uint8Array(limit + 1), {
    name: 'oversize',
  });
  expect(rejected).toEqual({
    data: null,
    error: new RangeError('Sandbox source archives are limited to 32 MiB'),
  });
  expect(fetchMock).toHaveBeenCalledTimes(1);
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
  [
    { data: [], pagination: { limit: '10', has_more: false } },
    'Invalid Sandbox deployment pagination',
  ],
  [
    { data: [], pagination: { limit: 10, has_more: 'false' } },
    'Invalid Sandbox deployment pagination',
  ],
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
