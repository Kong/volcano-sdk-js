import { getGitRevision, resolveGitRevision } from './generated/client.ts';
import {
  contextSegment,
  projectParameters,
  revisionFromWire,
  selectorParameters,
  uuidParameter,
} from './management-git-wire.ts';
import type { ManagementTransport } from './management-transport.ts';
import type {
  GitReadOptions,
  GitRequestOptions,
  GitRevision,
  GitRevisionSelector,
  ManagementResult,
} from './management-types.ts';

export class GitRevisions {
  readonly #transport: ManagementTransport;

  constructor(transport: ManagementTransport) {
    this.#transport = transport;
  }

  async resolve(
    projectId: string,
    repositoryId: string,
    selector: GitRevisionSelector,
    options: GitRequestOptions = {},
  ): Promise<ManagementResult<GitRevision>> {
    try {
      const response = await resolveGitRevision(
        {
          project_id: uuidParameter(projectId),
          repository_id: uuidParameter(repositoryId),
          ...selectorParameters(selector),
        },
        this.#transport.options(options),
      );
      if (response.status !== 200) {
        throw new Error('Unexpected Git revision response');
      }
      return { data: revisionFromWire(response.data), error: null };
    } catch (error) {
      return { data: null, error: this.#transport.safeError(error) };
    }
  }

  async get(contextId: string, options: GitReadOptions = {}): Promise<ManagementResult<GitRevision>> {
    try {
      const response = await getGitRevision(
        contextSegment(contextId),
        projectParameters(options),
        this.#transport.options(options),
      );
      if (response.status !== 200) {
        throw new Error('Unexpected Git revision response');
      }
      return { data: revisionFromWire(response.data), error: null };
    } catch (error) {
      return { data: null, error: this.#transport.safeError(error) };
    }
  }
}
