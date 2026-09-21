import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';
import { gunzipSync } from 'node:zlib';

const run = promisify(execFile);
const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const cleanReport = {
  actions: [],
  advisories: {},
  muted: [],
  metadata: {
    vulnerabilities: { info: 0, low: 0, moderate: 0, high: 0, critical: 0 },
    dependencies: 1,
    totalDependencies: 1,
  },
};
const vulnerableReport = {
  ...cleanReport,
  advisories: {
    1: {
      id: 1,
      module_name: 'quality-fixture',
      title: 'Fixture vulnerability',
      severity: 'low',
      vulnerable_versions: '<2.0.0',
      patched_versions: '>=2.0.0',
      url: 'https://example.test/advisory',
      findings: [{ version: '1.0.0', paths: ['.>quality-fixture'] }],
    },
  },
  metadata: {
    ...cleanReport.metadata,
    vulnerabilities: { ...cleanReport.metadata.vulnerabilities, low: 1 },
  },
};

async function auditFixture(context, status, report) {
  const directory = await mkdtemp(join(tmpdir(), 'volcano-audit-policy-'));
  context.after(() => rm(directory, { recursive: true, force: true }));
  await writeFile(
    join(directory, 'package.json'),
    JSON.stringify({
      packageManager: manifest.packageManager,
      scripts: { audit: manifest.scripts.audit },
      devDependencies: { 'quality-fixture': '1.0.0' },
    }),
  );
  await writeFile(
    join(directory, 'pnpm-lock.yaml'),
    `lockfileVersion: '9.0'
importers:
  .:
    devDependencies:
      quality-fixture:
        specifier: 1.0.0
        version: 1.0.0
packages:
  quality-fixture@1.0.0:
    resolution: {integrity: sha512-fixture}
snapshots:
  quality-fixture@1.0.0: {}
`,
  );
  const requests = [];
  const server = createServer((request, response) => {
    const chunks = [];
    request.on('data', (chunk) => chunks.push(chunk));
    request.on('end', () => {
      const bytes = Buffer.concat(chunks);
      const body = request.headers['content-encoding'] === 'gzip' ? gunzipSync(bytes) : bytes;
      requests.push({ url: request.url, body: JSON.parse(body.toString()) });
      response.writeHead(status, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify(report));
    });
  });
  context.after(() => new Promise((resolve) => server.close(resolve)));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  await writeFile(
    join(directory, '.npmrc'),
    `registry=http://127.0.0.1:${address.port}\nfetch-retries=0\nverify-deps-before-run=false\n`,
  );
  const options = {
    cwd: directory,
    env: {
      ...process.env,
      npm_config_registry: `http://127.0.0.1:${address.port}`,
      npm_config_fetch_retries: '0',
    },
    timeout: 15_000,
  };
  try {
    const result = await run('pnpm', ['run', 'audit'], options);
    return { code: 0, stdout: result.stdout, requests };
  } catch (error) {
    assert.equal(typeof error.code, 'number', String(error));
    return { code: error.code, stdout: error.stdout, requests };
  }
}

test('dependency audit accepts a clean registry result', async (context) => {
  const result = await auditFixture(context, 200, cleanReport);
  assert.equal(result.code, 0, result.stdout);
  assert.equal(result.requests.length, 1);
  assert.equal(result.requests[0].url, '/-/npm/v1/security/audits/quick');
  assert.deepEqual(result.requests[0].body.dependencies['.'].dependencies['quality-fixture'], {
    dev: true,
    integrity: 'sha512-fixture',
    version: '1.0.0',
  });
});

test('dependency audit rejects even low-severity development advisories', async (context) => {
  const result = await auditFixture(context, 200, vulnerableReport);
  assert.equal(result.code, 1, result.stdout);
  assert.match(result.stdout, /Fixture vulnerability/);
});

test('dependency audit fails when the registry is unavailable', async (context) => {
  const result = await auditFixture(context, 503, { error: 'Fixture registry unavailable' });
  assert.notEqual(result.code, 0);
  assert.match(result.stdout, /503/);
});
