import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { record } from './values.mts';

const manifest = record(
  JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')),
);
const scripts = record(manifest['scripts']);
const requiredTasks = {
  build: 'pnpm build:tooling && rollup -c rollup.config.mjs && node .quality-tools/copy-types.mjs',
  'generate:openapi':
    'pnpm build:tooling && node .quality-tools/clean-openapi.mjs && orval --config orval.config.mjs && openapi-typescript openapi/openapi.yaml --default-non-nullable false -o src/generated/openapi.d.ts && prettier src/generated/openapi.d.ts --write && tsc -p tsconfig.generated.json',
  'check:openapi': 'pnpm generate:openapi && node .quality-tools/check-openapi.mjs',
  'format:check': 'prettier . --config prettier.config.cjs --check',
  'check:unused':
    'knip --files && knip --production --files && knip --include exports && knip --include dependencies,unlisted,binaries',
  lint: 'pnpm build && eslint . --max-warnings=0 && pnpm format:check',
  test: 'pnpm build && jest',
  'test:types':
    'pnpm build && tsc --noEmit -p tsconfig.json && tsc --noEmit -p tsconfig.consumer.json',
  'test:package':
    'pnpm build && pnpm pack --out reports/volcano-sdk.tgz && publint reports/volcano-sdk.tgz --strict && attw reports/volcano-sdk.tgz',
  'test:contract': 'pnpm build && jest --config jest.contract.config.cjs --runInBand',
  'test:quickstart':
    'pnpm test:package && pnpm test:types:package && node .quality-tools/test-package-quickstart.mjs reports/volcano-sdk.tgz',
  'test:types:package': 'pnpm build && tsc --noEmit -p tsconfig.consumer.json',
  'test:examples':
    'pnpm build && NEXT_PUBLIC_VOLCANO_API_URL=http://127.0.0.1:8787 NEXT_PUBLIC_VOLCANO_ANON_KEY=example-test-key NEXT_PUBLIC_VOLCANO_DATABASE_NAME=app pnpm --dir examples/nextjs-notes-app build',
  audit: 'pnpm build:tooling && node .quality-tools/audit-dependencies.mjs',
  quality: 'pnpm quality:policy && pnpm quality:checks && pnpm mutation:full',
  'quality:checks':
    'pnpm run audit && pnpm lint && pnpm check:unused && pnpm check:openapi && pnpm test:types && pnpm test:tooling && node .quality-tools/prepare-test-reports.mjs && pnpm test --ci --json --outputFile=reports/unit.json && pnpm test:typed-runtime && pnpm test:contract --listTests && pnpm test:quickstart && pnpm test:examples',
  'test:tooling':
    'pnpm build && node --test --test-reporter=tap --test-reporter=./.quality-tools/node-completeness.mjs --test-reporter-destination=stdout --test-reporter-destination=stdout --test-concurrency=1 .quality-tools/*.test.mjs',
  'test:typed-runtime': 'pnpm build && jest --config jest.typed.config.cjs',
  'mutation:full': 'pnpm build && node .quality-tools/run-mutation.mjs',
  'quality:policy':
    'pnpm build:tooling && node --test --test-reporter=tap --test-reporter=./.quality-tools/node-completeness.mjs --test-reporter-destination=stdout --test-reporter-destination=stdout .quality-tools/quality-policy.test.mjs',
  'build:tooling': 'tsc -p tsconfig.tooling.json',
};

function requireTasks(scripts: Record<string, unknown>): void {
  for (const [name, command] of Object.entries(requiredTasks)) {
    assert.equal(scripts[name], command, `${name} must run its mandatory native check`);
  }
}

await test('canonical quality tasks include every mandatory check', () => {
  requireTasks(scripts);
});

await test('every mandatory task is checked independently of its own execution', () => {
  for (const name of Object.keys(requiredTasks)) {
    assert.throws(() => {
      requireTasks({ ...scripts, [name]: 'node --version' });
    });
  }
});
