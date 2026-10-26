import type { VolcanoRealtime } from './realtime-client.ts';
import type { ConnectContext, DisconnectContext, ErrorContext, UnsubscribeFunction } from './realtime-public-types.ts';

export function addConnectListener(
  realtime: VolcanoRealtime,
  callback: (context: ConnectContext) => void,
): UnsubscribeFunction {
  realtime._onConnect.push(callback);
  return () => {
    realtime._onConnect = realtime._onConnect.filter((cb) => cb !== callback);
  };
}

export function addDisconnectListener(
  realtime: VolcanoRealtime,
  callback: (context: DisconnectContext) => void,
): UnsubscribeFunction {
  realtime._onDisconnect.push(callback);
  return () => {
    realtime._onDisconnect = realtime._onDisconnect.filter((cb) => cb !== callback);
  };
}

export function addErrorListener(
  realtime: VolcanoRealtime,
  callback: (context: ErrorContext) => void,
): UnsubscribeFunction {
  realtime._onError.push(callback);
  return () => {
    realtime._onError = realtime._onError.filter((cb) => cb !== callback);
  };
}
