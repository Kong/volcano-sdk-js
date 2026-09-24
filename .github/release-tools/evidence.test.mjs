import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  readCandidate,
  validateEvidence,
  validateMergedCandidate,
  latestValidationRun,
} from './evidence.mjs';

const suiteSHA = 'c'.repeat(40);
const evidence = {
  schema: 1,
  package: { source_sha: 'a'.repeat(40), version: '1.15.0', sha256: 'b'.repeat(64) },
  sdk: { version: '1.15.0', sha256: 'b'.repeat(64) },
  target: 'https://api.volcano.dev',
  run_id: 123,
  run_attempt: 2,
  suite_sha: suiteSHA,
  candidate_artifact_id: '456',
  cleanup: 'success',
  acceptance: 'success',
};
const run = {
  id: 123,
  head_sha: 'a'.repeat(40),
  conclusion: 'success',
  run_attempt: 2,
  path: '.github/workflows/production-compatibility.yml',
  event: 'pull_request',
  repository: { full_name: 'Kong/volcano-sdk-js' },
};
const jobs = ['Production compatibility', 'JavaScript SDK installed-package acceptance'].map(
  (name) => ({
    name,
    conclusion: 'success',
    steps: [{ name: 'Run acceptance and cleanup', conclusion: 'success' }],
  }),
);

test('publication requires successful current compatibility evidence including cleanup', () => {
  validateEvidence(evidence, run, jobs, suiteSHA);
  for (const patch of [
    { cleanup: 'failure' },
    { acceptance: 'skipped' },
    { run_attempt: 1 },
    { suite_sha: 'x' },
    { candidate_artifact_id: '' },
    { target: 'https://api.staging.volcano.dev' },
    { sdk: { version: '1.15.0', sha256: 'x'.repeat(64) } },
    { sdk: { version: '1.16.0', sha256: 'b'.repeat(64) } },
  ]) {
    assert.throws(() => validateEvidence({ ...evidence, ...patch }, run, jobs, suiteSHA));
  }
  for (const conclusion of ['failure', 'skipped', 'cancelled', null]) {
    assert.throws(() => validateEvidence(evidence, { ...run, conclusion }, jobs, suiteSHA));
    assert.throws(() =>
      validateEvidence(
        evidence,
        run,
        jobs.map((job) => ({ ...job, conclusion })),
        suiteSHA,
      ),
    );
  }
  assert.throws(() => validateEvidence(evidence, run, jobs.slice(1), suiteSHA));
  assert.throws(() =>
    validateEvidence(
      evidence,
      run,
      jobs.map((job) => ({ ...job, steps: [] })),
      suiteSHA,
    ),
  );
});

test('merged release must retain the exact tested PR tree and deliberate human merge', () => {
  const sha = 'a'.repeat(40);
  const tree = 'b'.repeat(40);
  const pr = {
    number: 9,
    head: {
      sha,
      repo: { full_name: 'Kong/volcano-sdk-js' },
      ref: 'release-please--branches--main--components--@volcano.dev/sdk',
    },
    base: { ref: 'main' },
    user: { login: 'kong-volcano-app[bot]' },
    merged_at: '2026-09-24',
    merge_commit_sha: 'e'.repeat(40),
    merged_by: { type: 'User' },
    auto_merge: null,
  };
  const candidate = { pull_request: 9, source_sha: sha, source_tree: tree };
  validateMergedCandidate(pr, candidate, tree);
  for (const patch of [
    { merged_at: null },
    { merged_by: { type: 'Bot' } },
    { auto_merge: {} },
    { user: { login: 'someone' } },
  ])
    assert.throws(() => validateMergedCandidate({ ...pr, ...patch }, candidate, tree));
  assert.throws(() => validateMergedCandidate(pr, candidate, 'f'.repeat(40)));
  assert.throws(() =>
    validateMergedCandidate(pr, { ...candidate, source_sha: '0'.repeat(40) }, tree),
  );
});

test('latest compatibility run must pass, even when an earlier run passed', () => {
  const passed = { id: 123, status: 'completed', conclusion: 'success' };
  assert.equal(latestValidationRun([passed]), 123);
  for (const status of ['queued', 'in_progress'])
    assert.throws(() => latestValidationRun([{ ...passed, status }, passed]));
  for (const conclusion of ['failure', 'skipped', 'cancelled', null])
    assert.throws(() => latestValidationRun([{ ...passed, conclusion }, passed]));
  assert.throws(() => latestValidationRun([]));
});

test('candidate identity binds repository, source, version and exact distribution bytes', () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'sdk-evidence-'));
  const archive = path.join(directory, 'sdk.tgz');
  const metadata = path.join(directory, 'candidate.json');
  const candidate = {
    schema: 2,
    repository: 'Kong/volcano-sdk-js',
    filename: 'sdk.tgz',
    version: '1.15.0',
    source_sha: 'a'.repeat(40),
    source_tree: 'b'.repeat(40),
    run_attempt: 1,
    sha256: createHash('sha256').update('original bytes').digest('hex'),
  };
  try {
    writeFileSync(archive, 'original bytes');
    writeFileSync(metadata, JSON.stringify(candidate));
    assert.deepEqual(readCandidate(directory), candidate);
    for (const patch of [
      { repository: 'another/repo' },
      { source_sha: 'main' },
      { source_tree: '' },
      { version: 'latest' },
      { run_attempt: 0 },
      { filename: '../sdk.tgz' },
    ]) {
      writeFileSync(metadata, JSON.stringify({ ...candidate, ...patch }));
      assert.throws(() => readCandidate(directory), /identity or checksum/);
    }
    writeFileSync(metadata, JSON.stringify(candidate));
    writeFileSync(archive, 'replacement bytes');
    assert.throws(() => readCandidate(directory), /identity or checksum/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
