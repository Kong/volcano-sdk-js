import { ManagementClient as EsmManagementClient } from '../../dist/index.esm.mjs';
import { ManagementClient } from '../../dist/index.js';
import type { GitRepositoryPage, GitRevision, ManagementResult } from '../../dist/index.js';

// Both package entry points work with browser libraries and no Node globals.
export const clients = [
  new ManagementClient({ token: 'project-read-token' }),
  new EsmManagementClient({ token: 'project-read-token' }),
];
declare const client: ManagementClient;
export const page: Promise<ManagementResult<GitRepositoryPage>> = client.git.repositories.list('project-id');
export const revision: Promise<ManagementResult<GitRevision>> = client.git.revisions.get(
  'future-version:opaque-context',
);
