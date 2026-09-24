import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { readCandidate } from './evidence.mjs';
import { hostingGitHub } from './github.mjs';
import { checkReadiness } from './readiness.mjs';

const candidate = readCandidate('package');
const npm = (args, options = {}) => execFileSync('npm', args, { encoding: 'utf8', ...options });

function checkRegistryBytes(directory) {
  const [packed] = JSON.parse(
    npm([
      'pack',
      `@volcano.dev/sdk@${candidate.version}`,
      '--ignore-scripts',
      '--json',
      '--pack-destination',
      directory,
    ]),
  );
  const digest = createHash('sha256')
    .update(readFileSync(path.join(directory, packed.filename)))
    .digest('hex');
  if (digest !== candidate.sha256)
    throw new Error('registry version contains different candidate bytes');
}

if (process.argv[2] === 'smoke') {
  const directory = mkdtempSync(path.join(tmpdir(), 'sdk-published-'));
  checkRegistryBytes(directory);
  npm([
    'install',
    '--ignore-scripts',
    '--no-audit',
    '--no-fund',
    '--prefix',
    directory,
    `@volcano.dev/sdk@${candidate.version}`,
  ]);
  execFileSync(
    'node',
    [
      '-e',
      `
    const assert = require('node:assert/strict');
    const { VolcanoClient } = require('@volcano.dev/sdk');
    assert.equal(typeof VolcanoClient, 'function');
    assert.ok(require('@volcano.dev/sdk/realtime'));
    const client = new VolcanoClient({ apiUrl: 'https://api.volcano.dev', anonKey: 'install-smoke' });
    assert.equal(typeof client.auth.signIn, 'function');
  `,
    ],
    { cwd: directory, stdio: 'inherit' },
  );
} else {
  const latest = JSON.parse(npm(['view', '@volcano.dev/sdk', 'dist-tags.latest', '--json']));
  const versionParts = (version) => {
    if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('unexpected npm latest version');
    return version.split('.').map(Number);
  };
  const wanted = versionParts(candidate.version);
  const current = versionParts(latest);
  const different = wanted.findIndex((part, index) => part !== current[index]);
  if (different >= 0 && wanted[different] < current[different])
    throw new Error('refusing to downgrade npm latest');
  let exists = false;
  try {
    npm(['view', `@volcano.dev/sdk@${candidate.version}`, 'version', '--json'], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    exists = true;
  } catch (error) {
    if (!String(error.stderr).includes('E404')) throw error;
  }
  if (exists) checkRegistryBytes(mkdtempSync(path.join(tmpdir(), 'sdk-recovery-')));
  // This is the final external read before npm. A later deployment is outside this snapshot's scope.
  await checkReadiness(await hostingGitHub(), candidate.backend);
  readCandidate('package');
  if (!exists)
    npm(
      ['publish', './package/sdk.tgz', '--ignore-scripts', '--provenance', '--access', 'public'],
      { stdio: 'inherit' },
    );
}
