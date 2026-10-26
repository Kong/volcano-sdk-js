/** @jest-environment ./__tests__/node-environment.cjs */
import { afterEach, expect, jest, test } from '@jest/globals';
import { VolcanoAuth } from '../src/index.ts';
import { deployment, firstCall, projectId, requestId, templateId } from './support/sandbox-fixtures.ts';
import { expectInstanceOf } from './support/assertions.ts';

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

test('uploads raw archive bytes and preserves deployment replay identity', async () => {
  const fetchMock = jest.fn<typeof fetch>().mockResolvedValue(Response.json(deployment, { status: 202 }));
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
  expect(call[0]).toBe(`https://api.test.com/projects/${projectId}/sandboxes/${templateId}/deployments`);
  expect(new Headers(call[1]?.headers).get('Idempotency-Key')).toBe(requestId);
  const body = call[1]?.body;
  expectInstanceOf(body, FormData);
  expect(body.get('name')).toBe('my-image');
  expect(body.get('memory_mb')).toBe('2048');
  expect(body.get('ports')).toBe('[8080]');
  const code = body.get('code');
  expectInstanceOf(code, Blob);
  expect(code.type).toBe('application/gzip');
  expect(new Uint8Array(await code.arrayBuffer())).toEqual(bytes);
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

test('deletes a custom template through its project scope', async () => {
  const fetchMock = jest.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 202 }));
  globalThis.fetch = fetchMock;
  const result = await client().sandboxes.deleteTemplate(projectId, templateId);
  expect(result.error).toBeNull();
  expect(firstCall(fetchMock.mock.calls)[0]).toBe(`https://api.test.com/projects/${projectId}/sandboxes/${templateId}`);
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
  expectInstanceOf(body, FormData);
  expect(body.has('memory_mb')).toBe(false);
  expect(body.has('ports')).toBe(false);
  const boundary = await sdk.sandboxes.deploy(projectId, templateId, new Uint8Array(), {
    name: 'ports',
    ports: [1, 65532],
    memoryMB: 1024,
  });
  expect(boundary.error).toBeNull();
});

test.each([0, -1, 65533, 65534, 65535, 65536, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
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
      error: new RangeError('Sandbox ports must be between 1 and 65532'),
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

test.each([
  {
    ports: Array.from({ length: 17 }, (_, index) => index + 1),
    message: 'Sandbox templates support at most 16 ports',
  },
  { ports: [8080, 8080], message: 'Sandbox template ports must be unique' },
])('rejects invalid template port sets before upload: $message', async ({ ports, message }) => {
  const fetchMock = jest.fn<typeof fetch>();
  globalThis.fetch = fetchMock;
  const outcome = await client().sandboxes.deploy(projectId, templateId, new Uint8Array(), {
    name: 'app',
    ports,
  });
  expect(outcome).toEqual({ data: null, error: new RangeError(message) });
  expect(fetchMock).not.toHaveBeenCalled();
});

test('accepts sixteen unique template ports', async () => {
  const fetchMock = jest.fn<typeof fetch>().mockResolvedValue(Response.json(deployment));
  globalThis.fetch = fetchMock;
  const ports = Array.from({ length: 16 }, (_, index) => index + 1);
  const outcome = await client().sandboxes.deploy(projectId, templateId, new Uint8Array(), {
    name: 'app',
    ports,
  });
  expect(outcome.error).toBeNull();
  const body = firstCall(fetchMock.mock.calls)[1]?.body;
  expectInstanceOf(body, FormData);
  expect(body.get('ports')).toBe(JSON.stringify(ports));
});
