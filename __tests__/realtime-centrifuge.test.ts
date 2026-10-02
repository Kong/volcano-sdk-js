import { describe, expect, jest, test } from '@jest/globals';
import { centrifugeFrom, loadCentrifuge } from '../src/realtime-centrifuge.ts';

class FakeCentrifuge {
  readonly name = 'fixture';
}

describe('Centrifuge dependency boundary', () => {
  test('accepts named and default constructors', () => {
    expect(centrifugeFrom({ Centrifuge: FakeCentrifuge })).toBe(FakeCentrifuge);
    expect(centrifugeFrom({ default: FakeCentrifuge })).toBe(FakeCentrifuge);
  });

  test.each([
    null,
    'not a module',
    {},
    { Centrifuge: true, default: FakeCentrifuge },
    { Centrifuge: () => 0 },
  ])('rejects malformed dependency exports', (loaded: unknown) => {
    expect(() => centrifugeFrom(loaded)).toThrow('client constructor');
  });

  test('lazily loads and reuses the installed client', async () => {
    const first = await loadCentrifuge();
    expect(typeof first).toBe('function');
    expect(await loadCentrifuge()).toBe(first);
  });

  test('reads the dependency constructor once across repeated loads', async () => {
    let reads = 0;
    jest.doMock('centrifuge', () => ({
      get Centrifuge(): typeof FakeCentrifuge {
        reads += 1;
        return FakeCentrifuge;
      },
    }));
    try {
      await jest.isolateModulesAsync(async () => {
        const { loadCentrifuge: isolatedLoad } = await import('../src/realtime-centrifuge.ts');
        expect(await isolatedLoad()).toBe(FakeCentrifuge);
        expect(await isolatedLoad()).toBe(FakeCentrifuge);
      });
      expect(reads).toBe(1);
    } finally {
      jest.dontMock('centrifuge');
    }
  });
});
