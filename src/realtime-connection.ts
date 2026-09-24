export interface RealtimeConnectionClient {
  connect(): void;
  on(event: string, listener: (context: unknown) => void): void;
  off(event: string, listener: (context: unknown) => void): void;
}

export interface ConnectionEvents {
  connected(context: unknown): void;
  disconnected(context: unknown): void;
  error(context: unknown): void;
  publication(context: unknown): void;
  join(context: unknown): void;
  leave(context: unknown): void;
  subscribed(context: unknown): void;
}

type ConnectionEvent = keyof ConnectionEvents;

export interface ConnectionOptions {
  token: string | undefined;
  getToken: (() => Promise<string>) | undefined;
  debug: false;
  websocket: unknown;
}

export function connectionOptions(
  token: string | undefined,
  getToken: (() => Promise<string>) | undefined,
  adoptToken: (token: string) => void,
  websocket: unknown,
): ConnectionOptions {
  return {
    token,
    getToken:
      getToken === undefined
        ? undefined
        : async () => {
            const refreshed = await getToken();
            adoptToken(refreshed);
            return refreshed;
          },
    debug: false,
    websocket,
  };
}

function connectionEvents(): readonly ConnectionEvent[] {
  return ['connected', 'disconnected', 'error', 'publication', 'join', 'leave', 'subscribed'];
}

export function attachConnectionHandlers(
  client: RealtimeConnectionClient,
  handlers: ConnectionEvents,
): void {
  for (const event of connectionEvents()) {
    client.on(event, handlers[event]);
  }
}

export function detachConnectionHandlers(
  client: RealtimeConnectionClient,
  handlers: ConnectionEvents,
): void {
  for (const event of connectionEvents()) {
    client.off(event, handlers[event]);
  }
}

function objectProperty(value: unknown, property: string): unknown {
  if (typeof value !== 'object' || value === null) {
    return undefined;
  }
  return Reflect.get(value, property);
}

function errorMessage(context: unknown): string | undefined {
  const message = objectProperty(objectProperty(context, 'error'), 'message');
  return typeof message === 'string' && message !== '' ? message : undefined;
}

function connectionError(context: unknown): Error {
  return new Error(errorMessage(context) ?? 'Connection failed');
}

export function waitForConnection(client: RealtimeConnectionClient): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error('Connection timeout'));
    }, 10_000);

    function cleanup(): void {
      clearTimeout(timeout);
      client.off('connected', connected);
      client.off('error', error);
    }

    function connected(): void {
      cleanup();
      resolve();
    }

    function error(context: unknown): void {
      cleanup();
      reject(connectionError(context));
    }

    client.on('connected', connected);
    client.on('error', error);
    let started = false;
    try {
      client.connect();
      started = true;
    } finally {
      if (!started) {
        cleanup();
      }
    }
  });
}
