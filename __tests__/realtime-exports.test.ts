import { expect, test } from '@jest/globals';
import RealtimeDefault, { VolcanoRealtime } from '../src/realtime';

test('the realtime default export matches its declared constructor', () => {
  expect(RealtimeDefault).toBe(VolcanoRealtime);
});
