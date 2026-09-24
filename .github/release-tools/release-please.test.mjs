import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { Manifest } from 'release-please';

test('Release Please preserves two release boundaries while a merged candidate is held', async () => {
  const zero = '0'.repeat(40);
  const firstSource = '1'.repeat(40);
  const firstMerge = '2'.repeat(40);
  const nextSource = '3'.repeat(40);
  let version = '1.15.0';
  let releases = [{ tagName: 'v1.15.0', sha: zero, notes: '' }];
  let commits = [
    { sha: firstSource, message: 'feat: first capability', files: ['src/index.js'] },
    { sha: zero, message: 'chore: release 1.15.0', files: ['package.json'] },
  ];
  let pending = [];
  const github = {
    repository: { owner: 'Kong', repo: 'volcano-sdk-js' },
    async *releaseIterator() {
      yield* releases;
    },
    async *tagIterator() {
      yield* releases.map((release) => ({ name: release.tagName, sha: release.sha }));
    },
    async *mergeCommitIterator() {
      yield* commits;
    },
    async *pullRequestIterator(_branch, state) {
      if (state === 'MERGED') yield* pending;
    },
    async getFileJson(file) {
      return file === '.release-please-manifest.json'
        ? { '.': version }
        : JSON.parse(
            readFileSync(new URL('../../release-please-config.json', import.meta.url), 'utf8'),
          );
    },
    async getFileContentsOnBranch() {
      return { parsedContent: JSON.stringify({ name: '@volcano.dev/sdk', version }) };
    },
    async createReleasePullRequest() {
      assert.fail('a held merged candidate must prevent another release PR');
    },
  };
  const manifest = () =>
    Manifest.fromManifest(github, 'main', undefined, undefined, {
      logger: { info() {}, warn() {}, debug() {}, error() {} },
    });
  const [first] = await (await manifest()).buildPullRequests();
  assert.equal(first.version.toString(), '1.16.0');
  assert.match(first.body.toString(), /first capability/);
  version = '1.16.0';
  pending = [
    {
      number: 1,
      title: first.title.toString(),
      body: first.body.toString(),
      labels: ['autorelease: pending'],
      sha: firstMerge,
    },
  ];
  commits = [
    { sha: nextSource, message: 'fix: next client correction', files: ['src/index.js'] },
    { sha: firstMerge, message: 'chore: release 1.16.0', files: ['package.json'] },
    ...commits,
  ];
  assert.deepEqual(await (await manifest()).createPullRequests(), []);
  // The SDK publisher creates this exact version/tag only after production compatibility and a manual merge.
  releases = [{ tagName: 'v1.16.0', sha: firstMerge, notes: first.body.toString() }, ...releases];
  pending = [];
  const [second] = await (await manifest()).buildPullRequests();
  assert.equal(second.version.toString(), '1.16.1');
  assert.match(second.body.toString(), /next client correction/);
  assert.doesNotMatch(second.body.toString(), /first capability/);
});
