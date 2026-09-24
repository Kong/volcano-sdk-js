import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import unit from '../jest.config.js';

const jest = fileURLToPath(new URL('../node_modules/jest/bin/jest.js', import.meta.url));

async function runFixture(source, config) {
  const directory = await mkdtemp(join(tmpdir(), 'volcano-jest-rejections-'));
  try {
    await writeFile(join(directory, 'fixture.test.js'), source);
    const result = spawnSync(
      process.execPath,
      [
        jest,
        '--config',
        JSON.stringify({
          rootDir: directory,
          testEnvironment: 'node',
          reporters: [],
          testMatch: ['<rootDir>/*.test.js'],
          waitForUnhandledRejections: config.waitForUnhandledRejections,
        }),
        '--runInBand',
        '--no-cache',
        '--json',
      ],
      { encoding: 'utf8', timeout: 15_000 },
    );
    assert.equal(result.error, undefined);
    assert.equal(result.signal, null);
    return { ...result, report: JSON.parse(result.stdout) };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

for (const [name, config] of Object.entries({ unit })) {
  test(`${name} attributes an unhandled rejection to the originating test`, async () => {
    const result = await runFixture(
      `
        test('detached rejection', () => {
          Promise.reject(new Error('detached work failed'));
          expect(true).toBe(true);
        });
        test('later test', () => expect(true).toBe(true));
      `,
      config,
    );
    assert.equal(result.status, 1, result.stderr);
    assert.equal(result.report.numFailedTests, 1);
    assert.equal(result.report.numPassedTests, 1);
    assert.equal(result.report.numRuntimeErrorTestSuites, 0);
    const assertions = result.report.testResults.flatMap((suite) => suite.assertionResults);
    assert.deepEqual(
      assertions.map(({ title, status }) => ({ title, status })),
      [
        { title: 'detached rejection', status: 'failed' },
        { title: 'later test', status: 'passed' },
      ],
    );
    assert.match(assertions[0].failureMessages.join('\n'), /detached work failed/);
  });

  test(`${name} accepts a rejection handled on the next event-loop turn`, async () => {
    const result = await runFixture(
      `
        test('handled rejection', async () => {
          const pending = Promise.reject(new Error('expected failure'));
          await new Promise((resolve) => setTimeout(resolve, 0));
          await expect(pending).rejects.toThrow('expected failure');
        });
      `,
      config,
    );
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.report.numPassedTests, 1);
    assert.equal(result.report.numFailedTests, 0);
  });
}
