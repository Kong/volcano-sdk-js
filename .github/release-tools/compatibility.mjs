import { readFileSync, appendFileSync } from 'node:fs';
import { sdkGitHub } from './github.mjs';
import { isReleasePR } from './source-policy.mjs';

const repo = { owner: 'Kong', repo: 'volcano-sdk-js' };
const output = (key, value) => appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${value}\n`);

export async function findCandidate(github, sha) {
  const runs = await github.paginate(github.rest.actions.listWorkflowRuns, {
    ...repo,
    workflow_id: 'production-compatibility.yml',
    event: 'pull_request',
    head_sha: sha,
    per_page: 100,
  });
  for (const run of runs) {
    const artifacts = await github.paginate(github.rest.actions.listWorkflowRunArtifacts, {
      ...repo,
      run_id: run.id,
      per_page: 100,
    });
    const candidate = artifacts.find(
      (artifact) => artifact.name === 'sdk-candidate' && !artifact.expired,
    );
    if (candidate) return { run: run.id, artifact: candidate.id };
  }
  return null;
}

export async function select(github) {
  const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
  const number = event.pull_request?.number;
  if (!Number.isSafeInteger(number) || number < 1) throw new Error('release PR number required');
  const { data: pr } = await github.rest.pulls.get({ ...repo, pull_number: number });
  if (!isReleasePR(pr)) {
    if (pr.head.ref.startsWith('release-please--'))
      throw new Error('unexpected release PR identity');
    return output('selected', 'false');
  }
  if (pr.state !== 'open' && !pr.merged_at) throw new Error('release PR is closed without merging');
  if (event.pull_request && event.pull_request.head.sha !== pr.head.sha)
    throw new Error('release PR head changed');
  output('selected', 'true');
  output('source_sha', pr.head.sha);
  output('pull_request', pr.number);
  const existing = await findCandidate(github, pr.head.sha);
  if (!existing && pr.merged_at)
    throw new Error(
      'candidate missing or expired; update the open release PR to build a new candidate',
    );
  output('candidate_run_id', existing?.run ?? process.env.GITHUB_RUN_ID);
  output('candidate_artifact_id', existing?.artifact ?? '');
}

if (process.argv[1]?.endsWith('/compatibility.mjs')) {
  const action = { select }[process.argv[2]];
  if (!action) throw new Error('unknown compatibility command');
  await action(sdkGitHub());
}
