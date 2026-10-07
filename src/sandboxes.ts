import {
  createSandboxSession,
  executeSandbox,
  getSandboxSession,
  grantSandboxSession,
  listSandboxPresets,
  revokeSandboxSession,
} from './generated/client.ts';
import type {
  SandboxBuildLogOptions,
  SandboxCreateOptions,
  SandboxDeploymentListOptions,
  SandboxDeployOptions,
  Sandboxes,
  SandboxExecOptions,
  SandboxRequestOptions,
} from './index.ts';
import { deploy, deployment, deployments, logs, source } from './sandbox-deployments.ts';
import {
  commandRequest,
  executionRequestOptions,
  pathId,
  requestOptions,
  responseData,
  type SandboxClient,
  sandboxResult,
} from './sandbox-request.ts';
import { SandboxSessionHandle } from './sandbox-session.ts';
import { createRequest, executionResult, presetsResult, sessionRequest } from './sandbox-wire.ts';

export class SandboxesApi implements Sandboxes {
  constructor(private readonly client: SandboxClient) {}
  logs(
    projectId: string,
    sandboxId: string,
    deploymentId: string,
    options: SandboxBuildLogOptions,
  ): ReturnType<Sandboxes['logs']> {
    return logs(this.client, projectId, sandboxId, deploymentId, options);
  }
  deploy(
    projectId: string,
    sandboxId: string,
    archive: Uint8Array,
    options: SandboxDeployOptions,
  ): ReturnType<Sandboxes['deploy']> {
    return deploy(this.client, projectId, sandboxId, archive, options);
  }
  deployments(
    projectId: string,
    sandboxId: string,
    options: SandboxDeploymentListOptions = {},
  ): ReturnType<Sandboxes['deployments']> {
    return deployments(this.client, projectId, sandboxId, options);
  }
  deployment(
    projectId: string,
    sandboxId: string,
    deploymentId: string,
    options: SandboxRequestOptions = {},
  ): ReturnType<Sandboxes['deployment']> {
    return deployment(this.client, projectId, sandboxId, deploymentId, options);
  }
  source(
    projectId: string,
    sandboxId: string,
    deploymentId: string,
    options: SandboxRequestOptions = {},
  ): ReturnType<Sandboxes['source']> {
    return source(this.client, projectId, sandboxId, deploymentId, options);
  }
  presets(options: SandboxRequestOptions = {}): ReturnType<Sandboxes['presets']> {
    return sandboxResult(async () =>
      presetsResult(
        await responseData(listSandboxPresets(requestOptions(this.client, options, 'anon'))),
      ),
    );
  }
  exec(
    projectId: string,
    command: string,
    options: SandboxExecOptions,
  ): ReturnType<Sandboxes['exec']> {
    return sandboxResult(async () => {
      await this.client._completeOAuthExchange();
      const response = await executeSandbox(
        pathId(projectId),
        { ...createRequest(options), ...commandRequest(command, options) },
        executionRequestOptions(this.client, options),
      );
      return executionResult(response.data);
    });
  }
  create(projectId: string, options: SandboxCreateOptions): ReturnType<Sandboxes['create']> {
    return sandboxResult(async () => {
      await this.client._completeOAuthExchange();
      const body = sessionRequest(options);
      const response = await createSandboxSession(
        pathId(projectId),
        body,
        requestOptions(this.client, options, 'replayable'),
      );
      return new SandboxSessionHandle(this.client, response.data);
    });
  }
  get(sessionId: string, options: SandboxRequestOptions = {}): ReturnType<Sandboxes['get']> {
    return sandboxResult(
      async () =>
        new SandboxSessionHandle(
          this.client,
          await responseData(
            getSandboxSession(pathId(sessionId), requestOptions(this.client, options)),
          ),
        ),
    );
  }
  grant(
    sessionId: string,
    authUserId: string,
    expiresAt: string,
    options: SandboxRequestOptions = {},
  ): ReturnType<Sandboxes['grant']> {
    return sandboxResult(async () => {
      await grantSandboxSession(
        pathId(sessionId),
        pathId(authUserId),
        { expires_at: expiresAt },
        requestOptions(this.client, options),
      );
    });
  }
  revoke(
    sessionId: string,
    authUserId: string,
    options: SandboxRequestOptions = {},
  ): ReturnType<Sandboxes['revoke']> {
    return sandboxResult(async () => {
      await revokeSandboxSession(
        pathId(sessionId),
        pathId(authUserId),
        requestOptions(this.client, options),
      );
    });
  }
}
