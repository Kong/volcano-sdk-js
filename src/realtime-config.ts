type NumberSetting = number | null | undefined | false | '';

interface FetchOptions {
  batchWindowMs?: NumberSetting;
  maxBatchSize?: NumberSetting;
  enabled?: boolean;
}

interface ChannelFetchOptions {
  fetchBatchWindowMs?: NumberSetting;
  fetchMaxBatchSize?: NumberSetting;
  autoFetch?: boolean;
}

interface ActiveFetchConfig {
  batchWindowMs: number;
  maxBatchSize: number;
  enabled: boolean;
}

function isConfiguredNumber(value: NumberSetting): value is number {
  return typeof value === 'number' && !Number.isNaN(value) && value !== 0;
}

function numberOrDefault(value: NumberSetting, fallback: number): number {
  return isConfiguredNumber(value) ? value : fallback;
}

export function globalFetchConfig(options?: FetchOptions): ActiveFetchConfig {
  return {
    batchWindowMs: numberOrDefault(options?.batchWindowMs, 20),
    maxBatchSize: numberOrDefault(options?.maxBatchSize, 50),
    enabled: options?.enabled !== false,
  };
}

export function channelFetchConfig(
  parent: ActiveFetchConfig,
  options: ChannelFetchOptions,
): ActiveFetchConfig {
  return {
    batchWindowMs: numberOrDefault(options.fetchBatchWindowMs, parent.batchWindowMs),
    maxBatchSize: numberOrDefault(options.fetchMaxBatchSize, parent.maxBatchSize),
    enabled: options.autoFetch !== false && parent.enabled,
  };
}

export function realtimeWebSocketUrl(apiUrl: string): string {
  const url = new URL(apiUrl);
  const protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${url.host}/realtime/v1/websocket`;
}
