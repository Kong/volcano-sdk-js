import { loadCentrifuge } from './realtime-centrifuge.ts';
import type { VolcanoRealtime } from './realtime-client.ts';
import {
  attachConnectionHandlers,
  connectionOptions,
  detachConnectionHandlers,
  waitForConnection,
} from './realtime-connection.ts';
import type { ClientHandlers, TransportClient } from './realtime-internal-types.ts';
import { connectContext, disconnectContext, errorContext } from './realtime-values.ts';
import { loadWebSocket } from './realtime-websocket.ts';

/** @internal */
export function isTransportClient(value: unknown): value is TransportClient {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  return [
    'connect',
    'disconnect',
    'on',
    'off',
    'newSubscription',
    'getSubscription',
    'removeSubscription',
    'presence',
  ].every((method) => typeof Reflect.get(value, method) === 'function');
}

function clientHandlers(realtime: VolcanoRealtime): ClientHandlers {
  return {
    connected: (ctx) => {
      realtime._connected = true;
      realtime._onConnect.forEach((cb) => {
        cb(connectContext(ctx));
      });
    },
    disconnected: (ctx) => {
      realtime._connected = false;
      realtime._onDisconnect.forEach((cb) => {
        cb(disconnectContext(ctx));
      });
    },
    error: (ctx) => {
      realtime._onError.forEach((cb) => {
        cb(errorContext(ctx));
      });
    },
    publication: (ctx) => {
      realtime._handleServerPublication(ctx);
    },
    join: (ctx) => {
      realtime._handleServerJoin(ctx);
    },
    leave: (ctx) => {
      realtime._handleServerLeave(ctx);
    },
    subscribed: (ctx) => {
      realtime._handleServerSubscribed(ctx);
    },
  };
}

export async function connectOnce(realtime: VolcanoRealtime): Promise<void> {
  if (realtime._connected) {
    return;
  }
  if (realtime._connectionPromise !== null) {
    return realtime._connectionPromise;
  }

  realtime._connectionPromise = realtime._doConnect();
  try {
    await realtime._connectionPromise;
  } finally {
    realtime._connectionPromise = null;
  }
}

export async function connectRealtime(realtime: VolcanoRealtime): Promise<void> {
  const CentrifugeClient = await loadCentrifuge();
  const WebSocket = realtime._webSocket ?? (await loadWebSocket());

  const wsUrl = `${realtime.wsUrl}?apikey=${encodeURIComponent(realtime.anonKey)}`;

  const candidate: unknown = Reflect.construct(CentrifugeClient, [
    wsUrl,
    connectionOptions(
      realtime.accessToken,
      realtime.getToken,
      (token) => {
        realtime._adoptAccessToken(token);
      },
      WebSocket,
    ),
  ]);
  if (!isTransportClient(candidate)) {
    throw new TypeError('Realtime transport does not provide the required client methods');
  }
  realtime._client = candidate;

  // Set up event handlers (store references for cleanup)
  realtime._clientHandlers = clientHandlers(realtime);

  attachConnectionHandlers(realtime._client, realtime._clientHandlers);
  return waitForConnection(realtime._client);
}

export function adoptAccessToken(realtime: VolcanoRealtime, token: string): void {
  realtime.accessToken = token;
  realtime._synchronizeRecoveryIdentity();
}

export function disconnectRealtime(realtime: VolcanoRealtime): void {
  // Unsubscribe all channels first to clean up their timers
  for (const channel of realtime._channels.values()) {
    try {
      channel._dispose();
    } catch {
      // Ignore errors during cleanup
    }
  }
  realtime._channels.clear();

  if (realtime._client !== null) {
    // Remove event handlers first to prevent memory leaks
    if (realtime._clientHandlers !== null) {
      detachConnectionHandlers(realtime._client, realtime._clientHandlers);
      realtime._clientHandlers = null;
    }

    // Manually trigger disconnect callbacks
    realtime._onDisconnect.forEach((cb) => {
      cb({ reason: 'manual' });
    });

    // Disconnect the client
    realtime._client.disconnect();
    realtime._client = null;
    realtime._connected = false;
  }
}
