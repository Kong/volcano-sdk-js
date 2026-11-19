import { GitRepositories } from './management-git-repositories.ts';
import { GitRevisions } from './management-git-revisions.ts';
import { ManagementTransport } from './management-transport.ts';
import type { ManagementClientOptions } from './management-types.ts';

/** Control-plane requests use only this explicit token, with no app session or bootstrap. */
export class ManagementClient {
  readonly git: { repositories: GitRepositories; revisions: GitRevisions };

  constructor(options: ManagementClientOptions) {
    const transport = new ManagementTransport(options);
    this.git = { repositories: new GitRepositories(transport), revisions: new GitRevisions(transport) };
  }
}
