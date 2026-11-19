import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  type MutantTiming,
  mutationTimingDirectory,
  mutationTimingSummary,
  parseMutantTimings,
  projectRootVariable,
  readMutantTimings,
  slowMutantMs,
  timingCosts,
} from './mutation-timing.mts';
import { strykerPlugins, type TestRunner, TimedTestRunner } from './mutation-timing-runner.mts';

function withDirectory(run: (directory: string) => Promise<void> | void): Promise<void> | void {
  const directory = mkdtempSync(join(tmpdir(), 'volcano-mutation-timing-'));
  const cleanup = (): void => {
    rmSync(directory, { recursive: true, force: true });
  };
  return Promise.resolve(run(directory)).finally(cleanup);
}

function timing(file: string, line: number, ms: number, status = 'killed'): MutantTiming {
  return { file, line, mutator: 'ConditionalExpression', ms, tests: 12, status };
}

await test('worker timing lines parse and reject incomplete records', () => {
  const text = `${JSON.stringify(timing('src/a.ts', 3, 1500))}\n\n${JSON.stringify(timing('src/b.ts', 8, 20))}\n`;
  assert.deepEqual(parseMutantTimings(text, 'worker.jsonl'), [timing('src/a.ts', 3, 1500), timing('src/b.ts', 8, 20)]);
  for (const line of [
    '[]',
    '{"file":"src/a.ts","line":1,"mutator":"x","ms":1,"tests":1}',
    '{"file":"src/a.ts","line":1.5,"mutator":"x","ms":1,"tests":1,"status":"killed"}',
    '{"file":"src/a.ts","line":1,"mutator":"x","ms":"1","tests":1,"status":"killed"}',
    '{"file":"src/a.ts","line":1,"mutator":"x","ms":1,"tests":0.5,"status":"killed"}',
  ]) {
    assert.throws(() => parseMutantTimings(line, 'worker.jsonl'), /worker\.jsonl:1: /u);
  }
});

await test('timings add up by file and line', () => {
  const costs = timingCosts([timing('src/a.ts', 3, 10), timing('src/a.ts', 3, 5), timing('src/b.ts', 1, 7)]);
  assert.deepEqual(
    [...costs.entries()].map(([file, lines]) => [file, [...lines.entries()]]),
    [
      ['src/a.ts', [[3, 15]]],
      ['src/b.ts', [[1, 7]]],
    ],
  );
});

await test('the summary lists the slowest mutants and costliest files', () => {
  assert.equal(mutationTimingSummary([]), 'Mutation timing: no mutants ran.\n');
  const summary = mutationTimingSummary(
    [timing('src/a.ts', 3, 60_000), timing('src/b.ts', 9, 90_000, 'timeout'), timing('src/a.ts', 4, 45_000)],
    2,
  );
  assert.equal(
    summary,
    [
      'Mutation timing: 3 mutants, 3.3 worker-minutes.',
      'Slowest mutants:',
      '  src/b.ts:9 ConditionalExpression 90.0s, 12 tests, timeout',
      '  src/a.ts:3 ConditionalExpression 60.0s, 12 tests, killed',
      'Costliest files:',
      '  src/a.ts 1.8 worker-minutes, 2 mutants',
      '  src/b.ts 1.5 worker-minutes, 1 mutants',
      '',
    ].join('\n'),
  );
});

await test('worker timing files are read from the timing directory only', async () => {
  await withDirectory((directory) => {
    assert.deepEqual(readMutantTimings(join(directory, 'missing')), []);
    writeFileSync(join(directory, '2.jsonl'), `${JSON.stringify(timing('src/b.ts', 1, 2))}\n`);
    writeFileSync(join(directory, '1.jsonl'), `${JSON.stringify(timing('src/a.ts', 1, 1))}\n`);
    writeFileSync(join(directory, 'notes.txt'), 'ignored');
    assert.deepEqual(readMutantTimings(directory), [timing('src/a.ts', 1, 1), timing('src/b.ts', 1, 2)]);
  });
});

function recorder(messages: string[]): { info: (message: string) => void } {
  return {
    info: (message) => {
      messages.push(message);
    },
  };
}

interface FakeRunner extends TestRunner {
  calls: string[];
}

