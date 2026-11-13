import { getGitRepository, listGitRepositories } from './generated/client.ts';
import { pageFromWire, projectParameters, repositoryFromWire, uuidParameter } from './management-git-wire.ts';
import type { ManagementTransport } from './management-transport.ts';
import type {
  GitReadOptions,
  GitRepository,
  GitRepositoryListOptions,
  GitRepositoryPage,
  ManagementResult,
} from './management-types.ts';

export class GitRepositories {
  readonly #transport: ManagementTransport;

  constructor(transport: ManagementTransport) {
    this.#transport = transport;
  }

  async list(projectId: string, options: GitRepositoryListOptions = {}): Promise<ManagementResult<GitRepositoryPage>> {
    try {
      if (options.cursor !== undefined && options.endingBefore !== undefined) {
        throw new Error('Choose either cursor or endingBefore');
      }
      if (
        options.limit !== undefined &&
        (!Number.isInteger(options.limit) || options.limit < 1 || options.limit > 100)
      ) {
        throw new Error('Git repository page limit must be an integer from 1 to 100');
      }
      const response = await listGitRepositories(
        {
          project_id: uuidParameter(projectId),
          ...(options.limit === undefined ? {} : { limit: options.limit }),
          ...(options.cursor === undefined ? {} : { cursor: options.cursor }),
          ...(options.endingBefore === undefined ? {} : { ending_before: options.endingBefore }),
        },
        this.#transport.options(options),
      );
      if (response.status !== 200) {
        throw new Error('Unexpected Git repository list response');
      }
      return { data: pageFromWire(response.data), error: null };
    } catch (error) {
      return { data: null, error: this.#transport.safeError(error) };
    }
  }

  async get(repositoryId: string, options: GitReadOptions = {}): Promise<ManagementResult<GitRepository>> {
    try {
      const response = await getGitRepository(
        uuidParameter(repositoryId),
        projectParameters(options),
        this.#transport.options(options),
      );
      if (response.status !== 200) {
        throw new Error('Unexpected Git repository response');
      }
      return { data: repositoryFromWire(response.data), error: null };
    } catch (error) {
      return { data: null, error: this.#transport.safeError(error) };
    }
  }
}
