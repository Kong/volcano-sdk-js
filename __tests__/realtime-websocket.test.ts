import { describe, expect, jest, test } from '@jest/globals';
import { loadWebSocket, webSocketFrom } from '../src/realtime-websocket.ts';

class AlternateWebSocket {
  readonly name = 'alternate';
}

class FakeWebSocket {
  static readonly default = AlternateWebSocket;
  readonly name = 'fixture';
}

describe('WebSocket dependency boundary', () => {
  test('accepts ESM, named, and CommonJS constructors', () => {
    expect(webSocketFrom({ default: FakeWebSocket })).toBe(FakeWebSocket);
    expect(webSocketFrom({ WebSocket: FakeWebSocket })).toBe(FakeWebSocket);
    expect(webSocketFrom(FakeWebSocket)).toBe(FakeWebSocket);
  });

  test('does not mistake a constructor with module-like properties for a module', () => {
    expect(webSocketFrom(FakeWebSocket)).toBe(FakeWebSocket);
  });

  test.each([null, {}, { default: true, WebSocket: FakeWebSocket }, { WebSocket: () => 0 }])(
    'rejects malformed dependency exports',
    (loaded: unknown) => {
      expect(() => webSocketFrom(loaded)).toThrow('WebSocket constructor');
    },
  );

  test('prefers and reuses the browser WebSocket', async () => {
    const first = await loadWebSocket();
    expect(first).toBe(window.WebSocket);
    const descriptor = Object.getOwnPropertyDescriptor(window, 'WebSocket');
    Object.defineProperty(window, 'WebSocket', { configurable: true, value: FakeWebSocket });
    try {
      expect(await loadWebSocket()).toBe(first);
    } finally {
      if (descriptor !== undefined) {
        Object.defineProperty(window, 'WebSocket', descriptor);
      }
    }
  });

  test('loads the Node implementation when the browser constructor is absent', async () => {
    const descriptor = Object.getOwnPropertyDescriptor(window, 'WebSocket');
    Object.defineProperty(window, 'WebSocket', { configurable: true, value: null });
    try {
      await jest.isolateModulesAsync(async () => {
        const module = await import('../src/realtime-websocket.ts');
        expect(typeof (await module.loadWebSocket())).toBe('function');
      });
    } finally {
      if (descriptor !== undefined) {
        Object.defineProperty(window, 'WebSocket', descriptor);
      }
    }
  });
});
