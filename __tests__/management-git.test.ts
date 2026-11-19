/** @jest-environment ./__tests__/node-environment.cjs */
import { afterEach, expect, jest, test } from '@jest/globals';
import { ManagementClient } from '../src/index.ts';

const originalFetch = globalThis.fetch;
const projectId = '2b248570-5d83-43ae-b751-90b3f420e755';
const repositoryId = 'e7fc4fbf-5bfc-4971-868d-2ea49b712ae4';

afterEach(() => {
  globalThis.fetch = originalFetch;
  jest.restoreAllMocks();
});

function requestURL(input: unknown): URL {
  if (typeof input !== 'string') {
    throw new TypeError('Expected a URL string');
  }
  return new URL(input);
}

test('management construction requires an explicit token and performs no bootstrap', () => {
  const fetchMock = jest.fn<typeof fetch>();
  globalThis.fetch = fetchMock;
  const client = new ManagementClient({ token: 'explicit-control-plane-token' });
  expect(fetchMock).not.toHaveBeenCalled();
  expect(JSON.stringify(client)).not.toContain('explicit-control-plane-token');
  expect(() => new ManagementClient({ token: '' })).toThrow(/token|required/iu);
});

test('commit resolution sends the selected commit and exact witness using only its management credential', async () => {
  const commitOid = 'cccccccccccccccccccccccccccccccccccccccc';
  const fetchMock = jest.fn<typeof fetch>().mockResolvedValue(
    Response.json({
      id: 'future-version:opaque-context',
      project_id: projectId,
      resource: { type: 'repository', id: repositoryId, name: `repository-${repositoryId}` },
      commit_oid: commitOid,
      tree_oid: 'dddddddddddddddddddddddddddddddddddddddd',
    }),
  );
  globalThis.fetch = fetchMock;
  const client = new ManagementClient({ token: 'explicit-control-plane-token', apiUrl: 'https://api.example.com' });
  const result = await client.git.revisions.resolve(projectId, repositoryId, {
    type: 'commit',
    oid: commitOid,
    witness: { type: 'branch', name: 'release/日本語' },
  });
  expect(result.error).toBeNull();
  expect(result.data).not.toBeNull();
  expect(fetchMock).toHaveBeenCalledTimes(1);
  const call = fetchMock.mock.calls[0];
  const url = requestURL(call?.[0]);
  expect(url.origin).toBe('https://api.example.com');
  expect(url.pathname).toBe('/git/revisions');
  expect(url.searchParams.get('project_id')).toBe(projectId);
  expect(url.searchParams.get('repository_id')).toBe(repositoryId);
  expect(url.searchParams.get('selector_type')).toBe('commit');
  expect(url.searchParams.get('selector')).toBe(commitOid);
  expect(url.searchParams.get('witness_ref')).toBe('refs/heads/release/日本語');
  expect(new Headers(call?.[1]?.headers).get('Authorization')).toBe('Bearer explicit-control-plane-token');
  expect(call?.[1]?.redirect).toBe('error');
  expect(call?.[1]?.credentials).toBe('omit');
});

test('a rejected management credential never falls back to app authentication', async () => {
  const fetchMock = jest
    .fn<typeof fetch>()
    .mockResolvedValue(Response.json({ error: 'Unauthorized' }, { status: 401 }));
  globalThis.fetch = fetchMock;
  const client = new ManagementClient({ token: 'explicit-control-plane-token' });
  const result = await client.git.repositories.get(repositoryId);
  expect(result.data).toBeNull();
  expect(result.error).toMatchObject({ status: 401 });
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(fetchMock.mock.calls[0]?.[0]).toBe(`https://api.volcano.dev/git/repositories/${repositoryId}`);
});