function fakeRunner(status: string, nrOfTests: number | undefined): FakeRunner {
  const calls: string[] = [];
  return {
    calls,
    capabilities: () => ({ reloadEnvironment: true }),
    init: async () => {
      calls.push('init');
      await Promise.resolve();
    },
    dryRun: async (options) => {
      calls.push('dryRun');
      await Promise.resolve();
      return { options };
    },
    mutantRun: async () => {
      calls.push('mutantRun');
      await Promise.resolve();
      return nrOfTests === undefined ? { status } : { status, nrOfTests };
    },
    dispose: async () => {
      calls.push('dispose');
      await Promise.resolve();
    },
  };
}

function mutantOptions(fileName: string, line: number): Parameters<TestRunner['mutantRun']>[0] {
  return { activeMutant: { fileName, mutatorName: 'StringLiteral', location: { start: { line } } } };
}

await test('the timing runner records each mutant run and logs slow ones', async () => {
  await withDirectory(async (directory) => {
    const logged: string[] = [];
    const inner = fakeRunner('killed', 40);
    const clock = [0, 1200, 5000, 5000 + slowMutantMs];
    let tick = 0;
    const runner = new TimedTestRunner(inner, recorder(logged), directory, () => Number(clock[tick++]));
    assert.deepEqual(runner.capabilities(), { reloadEnvironment: true });
    await runner.init();
    assert.deepEqual(await runner.dryRun({ timeout: 1 }), { options: { timeout: 1 } });
    assert.deepEqual(await runner.mutantRun(mutantOptions(join(directory, 'src', 'a.ts'), 6)), {
      status: 'killed',
      nrOfTests: 40,
    });
    await runner.mutantRun(mutantOptions('src/b.ts', 0));
    await runner.dispose();
    assert.deepEqual(inner.calls, ['init', 'dryRun', 'mutantRun', 'mutantRun', 'dispose']);
    const files = readMutantTimings(join(directory, mutationTimingDirectory));
    assert.deepEqual(files, [
      { file: 'src/a.ts', line: 7, mutator: 'StringLiteral', ms: 1200, tests: 40, status: 'killed' },
      { file: 'src/b.ts', line: 1, mutator: 'StringLiteral', ms: slowMutantMs, tests: 40, status: 'killed' },
    ]);
    assert.deepEqual(logged, ['Slow mutant src/b.ts:1 StringLiteral 30.0s, 40 tests, killed']);
    assert.match(
      readFileSync(join(directory, mutationTimingDirectory, `${String(process.pid)}.jsonl`), 'utf8'),
      /\n$/u,
    );
  });
});

await test('without a project root the timing runner only logs', async () => {
  await withDirectory(async (directory) => {
    const logged: string[] = [];
    const inner: TestRunner = {
      capabilities: () => ({}),
      dryRun: async () => {
        await Promise.resolve();
        return {};
      },
      mutantRun: async () => {
        await Promise.resolve();
        return { status: 'error' };
      },
    };
    const clock = [0, slowMutantMs * 2];
    let tick = 0;
    const runner = new TimedTestRunner(inner, recorder(logged), undefined, () => Number(clock[tick++]));
    await runner.init();
    await runner.mutantRun(mutantOptions(join(process.cwd(), 'src', 'c.ts'), 2));
    await runner.dispose();
    assert.deepEqual(logged, ['Slow mutant src/c.ts:3 StringLiteral 60.0s, 0 tests, error']);
    mkdirSync(join(directory, 'empty'));
    assert.deepEqual(readMutantTimings(join(directory, 'empty')), []);
  });
});

await test('the timed-jest plugin wraps the runner Stryker injects', () => {
  const [plugin] = strykerPlugins;
  assert.equal(plugin.kind, 'TestRunner');
  assert.equal(plugin.name, 'timed-jest');
  assert.deepEqual(plugin.factory.inject, ['$injector', 'logger']);
  const inner = fakeRunner('killed', 1);
  const injected: unknown[] = [];
  const log = recorder([]);
  const runner = plugin.factory(
    {
      injectFunction: (factory) => {
        injected.push(factory);
        return inner;
      },
    },
    log,
  );
  assert.ok(runner instanceof TimedTestRunner);
  assert.equal(typeof injected[0], 'function');
  assert.throws(() => plugin.factory({ injectFunction: () => ({}) }, log), /did not create a test runner/u);
  assert.equal(projectRootVariable, 'MUTATION_TIMING_ROOT');
});
