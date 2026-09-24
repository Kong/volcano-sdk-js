import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('release workflow requires complete validation and never rebuilds in the publisher', () => {
  const source = readFileSync(new URL('../workflows/publish.yml', import.meta.url), 'utf8');
  const gate = source.slice(source.indexOf('  release-gate:'), source.indexOf('  publish:'));
  assert.match(gate, /if: always\(\)/);
  assert.match(gate, /test "\$SELECT_RESULT" = success/);
  assert.match(gate, /test "\$ACCEPTANCE_RESULT" = success/);
  const publisher = source.slice(source.indexOf('  publish:'), source.indexOf('  smoke:'));
  const builder = source.slice(source.indexOf('  build:'), source.indexOf('  acceptance:'));
  assert.match(builder, /github.event_name != 'workflow_dispatch'/);
  assert.match(builder, /ref: \$\{\{ github.event.pull_request.head.sha \|\| github.sha \}\}/);
  assert.match(builder, /test "\$\(git rev-parse HEAD\)" = "\$SOURCE_SHA"/);
  assert.match(publisher, /needs: \[select, acceptance, release-gate\]/);
  assert.match(publisher, /environment: npm-production/);
  assert.match(publisher, /ref: \$\{\{ github.sha \}\}/);
  assert.doesNotMatch(publisher, /pnpm build|npm pack|test:package/);
  assert.ok(publisher.indexOf('release.mjs evidence') < publisher.indexOf('publish.mjs'));
  assert.doesNotMatch(
    source.slice(source.indexOf('  smoke:')),
    /id-token: write|HOSTING_APP_PRIVATE_KEY/,
  );
  assert.doesNotMatch(
    source.slice(0, source.indexOf('permissions:')),
    /release:\s*types: \[published\]/,
  );
  const please = readFileSync(new URL('../workflows/release-please.yml', import.meta.url), 'utf8');
  assert.match(please, /skip-github-release: true/);
  assert.match(please, /autorelease: pending/);
  assert.doesNotMatch(please, /pr merge|--auto/);
});
