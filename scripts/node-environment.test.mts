import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { record } from './values.mts';

const jest = fileURLToPath(new URL('../node_modules/jest/bin/jest.js', import.meta.url));
const environment = fileURLToPath(new URL('node-environment.cjs', import.meta.url));

await test('the node environment stops the timers a test file leaves behind', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'volcano-node-environment-'));
  try {
    const timeoutMarker = join(directory, 'timeout-fired');
    const intervalMarker = join(directory, 'interval-fired');
    await writeFile(
      join(directory, 'fixture.test.js'),
      `
        const { writeFileSync } = require('node:fs');
        test('timers still run while the file is active', async () => {
          await new Promise((resolve) => setTimeout(resolve, 1));
          const interval = setInterval(() => {}, 1);
          clearInterval(interval);
        });
        test('abandons a timeout and an interval', () => {
          setTimeout(() => writeFileSync(${JSON.stringify(timeoutMarker)}, 'fired'), 2000);
          setInterval(() => writeFileSync(${JSON.stringify(intervalMarker)}, 'fired'), 2000);
        });
      `,
    );
    const result = spawnSync(
      process.execPath,
      [
        jest,
        '--config',
        JSON.stringify({
          rootDir: directory,
          testEnvironment: environment,
          reporters: [],
          testMatch: ['<rootDir>/*.test.js'],
        }),
        '--runInBand',
        '--no-cache',
        '--json',
      ],
      { encoding: 'utf8', timeout: 15_000 },
    );
    assert.equal(result.error, undefined);
    assert.equal(result.signal, null, 'Jest stayed alive on an abandoned interval');
    assert.equal(result.status, 0, result.stderr);
    assert.equal(record(JSON.parse(result.stdout))['numPassedTests'], 2);
    assert.equal(existsSync(timeoutMarker), false);
    assert.equal(existsSync(intervalMarker), false);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
