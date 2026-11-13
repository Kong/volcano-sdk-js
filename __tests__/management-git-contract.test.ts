/** @jest-environment ./__tests__/node-environment.cjs */
import { afterEach, expect, jest, test } from '@jest/globals';
import { ManagementClient } from '../src/index.ts';

const originalFetch = globalThis.fetch;
const projectId = '2b248570-5d83-43ae-b751-90b3f420e755';
const repositoryId = 'e7fc4fbf-5bfc-4971-868d-2ea49b712ae4';
const repository = {
  id: repositoryId,
  project_id: projectId,
  name: `repository-${repositoryId}`,
  provider: 'future-provider',
  created_at: '2026-11-13T00:00:00Z',
  binding: { root_directory: '', production_branch: null },
  capabilities: [{ operation: 'future-operation', available: false, unavailable_reason: 'future-reason' }],
};
const revision = {
  id: 'future-version:opaque-context',
  project_id: projectId,
  resource: { type: 'repository', id: repositoryId, name: repository.name },
  commit_oid: 'c'.repeat(40),
  tree_oid: 'd'.repeat(40),
};

afterEach(() => {
  globalThis.fetch = originalFetch;
  jest.restoreAllMocks();
});

function requestURL(mock: jest.Mock<typeof fetch>, index = 0): URL {
  const input = mock.mock.calls[index]?.[0];
  if (typeof input !== 'string') {
    throw new TypeError('Expected a URL string');
  }
  return new URL(input);
}

test('repository metadata uses owned names and preserves unknown capability values and nulls', async () => {
  const fetchMock = jest.fn<typeof fetch>().mockResolvedValue(Response.json(repository));
  globalThis.fetch = fetchMock;
  const result = await new ManagementClient({ token: 'management-token' }).git.repositories.get(repositoryId, {
    projectId,
  });
  expect(result).toEqual({
    error: null,
    data: {
      id: repositoryId,
      projectId,
      name: repository.name,
      provider: 'future-provider',
      createdAt: repository.created_at,
      binding: { rootDirectory: '', productionBranch: null },
      capabilities: [{ operation: 'future-operation', available: false, unavailableReason: 'future-reason' }],
    },
  });
  expect(requestURL(fetchMock).searchParams.get('project_id')).toBe(projectId);
});

test('repository pages map cursors and retained identities without inventing a binding', async () => {
  const fetchMock = jest.fn<typeof fetch>().mockResolvedValue(
    Response.json({
      data: [{ ...repository, binding: null }],
      limit: 3,
      has_more: true,
      next_cursor: 'next/日本語%?',
      prev_cursor: 'previous',
    }),
  );
  globalThis.fetch = fetchMock;
  const result = await new ManagementClient({ token: 'management-token' }).git.repositories.list(projectId, {
    limit: 3,
    cursor: 'after/日本語%?',
  });
  expect(result.error).toBeNull();
  expect(result.data).toMatchObject({ limit: 3, hasMore: true, nextCursor: 'next/日本語%?', prevCursor: 'previous' });
  expect(result.data?.repositories[0]?.binding).toBeNull();
  expect(result.data).not.toHaveProperty('data');
  const url = requestURL(fetchMock);
  expect(url.pathname).toBe('/git/repositories');
  expect(url.searchParams.get('cursor')).toBe('after/日本語%?');
  expect(url.searchParams.get('limit')).toBe('3');
});

test('reverse pages send ending_before and preserve absent cursors', async () => {
  const fetchMock = jest.fn<typeof fetch>().mockResolvedValue(Response.json({ data: [], limit: 2, has_more: false }));
  globalThis.fetch = fetchMock;
  const result = await new ManagementClient({ token: 'management-token' }).git.repositories.list(projectId, {
    endingBefore: 'before',
    limit: 2,
  });
  expect(result.data).toEqual({ repositories: [], limit: 2, hasMore: false });
  expect(requestURL(fetchMock).searchParams.get('ending_before')).toBe('before');
});

test.each(['https://api.example.com/control', 'https://api.example.com/control/'])(
  'opaque context is one encoded segment under base %s',
  async (apiUrl) => {
    const context = 'future/日本語?x=%#fragment';
    const fetchMock = jest.fn<typeof fetch>().mockResolvedValue(Response.json({ ...revision, id: context }));
    globalThis.fetch = fetchMock;
    const result = await new ManagementClient({ token: 'management-token', apiUrl }).git.revisions.get(context, {
      projectId,
    });
    expect(result.data).toEqual({
      id: context,
      projectId,
      resource: revision.resource,
      commitOid: revision.commit_oid,
      treeOid: revision.tree_oid,
    });
    const url = requestURL(fetchMock);
    expect(url.pathname).toBe(`/control/git/revisions/${encodeURIComponent(context)}`);
    expect(url.hash).toBe('');
    expect(url.searchParams.get('project_id')).toBe(projectId);
  },
);

test.each(['.', '..', ''])('invalid opaque segment %j never sends a request', async (context) => {
  const fetchMock = jest.fn<typeof fetch>();
  globalThis.fetch = fetchMock;
  const result = await new ManagementClient({ token: 'management-token' }).git.revisions.get(context);
  expect(result.error).toBeInstanceOf(Error);
  expect(fetchMock).not.toHaveBeenCalled();
});

test.each(['branch', 'tag'] as const)(
  'exact %s selection keeps slash and Unicode names with no witness',
  async (type) => {
    const fetchMock = jest.fn<typeof fetch>().mockResolvedValue(Response.json(revision));
    globalThis.fetch = fetchMock;
    const result = await new ManagementClient({ token: 'management-token' }).git.revisions.resolve(
      projectId,
      repositoryId,
      { type, name: 'release/日本語%?#' },
    );
    expect(result.error).toBeNull();
    const url = requestURL(fetchMock);
    expect(url.searchParams.get('selector_type')).toBe(type);
    expect(url.searchParams.get('selector')).toBe('release/日本語%?#');
    expect(url.searchParams.has('witness_ref')).toBe(false);
  },
);

test.each([
  { type: 'commit', oid: 'c'.repeat(40) },
  { type: 'commit', oid: 'short', witness: { type: 'branch', name: 'main' } },
  { type: 'commit', oid: '0'.repeat(40), witness: { type: 'branch', name: 'main' } },
  { type: 'branch', name: 'main', witness: { type: 'tag', name: 'v1' } },
  { type: 'tag', name: 'v1', witness: undefined },
  { type: 'future', name: 'main' },
])('invalid runtime selection %j fails before network I/O', async (selector) => {
  const fetchMock = jest.fn<typeof fetch>();
  globalThis.fetch = fetchMock;
  const result = await new ManagementClient({ token: 'management-token' }).git.revisions.resolve(
    projectId,
    repositoryId,
    // @ts-expect-error Runtime callers can bypass the public tagged selector type.
    selector,
  );
  expect(result.error).toBeInstanceOf(Error);
  expect(fetchMock).not.toHaveBeenCalled();
});

test.each([
  { ...repository, provider: undefined },
  { ...repository, binding: undefined },
  { ...repository, capabilities: [{ operation: 'resolve_revision', available: 'yes', unavailable_reason: null }] },
])('malformed required response fields do not become successful metadata', async (response) => {
  globalThis.fetch = jest.fn<typeof fetch>().mockResolvedValue(Response.json(response));
  const result = await new ManagementClient({ token: 'management-token' }).git.repositories.get(repositoryId);
  expect(result.data).toBeNull();
  expect(result.error).toBeInstanceOf(Error);
});
