import type { JsonValue } from './sdk-public-types-json.ts';

// ============================================================================
// Logs Types
// ============================================================================

export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';
export type LogResourceType = 'function' | 'frontend' | 'database';

export interface LogDeploymentSelector {
  ids?: string[];
}

export type LogRequestResource =
  | {
      type: 'function';
      ids?: string[];
      deployments?: LogDeploymentSelector;
    }
  | {
      type: 'frontend';
      ids?: string[];
      deployments?: LogDeploymentSelector;
    }
  | {
      type: 'database';
      ids?: string[];
    };

export interface LogSearchRequest {
  resource: LogRequestResource;
  q?: string;
  levels?: LogLevel[];
  regions?: string[];
  start_time?: string;
  end_time?: string;
  limit?: number;
  cursor?: string;
}

export interface LogActivityRequest {
  resource: LogRequestResource;
  q?: string;
  levels?: LogLevel[];
  regions?: string[];
  start_time?: string;
  end_time?: string;
  bucket_count?: number;
}

export interface LogResource {
  type: LogResourceType;
  id: string;
  name?: string;
}

export interface LogDeployment {
  id: string;
  stage?: string;
}

export interface LogSearchEvent {
  id: string;
  timestamp: string;
  level?: LogLevel;
  /**
   * Application log value. JSON arguments keep their JSON type, so a structured
   * log arrives as an object or array rather than a serialized string.
   */
  body: JsonValue;
  region?: string;
  resource: LogResource;
  deployment?: LogDeployment;
  invocation_id?: string;
}

export interface LogSearchResponse {
  data: LogSearchEvent[];
  limit: number;
  has_more: boolean;
  next_cursor?: string;
}

export interface LogActivityBucket {
  start_time: string;
  end_time: string;
  counts: {
    levels: Record<string, number>;
    regions: Record<string, number>;
    resource_ids: Record<string, number>;
  };
  total: number;
}

export interface LogActivityResponse {
  data: LogActivityBucket[];
  total: number;
}

export interface LogsResponse<T> {
  data: T | null;
  error: Error | null;
}

export interface Logs {
  /** Search project logs. Time fields must be ISO 8601/RFC3339 date-time strings. */
  search(projectId: string, request: LogSearchRequest): Promise<LogsResponse<LogSearchResponse>>;
  /** Fetch bucketed project log activity. Time fields must be ISO 8601/RFC3339 date-time strings. */
  activity(projectId: string, request: LogActivityRequest): Promise<LogsResponse<LogActivityResponse>>;
}
