import assert from 'node:assert/strict';
import test from 'node:test';
import { checkReadiness, selectReadyDeployment } from './readiness.mjs';

const requirement = { release: 'v0.13.0', sha: 'a'.repeat(40) };
const steps = Object.fromEntries(
  [
    'bootstrap',
    'foundation',
    'promote_artifacts',
    'prepare_hosting_infrastructure',
    'run_database_migrations',
    'roll_hosting_release',
    'public_assets',
    'deploy_smoke',
    'verify',
    'pricing_catalog',
    'smtp_retirement',
  ].map((key) => [key, 'success']),
);
const begin = {
  version: requirement.release,
  sha: requirement.sha,
  run: '123-1',
  at: 100,
  status: 'started',
};
const first = { begin, outcome: { ...begin, status: 'success', steps } };

test('production readiness reads latest attempt, including missing, failed and cancelled outcomes', () => {
  assert.equal(selectReadyDeployment([first], requirement).run, begin.run);
  for (const status of [undefined, 'failure', 'cancelled', 'started']) {
    const next = { ...begin, at: 101, run: '124-1' };
    assert.throws(() =>
      selectReadyDeployment(
        [first, { begin: next, outcome: status ? { ...next, status, steps } : undefined }],
        requirement,
      ),
    );
  }
  assert.throws(() =>
    selectReadyDeployment(
      [{ ...first, outcome: { ...first.outcome, steps: { ...steps, verify: 'skipped' } } }],
      requirement,
    ),
  );
  assert.throws(() => selectReadyDeployment([first], { ...requirement, sha: 'b'.repeat(40) }));
  assert.throws(() =>
    selectReadyDeployment(
      [{ ...first, outcome: { ...first.outcome, sha: 'b'.repeat(40) } }],
      requirement,
    ),
  );
});

test('readiness preserves nanosecond ordering and rejects changes during inspection', async () => {
  const prefix = '_system/hosting-releases/attempts/';
  const records = new Map();
  for (const [run, at] of [
    ['123-1', '1789999999999999999'],
    ['124-1', '1790000000000000000'],
  ]) {
    const entry = { ...begin, run, at };
    for (const [name, data] of [
      ['begin', entry],
      ['outcome', { ...entry, status: 'success', steps }],
    ]) {
      records.set(`${prefix}${run}/${name}.json`, JSON.stringify(data).replace(`"${at}"`, at));
    }
  }
  let listingChanged = false;
  const run = (_command, args) => {
    if (args[0] === 's3api') {
      const Contents = [...records.keys()].map((Key) => ({ Key }));
      if (listingChanged) Contents.push({ Key: `${prefix}125-1/begin.json` });
      return JSON.stringify({ Contents });
    }
    return records.get(args[2].slice(args[2].indexOf(prefix)));
  };
  const github = {
    rest: {
      repos: {
        compareCommitsWithBasehead: async () => ({
          data: {
            status: 'identical',
            merge_base_commit: { sha: requirement.sha },
          },
        }),
      },
    },
  };
  assert.equal((await checkReadiness(github, requirement, run)).run, '124-1');
  github.rest.repos.compareCommitsWithBasehead = async () => {
    listingChanged = true;
    return { data: { status: 'identical', merge_base_commit: { sha: requirement.sha } } };
  };
  await assert.rejects(
    checkReadiness(github, requirement, run),
    /changed during readiness inspection/,
  );
});
