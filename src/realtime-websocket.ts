type WebSocketConstructor = new (...args: never[]) => unknown;

let webSocketConstructor: WebSocketConstructor | undefined;

function isConstructor(value: unknown): value is WebSocketConstructor {
  return typeof value === 'function' && Object.hasOwn(value, 'prototype');
}

function isModule(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** Accept ws's ESM default, named export, or CommonJS constructor. */
export function webSocketFrom(loaded: unknown): WebSocketConstructor {
  const candidate = isModule(loaded)
    ? (loaded['default'] ?? loaded['WebSocket'] ?? loaded)
    : loaded;
  if (!isConstructor(candidate)) {
    throw new TypeError('ws does not export a WebSocket constructor');
  }
  return candidate;
}

/** Use the browser WebSocket or load the required Node.js dependency on demand. */
export async function loadWebSocket(): Promise<WebSocketConstructor> {
  if (webSocketConstructor !== undefined) {
    return webSocketConstructor;
  }
  if (typeof window !== 'undefined' && typeof window.WebSocket === 'function') {
    webSocketConstructor = window.WebSocket;
    return webSocketConstructor;
  }
  let loaded: unknown;
  try {
    loaded = await import('ws');
  } catch {
    throw new Error(
      'Unable to load a WebSocket implementation. In Node.js, reinstall @volcano.dev/sdk or pass a custom webSocket implementation.',
    );
  }
  webSocketConstructor = webSocketFrom(loaded);
  return webSocketConstructor;
}
