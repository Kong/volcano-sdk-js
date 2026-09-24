import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const requiredChecks = [
  'pnpm run audit',
  'pnpm lint',
  'pnpm check:unused',
  'pnpm check:openapi',
  'pnpm test:types',
  'pnpm test:tooling',
  'node scripts/prepare-test-reports.mjs',
  'pnpm test --ci --json --outputFile=reports/unit.json',
  'pnpm test:typed-runtime',
  'pnpm test:contract --listTests',
  'pnpm test:quickstart',
];

function requireTasks(scripts) {
  assert.equal(scripts.quality, 'pnpm quality:policy && pnpm quality:checks && pnpm mutation:pr');
  assert.equal(scripts['quality:policy'], 'node --test scripts/quality-policy.test.mjs');
  assert.deepEqual(scripts['quality:checks'].split(' && '), requiredChecks);
}

test('canonical quality tasks include every mandatory check', () => {
  requireTasks(manifest.scripts);
});

test('removing policy validation or tooling cannot make the task graph pass', () => {
  assert.throws(() => requireTasks({ ...manifest.scripts, quality: 'pnpm quality:checks' }));
  assert.throws(() => requireTasks({ ...manifest.scripts, 'quality:policy': 'node --version' }));
  assert.throws(() =>
    requireTasks({
      ...manifest.scripts,
      'quality:checks': requiredChecks.filter((item) => item !== 'pnpm test:tooling').join(' && '),
    }),
  );
});
