import type { GitRepositoryPage, GitRevisionSelector, ManagementClient, ManagementResult } from '../../src/index.ts';

export const commitSelector: GitRevisionSelector = {
  type: 'commit',
  oid: 'c'.repeat(40),
  witness: { type: 'branch', name: 'release/日本語' },
};
export const branchSelector: GitRevisionSelector = { type: 'branch', name: 'main' };
// @ts-expect-error Commit selection requires a witness.
export const missingWitness: GitRevisionSelector = { type: 'commit', oid: 'c'.repeat(40) };
export const unexpectedWitness: GitRevisionSelector = {
  type: 'tag',
  name: 'v1',
  // @ts-expect-error A branch/tag selector cannot supply a witness.
  witness: { type: 'branch', name: 'main' },
};
declare const client: ManagementClient;
export const repositories: Promise<ManagementResult<GitRepositoryPage>> = client.git.repositories.list('project-id', {
  limit: 20,
});
declare const page: GitRepositoryPage;
export const nextCursor: string | undefined = page.nextCursor;
export const binding: { rootDirectory: string; productionBranch: string | null } | null | undefined =
  page.repositories[0]?.binding;
