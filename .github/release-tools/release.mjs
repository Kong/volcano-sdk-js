import { createHash } from 'node:crypto';
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { dispatchValidation } from './dispatch.mjs';
import { isReleasePR, requireReviewedRelease } from './source-policy.mjs';
import { readCandidate, validateEvidence, requireCurrentValidation } from './evidence.mjs';
import { hostingGitHub, sdkGitHub } from './github.mjs';
import { checkReadiness } from './readiness.mjs';

const repo = { owner: 'Kong', repo: 'volcano-sdk-js' };
const hosting = { owner: 'Kong', repo: 'volcano-hosting' };
const json = (file) => JSON.parse(readFileSync(file, 'utf8'));
const save = (file, value) => writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
const output = (key, value) => appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${value}\n`);

async function mergedRelease(github, sha) {
  const prs = await github.paginate(github.rest.repos.listPullRequestsAssociatedWithCommit, {
    ...repo,
    commit_sha: sha,
    per_page: 100,
  });
  const matches = prs.filter(
    (pr) => isReleasePR(pr) && pr.merged_at && pr.merge_commit_sha === sha,
  );
  if (matches.length !== 1)
    throw new Error('source must be the merge commit of one reviewed Release Please PR');
  const { data: pr } = await github.rest.pulls.get({ ...repo, pull_number: matches[0].number });
  requireReviewedRelease(pr, sha);
  return pr;
}

async function select() {
  const event = json(process.env.GITHUB_EVENT_PATH);
  const github = sdkGitHub();
  let sha = process.env.GITHUB_SHA;
  let mode = 'release';
  let runID = process.env.GITHUB_RUN_ID;
  let artifactID = '';
  if (process.env.GITHUB_RUN_ATTEMPT !== '1')
    throw new Error('dispatch recovery with the original candidate run; never rebuild a rerun');
  if (process.env.GITHUB_EVENT_NAME === 'pull_request') {
    if (!isReleasePR(event.pull_request)) return output('selected', 'false');
    mode = 'pr';
    sha = event.pull_request.head.sha;
  } else if (process.env.GITHUB_EVENT_NAME === 'workflow_dispatch') {
    if (process.env.GITHUB_REF !== 'refs/heads/main')
      throw new Error('recovery must use the trusted main workflow');
    runID = event.inputs.candidate_run_id;
    if (!/^[1-9]\d*$/.test(runID))
      throw new Error('recovery requires the original candidate run ID');
    const { data: run } = await github.rest.actions.getWorkflowRun({ ...repo, run_id: runID });
    if (
      run.path !== '.github/workflows/publish.yml' ||
      run.event !== 'push' ||
      run.head_branch !== 'main' ||
      run.run_attempt !== 1
    )
      throw new Error('invalid recovery build run');
    sha = run.head_sha;
    await mergedRelease(github, sha);
    const artifacts = await github.paginate(github.rest.actions.listWorkflowRunArtifacts, {
      ...repo,
      run_id: runID,
      per_page: 100,
    });
    const found = artifacts.filter(
      (artifact) => artifact.name === 'sdk-candidate' && !artifact.expired,
    );
    if (found.length !== 1)
      throw new Error('candidate artifact missing or expired; no rebuild is permitted');
    artifactID = found[0].id;
  } else {
    const prs = await github.paginate(github.rest.repos.listPullRequestsAssociatedWithCommit, {
      ...repo,
      commit_sha: sha,
      per_page: 100,
    });
    if (!prs.some((pr) => isReleasePR(pr) && pr.merge_commit_sha === sha && pr.merged_at)) {
      return output('selected', 'false');
    }
    await mergedRelease(github, sha);
  }
  output('selected', 'true');
  output('source_sha', sha);
  output('mode', mode);
  output('candidate_run_id', runID);
  output('candidate_artifact_id', artifactID);
}

function manifest() {
  const packageInfo = json('package.json');
  if (packageInfo.version !== json('.release-please-manifest.json')['.'])
    throw new Error('Release Please version mismatch');
  save('package/candidate.json', {
    schema: 1,
    repository: 'Kong/volcano-sdk-js',
    source_sha: process.env.SOURCE_SHA,
    run_id: Number(process.env.GITHUB_RUN_ID),
    run_attempt: 1,
    version: packageInfo.version,
    filename: 'sdk.tgz',
    sha256: createHash('sha256').update(readFileSync('package/sdk.tgz')).digest('hex'),
    backend: json('backend-requirements.json'),
  });
}

async function validateSource(github, candidate, mode) {
  if (mode === 'release') return mergedRelease(github, candidate.source_sha);
  const event = json(process.env.GITHUB_EVENT_PATH);
  const { data: pr } = await github.rest.pulls.get({
    ...repo,
    pull_number: event.pull_request.number,
  });
  if (!isReleasePR(pr) || pr.state !== 'open' || pr.head.sha !== candidate.source_sha) {
    throw new Error('release PR changed; old acceptance cannot approve its new head');
  }
  return pr;
}

async function dispatchAndWait() {
  const client = await hostingGitHub('write');
  const candidate = readCandidate('package');
  if (candidate.run_id !== Number(process.env.CANDIDATE_RUN))
    throw new Error('candidate does not match the selected build run');
  await validateSource(sdkGitHub(), candidate, process.env.RELEASE_MODE);
  await dispatchValidation(
    client,
    process.env.CANDIDATE_RUN,
    process.env.CANDIDATE_ARTIFACT,
    (runID) => {
      output('hosting_run_id', runID);
      save('hosting-run.json', {
        run_id: runID,
        candidate_artifact_id: process.env.CANDIDATE_ARTIFACT,
      });
    },
  );
}

async function evidence() {
  const github = await hostingGitHub();
  const candidate = readCandidate('package');
  const runID = Number(process.env.HOSTING_RUN_ID);
  const [{ data: run }, jobs] = await Promise.all([
    github.rest.actions.getWorkflowRun({ ...hosting, run_id: runID }),
    github.paginate(github.rest.actions.listJobsForWorkflowRunAttempt, {
      ...hosting,
      run_id: runID,
      attempt_number: 1,
      per_page: 100,
    }),
  ]);
  validateEvidence(
    json('acceptance/evidence.json'),
    candidate,
    process.env.CANDIDATE_ARTIFACT,
    run,
    jobs,
  );
  const { data: recent } = await github.rest.actions.listWorkflowRuns({
    ...hosting,
    workflow_id: 'staging-pipeline.yml',
    branch: 'main',
    per_page: 1,
  });
  requireCurrentValidation(run, recent.workflow_runs[0]);
  for (const file of ['report.json', 'selection.json', 'staging-before.json', 'staging-after.json'])
    json(path.join('acceptance', file));
  await validateSource(sdkGitHub(), candidate, process.env.RELEASE_MODE);
}

async function readiness() {
  const candidate = readCandidate('package');
  await validateSource(sdkGitHub(), candidate, process.env.RELEASE_MODE);
  save('production-readiness.json', await checkReadiness(await hostingGitHub(), candidate.backend));
}

async function release() {
  const github = sdkGitHub();
  const candidate = readCandidate('package');
  const pr = await validateSource(github, candidate, 'release');
  const tag = `v${candidate.version}`;
  try {
    const { data: ref } = await github.rest.git.getRef({ ...repo, ref: `tags/${tag}` });
    if (ref.object.type !== 'commit' || ref.object.sha !== candidate.source_sha)
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
    if (ref.object.sha !== candidate.source_sha || existing.draft || existing.prerelease)
      throw new Error('existing release identity mismatch');
  } else {
    await github.rest.repos.createRelease({
      ...repo,
      tag_name: tag,
      target_commitish: candidate.source_sha,
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

const commands = { select, manifest, wait: dispatchAndWait, evidence, readiness, release };
const command = commands[process.argv[2]];
if (!command) throw new Error('unknown SDK release command');
await command();
