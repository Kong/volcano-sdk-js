import assert from 'node:assert/strict';
import test from 'node:test';
import { dispatchValidation } from './dispatch.mjs';
import { requireReviewedRelease } from './source-policy.mjs';

test('dispatch records returned Hosting run and pins exact cross-repository candidate identity', async () => {
  const recorded = [];
  const client = {
    request: async (route, args) => {
      assert.match(route, /dispatches$/);
      assert.equal(args.owner, 'Kong');
      assert.equal(args.repo, 'volcano-hosting');
      assert.equal(args.workflow_id, 'staging-pipeline.yml');
      assert.equal(args.ref, 'main');
      assert.deepEqual(args.inputs, {
        sdk_candidate_run_id: '12',
        sdk_candidate_artifact_id: '34',
      });
      return { data: { workflow_run_id: 56 } };
    },
    rest: {
      actions: {
        getWorkflowRun: async (args) => {
          assert.deepEqual(recorded, [56]);
          assert.equal(args.run_id, 56);
          return { data: { run_attempt: 1, status: 'completed', conclusion: 'success' } };
        },
      },
    },
  };
  await dispatchValidation(client, 12, 34, (id) => recorded.push(id));
  for (const invalid of ['', '12-extra', 'secret']) {
    await assert.rejects(
      dispatchValidation(client, invalid, 34, () => {}),
      /exact candidate/,
    );
    await assert.rejects(
      dispatchValidation(client, 12, invalid, () => {}),
      /exact candidate/,
    );
  }
  client.request = async () => ({ data: undefined });
  await assert.rejects(
    dispatchValidation(client, 12, 34, () => {}),
    /run ID/,
  );
  client.request = async () => ({ data: { workflow_run_id: 56 } });
  for (const run of [
    { run_attempt: 2 },
    { run_attempt: 1, status: 'completed', conclusion: 'failure' },
    { run_attempt: 1, status: 'completed', conclusion: 'skipped' },
  ]) {
    client.rest.actions.getWorkflowRun = async () => ({ data: run });
    await assert.rejects(dispatchValidation(client, 12, 34, () => {}));
  }
});

test('publication cannot use an unmerged, automated, unrelated or stale release PR', () => {
  const sha = 'a'.repeat(40);
  const pr = {
    head: {
      repo: { full_name: 'Kong/volcano-sdk-js' },
      ref: 'release-please--branches--main--components--@volcano.dev/sdk',
    },
    base: { ref: 'main' },
    user: { login: 'kong-volcano-app[bot]' },
    merged_at: '2026-09-24',
    merge_commit_sha: sha,
    merged_by: { type: 'User' },
    auto_merge: null,
  };
  requireReviewedRelease(pr, sha);
  for (const patch of [
    { merged_at: null },
    { merged_by: { type: 'Bot' } },
    { merge_commit_sha: 'b'.repeat(40) },
    { auto_merge: {} },
    { user: { login: 'someone' } },
  ]) {
    assert.throws(() => requireReviewedRelease({ ...pr, ...patch }, sha));
  }
});
