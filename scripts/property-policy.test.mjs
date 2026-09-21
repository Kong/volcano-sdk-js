import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { transformFileAsync } from '@babel/core';

const require = createRequire(import.meta.url);
const jest = require.resolve('jest/bin/jest');
const fastCheck = require.resolve('fast-check');
const reporter = fileURLToPath(new URL('jest-completeness.cjs', import.meta.url));
const optionsFile = fileURLToPath(
  new URL('../__tests__/support/property-options.ts', import.meta.url),
);
const configFile = fileURLToPath(new URL('../babel.config.js', import.meta.url));
const prepareReports = fileURLToPath(new URL('prepare-test-reports.mjs', import.meta.url));

test('a failing property fails Jest and preserves its seed and minimized counterexample', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'volcano-property-policy-'));
  try {
    const compiled = await transformFileAsync(optionsFile, { configFile });
    assert.equal(typeof compiled.code, 'string');
    await writeFile(join(directory, 'property-options.js'), compiled.code);
    await writeFile(
      join(directory, 'property.test.js'),
      `
      const fc = require(${JSON.stringify(fastCheck)});
      const { propertyOptions } = require('./property-options.js');
      test('negative property', () => {
        expect(propertyOptions()).toEqual({numRuns: 200, seed: 12345});
        fc.assert(fc.property(fc.integer({min: 0, max: 100}), value => value < 0), propertyOptions());
      });
    `,
    );
    const prepared = spawnSync(process.execPath, [prepareReports], {
      cwd: directory,
      encoding: 'utf8',
      timeout: 15_000,
    });
    assert.equal(prepared.status, 0, prepared.stderr);
    const report = join(directory, 'reports/unit.json');
    const result = spawnSync(
      process.execPath,
      [
        jest,
        '--config',
        JSON.stringify({
          rootDir: directory,
          testEnvironment: 'node',
          reporters: [reporter],
          testMatch: ['<rootDir>/*.test.js'],
        }),
        '--runInBand',
        '--json',
        `--outputFile=${report}`,
      ],
      {
        encoding: 'utf8',
        timeout: 15_000,
        env: { ...process.env, VOLCANO_PROPERTY_SEED: '12345' },
      },
    );
    assert.equal(result.error, undefined);
    assert.equal(result.status, 1, result.stderr);
    const results = JSON.parse(await readFile(report, 'utf8'));
    assert.equal(results.numFailedTests, 1);
    assert.equal(results.numPendingTests, 0);
    const failure = results.testResults[0].assertionResults[0].failureMessages.join('\n');
    assert.match(failure, /seed: 12345/);
    assert.match(failure, /Counterexample: \[0\]/);
    assert.match(failure, /path: "/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
