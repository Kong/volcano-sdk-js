import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';

export function readCandidate(directory) {
  const candidate = JSON.parse(readFileSync(path.join(directory, 'candidate.json'), 'utf8'));
  const digest = createHash('sha256')
    .update(readFileSync(path.join(directory, 'sdk.tgz')))
    .digest('hex');
  if (
    candidate.schema !== 1 ||
    candidate.repository !== 'Kong/volcano-sdk-js' ||
    candidate.filename !== 'sdk.tgz' ||
    candidate.sha256 !== digest ||
    candidate.run_attempt !== 1 ||
    !/^[a-f0-9]{40}$/.test(candidate.source_sha) ||
    !/^\d+\.\d+\.\d+$/.test(candidate.version)
  ) {
    throw new Error('candidate identity or checksum mismatch');
  }
  return candidate;
}

export function validateEvidence(evidence, candidate, artifactID, run, jobs) {
  if (
    run.conclusion !== 'success' ||
    run.run_attempt !== 1 ||
    run.path !== '.github/workflows/staging-pipeline.yml' ||
    run.event !== 'workflow_dispatch' ||
    run.repository.full_name !== 'Kong/volcano-hosting' ||
    run.head_branch !== 'main' ||
    evidence.schema !== 1 ||
    evidence.hosting_run_id !== run.id ||
    evidence.hosting_attempt !== 1 ||
    evidence.candidate_artifact_id !== String(artifactID) ||
    evidence.cleanup !== 'success' ||
    evidence.acceptance !== 'success' ||
    JSON.stringify(evidence.package) !== JSON.stringify(candidate) ||
    !/^[a-f0-9]{40}$/.test(evidence.hosting_sha) ||
    !/^sha256:[a-f0-9]{64}$/.test(evidence.hosting_image)
  ) {
    throw new Error(
      'Hosting evidence does not identify this candidate and successful first attempt',
    );
  }
  for (const suffix of [
    'Complete staging acceptance',
    'JavaScript SDK installed-package acceptance',
    'Complete Staging Rollout',
  ]) {
    const matches = jobs.filter((job) => job.name.endsWith(suffix));
    if (matches.length !== 1 || matches[0].conclusion !== 'success') {
      throw new Error(`Hosting requires successful ${suffix}`);
    }
    if (
      suffix === 'JavaScript SDK installed-package acceptance' &&
      matches[0].steps.filter(
        (step) => step.name === 'Clean fixture' && step.conclusion === 'success',
      ).length !== 1
    ) {
      throw new Error('Hosting cleanup is missing or failed');
    }
  }
}

export function requireCurrentValidation(run, latest) {
  if (
    !latest ||
    latest.id !== run.id ||
    latest.run_attempt !== 1 ||
    latest.conclusion !== 'success'
  ) {
    throw new Error(
      'staging validation is stale; request a new full validation for the same candidate',
    );
  }
}
