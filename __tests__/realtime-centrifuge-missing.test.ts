import { expect, jest, test } from '@jest/globals';
import { loadCentrifuge } from '../src/realtime-centrifuge.ts';

jest.mock('centrifuge', () => {
  throw new Error('missing dependency');
});

test('explains a missing realtime dependency on connection', async () => {
  await expect(loadCentrifuge()).rejects.toThrow('Unable to load the SDK realtime dependency');
});
