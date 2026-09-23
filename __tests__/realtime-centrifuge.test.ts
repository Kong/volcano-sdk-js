import { describe, expect, test } from '@jest/globals';
import { centrifugeFrom, loadCentrifuge } from '../src/realtime-centrifuge.ts';

class FakeCentrifuge {
  readonly name = 'fixture';
}

describe('Centrifuge dependency boundary', () => {
  test('accepts named and default constructors', () => {
    expect(centrifugeFrom({ Centrifuge: FakeCentrifuge })).toBe(FakeCentrifuge);
    expect(centrifugeFrom({ default: FakeCentrifuge })).toBe(FakeCentrifuge);
  });

  test.each([null, {}, { Centrifuge: true, default: FakeCentrifuge }, { Centrifuge: () => 0 }])(
    'rejects malformed dependency exports',
    (loaded: unknown) => {
      expect(() => centrifugeFrom(loaded)).toThrow('client constructor');
    },
  );

  test('lazily loads and reuses the installed client', async () => {
    const first = await loadCentrifuge();
    expect(typeof first).toBe('function');
    expect(await loadCentrifuge()).toBe(first);
  });
});
