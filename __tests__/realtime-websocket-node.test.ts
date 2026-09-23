/** @jest-environment node */

import { expect, test } from '@jest/globals';
import { loadWebSocket } from '../src/realtime-websocket.ts';

test('loads and reuses ws in Node.js', async () => {
  const first = await loadWebSocket();
  expect(typeof first).toBe('function');
  expect(await loadWebSocket()).toBe(first);
});
