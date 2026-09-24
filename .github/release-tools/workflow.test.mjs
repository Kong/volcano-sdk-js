import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { spawnSync } from 'node:child_process';

test('only release PR compatibility builds; manual merge publishes existing files', () => {
  const read = (name) => readFileSync(new URL(`../workflows/${name}.yml`, import.meta.url), 'utf8');
  const compatibility = read('production-compatibility');
  assert.match(compatibility, /pull_request:/);
  assert.match(compatibility, /environment: sdk-production-compatibility/);
  assert.match(compatibility, /vars.KONG_GH_APP_ID/);
  assert.match(compatibility, /secrets.KONG_GH_APP_PRIVATE_KEY/);
  assert.match(compatibility, /repositories: volcano-hosting\n {10}permission-contents: read/);
  assert.match(compatibility, /sparse-checkout: tests\/sdk-contract/);
  const suite = JSON.parse(readFileSync(new URL('./hosting-tests.json', import.meta.url), 'utf8'));
  assert.equal(suite.repository, 'Kong/volcano-hosting');
  assert.match(suite.sha, /^[a-f0-9]{40}$/);
  assert.ok(compatibility.includes(`ref: ${suite.sha}`));
  assert.match(compatibility, /node hosting\/tests\/sdk-contract\/runner\/run.mjs run/);
  assert.doesNotMatch(compatibility, /uses: Kong\/|sdk-acceptance@|permission-actions: write/);
  assert.match(compatibility, /github.event_name == 'pull_request'/);
  assert.doesNotMatch(compatibility, /npm-production|npm publish/);
  const publisher = read('publish');
  assert.doesNotMatch(
    publisher,
    /pnpm build|npm pack|test:package|staging-pipeline|production-compatibility.yml@|repository: Kong\/volcano-hosting|configure-aws-credentials/,
  );
  assert.match(publisher, /environment: npm-production/);
  assert.match(publisher, /release.mjs candidate/);
  assert.match(publisher, /needs.select.outputs.selected == 'true'/);
  assert.doesNotMatch(
    publisher.slice(publisher.indexOf('  smoke:')),
    /id-token: write|VOLCANO_APP_KEY/,
  );
  const please = read('release-please');
  assert.match(please, /skip-github-release: true/);
  assert.doesNotMatch(please, /pr merge|--auto/);
});

test('required compatibility job rejects failed selection, missing acceptance and release spoofing', () => {
  const yaml = readFileSync(
    new URL('../workflows/production-compatibility.yml', import.meta.url),
    'utf8',
  );
  const complete = yaml.slice(yaml.indexOf('  complete:'));
  assert.match(complete, /name: Production compatibility/);
  assert.match(complete, /if: always\(\)/);
  const script = complete
    .slice(complete.indexOf('        run: |') + '        run: |'.length)
    .split('\n')
    .map((line) => line.replace(/^ {10}/, ''))
    .join('\n');
  const check = (overrides) =>
    spawnSync('bash', ['-e', '-c', script], {
      env: {
        ...process.env,
        SELECT_RESULT: 'success',
        SELECTED: 'true',
        ACCEPTANCE_RESULT: 'success',
        HEAD_BRANCH: 'release-please--branches--main',
        ...overrides,
      },
    }).status;
  assert.equal(check({}), 0);
  for (const result of ['skipped', 'failure', 'cancelled', '']) {
    assert.notEqual(check({ ACCEPTANCE_RESULT: result }), 0);
    assert.notEqual(check({ SELECT_RESULT: result }), 0);
  }
  assert.notEqual(check({ SELECTED: 'false' }), 0);
  assert.equal(
    check({ SELECTED: 'false', ACCEPTANCE_RESULT: 'skipped', HEAD_BRANCH: 'fix/example' }),
    0,
  );
});
