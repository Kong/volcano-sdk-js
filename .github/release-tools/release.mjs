import { createHash } from 'node:crypto';
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { isReleasePR, requireReviewedRelease } from './source-policy.mjs';
import {
  readCandidate,
  validateEvidence,
  validateMergedCandidate,
  latestValidationRun,
} from './evidence.mjs';
import { sdkGitHub } from './github.mjs';

const repo = { owner: 'Kong', repo: 'volcano-sdk-js' };
const json = (file) => JSON.parse(readFileSync(file, 'utf8'));
const save = (file, value) => writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
const output = (key, value) => appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${value}\n`);

async function select() {
  if (process.env.GITHUB_REF !== 'refs/heads/main')
    throw new Error('publication must run from main');
  const github = sdkGitHub();
  const event = json(process.env.GITHUB_EVENT_PATH);
  let number;
  if (process.env.GITHUB_EVENT_NAME === 'workflow_dispatch') {
    number = Number(event.inputs.pull_request);
    if (!Number.isSafeInteger(number) || number < 1)
      throw new Error('merged release PR number required');
  } else {
    const prs = await github.paginate(github.rest.repos.listPullRequestsAssociatedWithCommit, {
      ...repo,
      commit_sha: process.env.GITHUB_SHA,
      per_page: 100,
    });
    const matches = prs.filter(
      (pr) => isReleasePR(pr) && pr.merged_at && pr.merge_commit_sha === process.env.GITHUB_SHA,
    );
    if (matches.length === 0) return output('selected', 'false');
    if (matches.length !== 1) throw new Error('ambiguous release merge');
    number = matches[0].number;
  }
  const { data: pr } = await github.rest.pulls.get({ ...repo, pull_number: number });
  requireReviewedRelease(
    pr,
    process.env.GITHUB_EVENT_NAME === 'push' ? process.env.GITHUB_SHA : pr.merge_commit_sha,
  );
  const { data: runs } = await github.rest.actions.listWorkflowRuns({
    ...repo,
    workflow_id: 'production-compatibility.yml',
    event: 'pull_request',
    head_sha: pr.head.sha,
    per_page: 1,
  });
  const runID = latestValidationRun(runs.workflow_runs);
  output('selected', 'true');
  output('pull_request', number);
  output('merge_sha', pr.merge_commit_sha);
  output('compatibility_run_id', runID);
}

function manifest() {
  const info = json('package.json');
  if (info.version !== json('.release-please-manifest.json')['.'])
    throw new Error('Release Please version mismatch');
  save('package/candidate.json', {
    schema: 2,
    repository: 'Kong/volcano-sdk-js',
    source_sha: process.env.SOURCE_SHA,
    source_tree: execFileSync('git', ['rev-parse', 'HEAD^{tree}'], { encoding: 'utf8' }).trim(),
    pull_request: Number(process.env.RELEASE_PR),
    run_id: Number(process.env.GITHUB_RUN_ID),
    run_attempt: Number(process.env.GITHUB_RUN_ATTEMPT),
    version: info.version,
    filename: 'sdk.tgz',
    sha256: createHash('sha256').update(readFileSync('package/sdk.tgz')).digest('hex'),
  });
}

function attest() {
  const candidate = readCandidate('package');
  const proof = json('acceptance/evidence.json');
  const suite = json('.github/release-tools/hosting-tests.json');
  const checkout = execFileSync('git', ['-C', 'hosting', 'rev-parse', 'HEAD'], {
    encoding: 'utf8',
  }).trim();
  if (
    candidate.source_sha !== process.env.SOURCE_SHA ||
    candidate.run_id !== Number(process.env.CANDIDATE_RUN_ID) ||
    proof.sdk?.sha256 !== candidate.sha256 ||
    proof.sdk?.version !== candidate.version ||
    suite.repository !== 'Kong/volcano-hosting' ||
    proof.suite_sha !== suite.sha ||
    checkout !== suite.sha ||
    proof.target !== 'https://api.volcano.dev' ||
    proof.acceptance !== 'success' ||
    proof.cleanup !== 'success'
  )
    throw new Error('Hosting acceptance evidence does not match the selected candidate');
  save('acceptance/evidence.json', {
    ...proof,
    package: candidate,
    candidate_artifact_id: process.env.CANDIDATE_ARTIFACT_ID,
    run_id: Number(process.env.GITHUB_RUN_ID),
    run_attempt: Number(process.env.GITHUB_RUN_ATTEMPT),
  });
}

async function evidence() {
  const github = sdkGitHub();
  const proof = json('acceptance/evidence.json');
  const [{ data: run }, { data: pr }, jobs, { data: runs }] = await Promise.all([
    github.rest.actions.getWorkflowRun({ ...repo, run_id: process.env.COMPATIBILITY_RUN_ID }),
    github.rest.pulls.get({ ...repo, pull_number: Number(process.env.RELEASE_PR) }),
    github.paginate(github.rest.actions.listJobsForWorkflowRunAttempt, {
      ...repo,
      run_id: process.env.COMPATIBILITY_RUN_ID,
      attempt_number: proof.run_attempt,
      per_page: 100,
    }),
    github.rest.actions.listWorkflowRuns({
      ...repo,
      workflow_id: 'production-compatibility.yml',
      event: 'pull_request',
      head_sha: proof.package.source_sha,
      per_page: 1,
    }),
  ]);
  if (latestValidationRun(runs.workflow_runs) !== run.id)
    throw new Error('a newer compatibility run superseded the selected evidence');
  validateEvidence(proof, run, jobs, json('.github/release-tools/hosting-tests.json').sha);
  requireReviewedRelease(pr, process.env.MERGE_SHA);
  const { data: merge } = await github.rest.git.getCommit({
    ...repo,
    commit_sha: pr.merge_commit_sha,
  });
  validateMergedCandidate(pr, proof.package, merge.tree.sha);
  const { data: artifact } = await github.rest.actions.getArtifact({
    ...repo,
    artifact_id: proof.candidate_artifact_id,
  });
  if (
    artifact.expired ||
    artifact.name !== 'sdk-candidate' ||
    artifact.workflow_run?.id !== proof.package.run_id ||
    artifact.workflow_run?.head_sha !== proof.package.source_sha
  )
    throw new Error('tested candidate artifact missing or changed');
  if (process.argv[2] === 'candidate') {
    output('candidate_artifact_id', proof.candidate_artifact_id);
    output('candidate_run_id', proof.package.run_id);
  } else if (JSON.stringify(readCandidate('package')) !== JSON.stringify(proof.package)) {
    throw new Error('publication package differs from compatibility evidence');
  }
}
async function release() {
  const github = sdkGitHub();
  const candidate = readCandidate('package');
  const { data: pr } = await github.rest.pulls.get({
    ...repo,
    pull_number: Number(process.env.RELEASE_PR),
  });
  requireReviewedRelease(pr, process.env.MERGE_SHA);
  const tag = `v${candidate.version}`;
  try {
    const { data: ref } = await github.rest.git.getRef({ ...repo, ref: `tags/${tag}` });
    if (ref.object.type !== 'commit' || ref.object.sha !== pr.merge_commit_sha)
      throw new Error('existing tag source mismatch');
  } catch (error) {
    if (error.status !== 404) throw error;
  }
  let existing;
  try {
    existing = (await github.rest.repos.getReleaseByTag({ ...repo, tag })).data;
  } catch (error) {
    if (error.status !== 404) throw error;
  }
  if (existing) {
    const { data: ref } = await github.rest.git.getRef({ ...repo, ref: `tags/${tag}` });
    if (ref.object.sha !== pr.merge_commit_sha || existing.draft || existing.prerelease)
      throw new Error('existing release identity mismatch');
  } else {
    await github.rest.repos.createRelease({
      ...repo,
      tag_name: tag,
      target_commitish: pr.merge_commit_sha,
      name: tag,
      body: `${pr.body}\n\n[View ${tag} on npm](https://www.npmjs.com/package/@volcano.dev/sdk/v/${candidate.version})`,
      draft: false,
      prerelease: false,
    });
  }
  const { data: currentPR } = await github.rest.pulls.get({ ...repo, pull_number: pr.number });
  if (currentPR.labels.some((label) => label.name === 'autorelease: pending')) {
    await github.rest.issues.removeLabel({
      ...repo,
      issue_number: pr.number,
      name: 'autorelease: pending',
    });
  }
  await github.rest.issues.addLabels({
    ...repo,
    issue_number: pr.number,
    labels: ['autorelease: tagged'],
  });
  await github.rest.actions.createWorkflowDispatch({
    ...repo,
    workflow_id: 'release-please.yml',
    ref: 'main',
  });
}

const commands = { select, manifest, attest, candidate: evidence, evidence, release };
const command = commands[process.argv[2]];
if (!command) throw new Error('unknown SDK release command');
await command();
