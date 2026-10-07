import type {
  SandboxBuildLogOptions,
  SandboxDeploymentListOptions,
  SandboxDeployOptions,
} from './index.ts';

export function buildConfiguration(options: SandboxDeployOptions): {
  memory_mb?: 1024 | 2048;
  ports?: string;
} {
  return {
    ...(options.memoryMB === undefined ? {} : { memory_mb: options.memoryMB }),
    ...(options.ports === undefined ? {} : { ports: JSON.stringify(options.ports) }),
  };
}
export function cursorOptions(options: SandboxDeploymentListOptions): {
  cursor?: string;
  limit?: number;
} {
  return {
    ...(options.cursor === undefined ? {} : { cursor: options.cursor }),
    ...(options.limit === undefined ? {} : { limit: options.limit }),
  };
}

export function logOptions(options: SandboxBuildLogOptions): {
  region: string;
  cursor?: string;
  limit?: number;
} {
  return {
    region: options.region,
    ...(options.cursor === undefined ? {} : { cursor: options.cursor }),
    ...(options.limit === undefined ? {} : { limit: options.limit }),
  };
}
