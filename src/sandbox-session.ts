import {
  createSandboxSessionAccess,
  executeSandboxSession,
  getSandboxSession,
  readSandboxSessionFile,
  resumeSandboxSession,
  suspendSandboxSession,
  terminateSandboxSession,
  writeSandboxSessionFile,
} from './generated/client.ts';
import type {
  SandboxCommandOptions,
  SandboxRequestOptions,
  SandboxSession,
  SandboxState,
} from './index.js';
import {
  commandRequest,
  pathId,
  requestOptions,
  responseData,
  type SandboxClient,
  sandboxResult,
} from './sandbox-request.ts';
import {
  accessResult,
  commandResult,
  decodeBytes,
  encodeBytes,
  record,
  sessionState,
  text,
} from './sandbox-wire.ts';

export class SandboxSessionHandle implements SandboxSession {
  readonly id: string;
  readonly projectId: string;
  readonly region: string;
  state: SandboxState;
  expiresAt: string;
  readonly files;
  constructor(
    private readonly client: SandboxClient,
    value: unknown,
  ) {
    const data = record(value);
    this.id = text(data['id']);
    this.projectId = text(data['project_id']);
    this.region = text(data['region']);
    this.state = sessionState(data['state']);
    this.expiresAt = text(data['expires_at']);
    this.files = { read: this.read.bind(this), write: this.write.bind(this) };
  }
  private update(value: unknown): this {
    const data = record(value);
    if (data['id'] !== this.id) {
      throw new TypeError('Sandbox session identity changed');
    }
    this.state = sessionState(data['state']);
    this.expiresAt = text(data['expires_at']);
    return this;
  }
  refresh(options: SandboxRequestOptions = {}): ReturnType<SandboxSession['refresh']> {
    return sandboxResult(async () =>
      this.update(
        await responseData(
          getSandboxSession(pathId(this.id), requestOptions(this.client, options)),
        ),
      ),
    );
  }
  exec(command: string, options: SandboxCommandOptions = {}): ReturnType<SandboxSession['exec']> {
    return sandboxResult(async () =>
      commandResult(
        await responseData(
          executeSandboxSession(
            pathId(this.id),
            commandRequest(command, options),
            requestOptions(this.client, options, true),
          ),
        ),
      ),
    );
  }
  suspend(options: SandboxRequestOptions = {}): ReturnType<SandboxSession['suspend']> {
    return sandboxResult(async () =>
      this.update(
        await responseData(
          suspendSandboxSession(pathId(this.id), requestOptions(this.client, options)),
        ),
      ),
    );
  }
  resume(options: SandboxRequestOptions = {}): ReturnType<SandboxSession['resume']> {
    return sandboxResult(async () =>
      this.update(
        await responseData(
          resumeSandboxSession(pathId(this.id), requestOptions(this.client, options)),
        ),
      ),
    );
  }
  terminate(options: SandboxRequestOptions = {}): ReturnType<SandboxSession['terminate']> {
    return sandboxResult(async () =>
      this.update(
        await responseData(
          terminateSandboxSession(pathId(this.id), requestOptions(this.client, options)),
        ),
      ),
    );
  }
  access(port: number, options: SandboxRequestOptions = {}): ReturnType<SandboxSession['access']> {
    return sandboxResult(async () =>
      accessResult(
        await responseData(
          createSandboxSessionAccess(
            pathId(this.id),
            { port },
            requestOptions(this.client, options),
          ),
        ),
      ),
    );
  }
  async [Symbol.asyncDispose](): Promise<void> {
    if (this.state === 'terminated') {
      return;
    }
    const result = await this.terminate();
    if (result.error !== null) {
      throw result.error;
    }
  }
  private read(path: string, options: SandboxRequestOptions = {}) {
    return sandboxResult(async () =>
      decodeBytes(
        await responseData(
          readSandboxSessionFile(pathId(this.id), { path }, requestOptions(this.client, options)),
        ),
      ),
    );
  }
  private write(path: string, data: Uint8Array, options: SandboxRequestOptions = {}) {
    return sandboxResult(async () => {
      await writeSandboxSessionFile(
        pathId(this.id),
        { path, data: encodeBytes(data) },
        requestOptions(this.client, options),
      );
    });
  }
}
