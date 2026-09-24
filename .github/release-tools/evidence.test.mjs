import assert from 'node:assert/strict';
import test from 'node:test';
import { validateEvidence, requireCurrentValidation } from './evidence.mjs';

test('publication evidence binds exact candidate, run, required jobs and cleanup', () => {
  const candidate = { sha256: 'a'.repeat(64), source_sha: 'b'.repeat(40), version: '1.16.0' };
  const evidence = {
    schema: 1,
    hosting_run_id: 123,
    hosting_attempt: 1,
    candidate_artifact_id: '456',
    cleanup: 'success',
    acceptance: 'success',
    package: candidate,
    hosting_sha: 'c'.repeat(40),
    hosting_image: 'sha256:' + 'd'.repeat(64),
  };
  const run = {
    id: 123,
    conclusion: 'success',
    run_attempt: 1,
    path: '.github/workflows/staging-pipeline.yml',
    event: 'workflow_dispatch',
    repository: { full_name: 'Kong/volcano-hosting' },
    head_branch: 'main',
  };
  const jobs = [
    'Complete staging acceptance',
    'JavaScript SDK installed-package acceptance',
    'Complete Staging Rollout',
  ].map((name) => ({
    name,
    conclusion: 'success',
    steps: [{ name: 'Clean fixture', conclusion: 'success' }],
  }));
  validateEvidence(evidence, candidate, 456, run, jobs);
  for (const patch of [
    { cleanup: 'failure' },
    { candidate_artifact_id: '789' },
    { package: { ...candidate, sha256: 'e'.repeat(64) } },
    { hosting_attempt: 2 },
  ]) {
    assert.throws(() => validateEvidence({ ...evidence, ...patch }, candidate, 456, run, jobs));
  }
  assert.throws(() => validateEvidence(evidence, candidate, 456, { ...run, run_attempt: 2 }, jobs));
  assert.throws(() => validateEvidence(evidence, candidate, 456, run, jobs.slice(1)));
  assert.throws(() =>
    validateEvidence(
      evidence,
      candidate,
      456,
      run,
      jobs.map((job) => ({ ...job, conclusion: 'skipped' })),
    ),
  );
  assert.throws(() =>
    validateEvidence(
      evidence,
      candidate,
      456,
      run,
      jobs.map((job) => ({ ...job, steps: [] })),
    ),
  );
});

test('a later staging batch invalidates publication evidence', () => {
  const run = { id: 1, run_attempt: 1, conclusion: 'success' };
  requireCurrentValidation(run, run);
  assert.throws(() => requireCurrentValidation(run, { ...run, id: 2 }), /stale/);
  assert.throws(() => requireCurrentValidation(run, { ...run, run_attempt: 2 }), /stale/);
  assert.throws(() => requireCurrentValidation(run, undefined), /stale/);
});
