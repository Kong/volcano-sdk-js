import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { findCandidate, select } from './compatibility.mjs';

test('compatibility refresh reuses an unexpired package from the exact release PR head', async () => {
  const runs = () => {};
  const artifacts = () => {};
  const github = {
    rest: { actions: { listWorkflowRuns: runs, listWorkflowRunArtifacts: artifacts } },
    paginate: async (method, args) => {
      if (method === runs) {
        assert.equal(args.head_sha, 'source');
        assert.equal(args.event, 'pull_request');
        assert.equal(args.workflow_id, 'production-compatibility.yml');
        return [{ id: 3 }, { id: 2 }];
      }
      return [{ name: 'sdk-candidate', id: 7, expired: args.run_id === 3 }];
    },
  };
  assert.deepEqual(await findCandidate(github, 'source'), { run: 2, artifact: 7 });
  github.paginate = async () => [];
  assert.equal(await findCandidate(github, 'source'), null);
});

test('merged release recovery cannot rebuild a missing candidate or accept a moved PR head', async () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'sdk-select-'));
  const saved = { ...process.env };
  try {
    process.env.GITHUB_EVENT_PATH = path.join(directory, 'event.json');
    process.env.GITHUB_OUTPUT = path.join(directory, 'output');
    process.env.GITHUB_RUN_ID = '99';
    const pr = {
      number: 4,
      state: 'closed',
      merged_at: '2026-09-24',
      head: {
        sha: 'a'.repeat(40),
        repo: { full_name: 'Kong/volcano-sdk-js' },
        ref: 'release-please--branches--main--components--@volcano.dev/sdk',
      },
      base: { ref: 'main' },
      user: { login: 'kong-volcano-app[bot]' },
    };
    writeFileSync(process.env.GITHUB_EVENT_PATH, JSON.stringify({ pull_request: pr }));
    const github = {
      rest: {
        pulls: { get: async () => ({ data: pr }) },
        actions: {
          listWorkflowRuns() {},
          listWorkflowRunArtifacts() {},
        },
      },
      paginate: async () => [],
    };
    await assert.rejects(select(github), /candidate missing or expired/);
    pr.merged_at = null;
    pr.state = 'open';
    writeFileSync(process.env.GITHUB_OUTPUT, '');
    await select(github);
    assert.match(readFileSync(process.env.GITHUB_OUTPUT, 'utf8'), /candidate_run_id=99/);
    pr.head.sha = 'b'.repeat(40);
    await assert.rejects(select(github), /head changed/);
  } finally {
    for (const key of ['GITHUB_EVENT_PATH', 'GITHUB_OUTPUT', 'GITHUB_RUN_ID']) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
    rmSync(directory, { recursive: true, force: true });
  }
});
