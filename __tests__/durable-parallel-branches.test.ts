import { expect, jest, test } from '@jest/globals';
import { parallelBranches } from '../src/durable-parallel-branches.ts';

test('parallel branches require an array', () => {
  expect(() => parallelBranches({}, (context) => context)).toThrow(
    'ctx.parallel() requires an array of branches',
  );
});

test.each<readonly [unknown, string]>([
  [null, 'null'],
  [42, 'number'],
  [{ name: 'missing' }, 'missing run'],
])('rejects a %s branch without a run function', (branch) => {
  expect(() => parallelBranches([branch], (context) => context)).toThrow(
    'a parallel branch is a function, or { name, run }',
  );
});

test('adapts anonymous branches with a durable context', () => {
  const contextFor = jest.fn((context: unknown): object => ({ engineContext: context }));
  const branch = jest.fn((context: unknown): unknown => context);
  const [adapted] = parallelBranches([branch], contextFor);
  if (typeof adapted !== 'function') {
    throw new TypeError('expected an anonymous branch');
  }

  expect(adapted('engine')).toEqual({ engineContext: 'engine' });
  expect(contextFor).toHaveBeenCalledWith('engine');
  expect(branch).toHaveBeenCalledWith({ engineContext: 'engine' });
});

test('adapts named branches while preserving the run receiver', () => {
  const branch = {
    name: 'named',
    marker: 'owner',
    run(this: { marker: string }, context: unknown): object {
      return { marker: this.marker, context };
    },
  };
  const [adapted] = parallelBranches([branch], (context) => ({ engineContext: context }));
  if (adapted === undefined || typeof adapted === 'function') {
    throw new TypeError('expected a named branch');
  }

  expect(adapted.name).toBe('named');
  expect(adapted.func('engine')).toEqual({
    marker: 'owner',
    context: { engineContext: 'engine' },
  });
});
