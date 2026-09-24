import { setTimeout as delay } from 'node:timers/promises';

export async function dispatchValidation(
  client,
  candidateRunID,
  artifactID,
  recordRun,
  { now = Date.now, sleep = delay, timeout = 330 * 60 * 1000 } = {},
) {
  if (!/^[1-9]\d*$/.test(String(candidateRunID)) || !/^[1-9]\d*$/.test(String(artifactID)))
    throw new Error('dispatch requires exact candidate run and artifact IDs');
  const hosting = { owner: 'Kong', repo: 'volcano-hosting' };
  const { data } = await client.request(
    'POST /repos/{owner}/{repo}/actions/workflows/{workflow_id}/dispatches',
    {
      ...hosting,
      workflow_id: 'staging-pipeline.yml',
      ref: 'main',
      inputs: {
        sdk_candidate_run_id: String(candidateRunID),
        sdk_candidate_artifact_id: String(artifactID),
      },
      headers: { 'X-GitHub-Api-Version': '2026-03-10' },
    },
  );
  if (!Number.isSafeInteger(data?.workflow_run_id))
    throw new Error('dispatch did not return a Hosting run ID');
  await recordRun(data.workflow_run_id);
  const deadline = now() + timeout;
  while (now() < deadline) {
    const { data: run } = await client.rest.actions.getWorkflowRun({
      ...hosting,
      run_id: data.workflow_run_id,
    });
    if (run.run_attempt !== 1) throw new Error('Hosting reruns are not release evidence');
    if (run.status === 'completed') {
      if (run.conclusion !== 'success')
        throw new Error(`Hosting validation ended ${run.conclusion}`);
      return;
    }
    await sleep(30_000);
  }
  throw new Error('Hosting validation timed out; recover using the original candidate');
}
