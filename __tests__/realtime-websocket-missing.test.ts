/** @jest-environment ./__tests__/node-environment.cjs */

import { expect, jest, test } from '@jest/globals';
import { loadWebSocket } from '../src/realtime-websocket.ts';

jest.mock('ws', () => {
  throw new Error('missing dependency');
});

test('explains a missing Node.js WebSocket dependency', async () => {
  await expect(loadWebSocket()).rejects.toThrow('Unable to load a WebSocket implementation');
});
