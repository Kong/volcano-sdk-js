import {
  deploySandbox,
  getSandboxDeployment,
  getSandboxDeploymentLogs,
  getSandboxDeploymentSource,
  listSandboxDeployments,
} from './generated/client.ts';
import type {
  SandboxBuildLogOptions,
  SandboxDeployment,
  SandboxDeploymentListOptions,
  SandboxDeployOptions,
  Sandboxes,
  SandboxRequestOptions,
} from './index.ts';
import {
  pathId,
  requestOptions,
  responseData,
  type SandboxClient,
  sandboxResult,
} from './sandbox-request.ts';
import { record, text } from './sandbox-wire.ts';

function result(value: unknown): SandboxDeployment {
  const data = record(value);
  return {
    id: text(data['id']),
    status: text(data['status']),
    createdAt: text(data['created_at']),
    updatedAt: text(data['updated_at']),
  };
}

export function deploy(
  client: SandboxClient,
  projectId: string,
  sandboxId: string,
  archive: Uint8Array,
  options: SandboxDeployOptions,
): ReturnType<Sandboxes['deploy']> {
  return sandboxResult(async () => {
    validateSource(archive, options.ports ?? []);
    await client._completeOAuthExchange();
    return result(
      await responseData(
        deploySandbox(
          pathId(projectId),
          pathId(sandboxId),
          {
            name: options.name,
            code: new Blob([new Uint8Array(archive)], { type: 'application/gzip' }),
            ...buildConfiguration(options),
          },
          requestOptions(client, options, 'replayable'),
        ),
      ),
    );
  });
}

export function deployments(
  client: SandboxClient,
  projectId: string,
  sandboxId: string,
  options: SandboxDeploymentListOptions,
): ReturnType<Sandboxes['deployments']> {
  return sandboxResult(async () => {
    const data = record(
      await responseData(
        listSandboxDeployments(
          pathId(projectId),
          pathId(sandboxId),
          cursorOptions(options),
          requestOptions(client, options),
        ),
      ),
    );
    return pageResult(data);
  });
}

export function deployment(
  client: SandboxClient,
  projectId: string,
  sandboxId: string,
  deploymentId: string,
  options: SandboxRequestOptions,
): ReturnType<Sandboxes['deployment']> {
  return sandboxResult(async () =>
    result(
      await responseData(
        getSandboxDeployment(
          pathId(projectId),
          pathId(sandboxId),
          pathId(deploymentId),
          requestOptions(client, options),
        ),
      ),
    ),
  );
}

export function source(
  client: SandboxClient,
  projectId: string,
  sandboxId: string,
  deploymentId: string,
  options: SandboxRequestOptions,
): ReturnType<Sandboxes['source']> {
  return sandboxResult(async () => {
    const data = await responseData(
      getSandboxDeploymentSource(pathId(projectId), pathId(sandboxId), pathId(deploymentId), {
        ...requestOptions(client, options),
        volcanoResponseType: 'blob',
      }),
    );
    if (!(data instanceof Blob)) {
      throw new TypeError('Invalid Sandbox source archive');
    }
    return new Uint8Array(await data.arrayBuffer());
  });
}

function validateSource(archive: Uint8Array, ports: number[]): void {
  if (archive.byteLength > 32 * 1024 * 1024) {
    throw new RangeError('Sandbox source archives are limited to 32 MiB');
  }
  for (const port of ports) {
    validatePort(port);
  }
}
function validatePort(port: number): void {
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new RangeError('Sandbox ports must be between 1 and 65535');
  }
}
function buildConfiguration(options: SandboxDeployOptions): {
  memory_mb?: 1024 | 2048;
  ports?: string;
} {
  return {
    ...(options.memoryMB === undefined ? {} : { memory_mb: options.memoryMB }),
    ...(options.ports === undefined ? {} : { ports: JSON.stringify(options.ports) }),
  };
}
function cursorOptions(options: SandboxDeploymentListOptions): { cursor?: string } {
  return options.cursor === undefined ? {} : { cursor: options.cursor };
}
function pageResult(data: Record<string, unknown>): import('./index.ts').SandboxDeploymentPage {
  if (!Array.isArray(data['data'])) {
    throw new TypeError('Invalid Sandbox deployment page');
  }
  const pagination = record(data['pagination']);
  if (typeof pagination['limit'] !== 'number' || typeof pagination['has_more'] !== 'boolean') {
    throw new TypeError('Invalid Sandbox deployment pagination');
  }
  return {
    data: data['data'].map((value: unknown) => result(value)),
    pagination: {
      limit: pagination['limit'],
      hasMore: pagination['has_more'],
      ...(pagination['next_cursor'] === undefined
        ? {}
        : { nextCursor: text(pagination['next_cursor']) }),
    },
  };
}

export function logs(
  client: SandboxClient,
  projectId: string,
  sandboxId: string,
  deploymentId: string,
  options: SandboxBuildLogOptions,
): ReturnType<Sandboxes['logs']> {
  return sandboxResult(async () => {
    const data = record(
      await responseData(
        getSandboxDeploymentLogs(
          pathId(projectId),
          pathId(sandboxId),
          pathId(deploymentId),
          {
            region: options.region,
            ...(options.cursor === undefined ? {} : { cursor: options.cursor }),
            ...(options.limit === undefined ? {} : { limit: options.limit }),
          },
          requestOptions(client, options),
        ),
      ),
    );
    if (!Array.isArray(data['data'])) {
      throw new TypeError('Invalid Sandbox build logs');
    }
    return {
      data: data['data'].map((value: unknown) => logResult(value)),
      ...(data['next_cursor'] === undefined ? {} : { nextCursor: text(data['next_cursor']) }),
    };
  });
}
function logResult(value: unknown): { timestamp: string; message: string } {
  const data = record(value);
  return { timestamp: text(data['timestamp']), message: text(data['message']) };
}
