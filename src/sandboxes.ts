import {
  createSandboxSession,
  executeSandbox,
  getSandboxSession,
  grantSandboxSession,
  listSandboxPresets,
  revokeSandboxSession,
} from './generated/client.ts';
import type {
  SandboxCreateOptions,
  Sandboxes,
  SandboxExecOptions,
  SandboxRequestOptions,
} from './index.js';
import {
  commandRequest,
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
  presets(options: SandboxRequestOptions = {}): ReturnType<Sandboxes['presets']> {
    return sandboxResult(async () =>
      presetsResult(await responseData(listSandboxPresets(requestOptions(this.client, options)))),
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
        requestOptions(this.client, options, true),
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
        requestOptions(this.client, options, true),
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
