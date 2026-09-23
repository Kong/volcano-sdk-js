import { describe, expect, test } from '@jest/globals';
import { loadWebSocket, webSocketFrom } from '../src/realtime-websocket.ts';

class FakeWebSocket {
  readonly name = 'fixture';
}

describe('WebSocket dependency boundary', () => {
  test('accepts ESM, named, and CommonJS constructors', () => {
    expect(webSocketFrom({ default: FakeWebSocket })).toBe(FakeWebSocket);
    expect(webSocketFrom({ WebSocket: FakeWebSocket })).toBe(FakeWebSocket);
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
    expect(await loadWebSocket()).toBe(first);
  });
});
