import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { requireReviewedRelease } from './source-policy.mjs';

export function readCandidate(directory) {
  const candidate = JSON.parse(readFileSync(path.join(directory, 'candidate.json'), 'utf8'));
  const digest = createHash('sha256')
    .update(readFileSync(path.join(directory, 'sdk.tgz')))
    .digest('hex');
  if (
    candidate.schema !== 2 ||
    candidate.repository !== 'Kong/volcano-sdk-js' ||
    candidate.filename !== 'sdk.tgz' ||
    candidate.sha256 !== digest ||
    !Number.isSafeInteger(candidate.run_attempt) ||
    candidate.run_attempt < 1 ||
    !/^[a-f0-9]{40}$/.test(candidate.source_sha) ||
    !/^[a-f0-9]{40}$/.test(candidate.source_tree) ||
    !/^\d+\.\d+\.\d+$/.test(candidate.version)
  )
    throw new Error('candidate identity or checksum mismatch');
  return candidate;
}

export function validateEvidence(evidence, run, jobs, suiteSHA) {
  if (
    run.conclusion !== 'success' ||
    run.path !== '.github/workflows/production-compatibility.yml' ||
    run.event !== 'pull_request' ||
    run.repository.full_name !== 'Kong/volcano-sdk-js' ||
    evidence.schema !== 1 ||
    run.head_sha !== evidence.package?.source_sha ||
    evidence.run_id !== run.id ||
    evidence.run_attempt !== run.run_attempt ||
    evidence.suite_sha !== suiteSHA ||
    evidence.cleanup !== 'success' ||
    evidence.acceptance !== 'success' ||
    !/^[1-9]\d*$/.test(evidence.candidate_artifact_id) ||
    evidence.target !== 'https://api.volcano.dev' ||
    evidence.sdk?.sha256 !== evidence.package?.sha256 ||
    evidence.sdk?.version !== evidence.package?.version
  )
    throw new Error('invalid production compatibility evidence');
  for (const suffix of [
    'Production compatibility',
    'JavaScript SDK installed-package acceptance',
  ]) {
    const matches = jobs.filter((job) => job.name.endsWith(suffix));
    if (matches.length !== 1 || matches[0].conclusion !== 'success')
      throw new Error(`required ${suffix} did not pass`);
    if (
      suffix === 'JavaScript SDK installed-package acceptance' &&
      matches[0].steps.filter(
        (step) => step.name === 'Run acceptance and cleanup' && step.conclusion === 'success',
      ).length !== 1
    ) {
      throw new Error('cleanup did not pass');
    }
  }
}

export function validateMergedCandidate(pr, candidate, mergeTree) {
  requireReviewedRelease(pr, pr.merge_commit_sha);
  if (
    candidate.pull_request !== pr.number ||
    candidate.source_sha !== pr.head.sha ||
    candidate.source_tree !== mergeTree
  ) {
    throw new Error(
      'merged source differs from the tested release PR; require an up-to-date PR before merging',
    );
  }
}

export function latestValidationRun(runs) {
  const latest = runs[0];
  if (!latest || latest.status !== 'completed' || latest.conclusion !== 'success')
    throw new Error(
      'latest release PR compatibility run has not passed; rerun it before publishing',
    );
  return latest.id;
}
