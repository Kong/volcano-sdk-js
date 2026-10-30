import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { driftRows, driftTable, requireExactPins, runtimeClosure } from './fresh-install.mts';

function install(directory: string, manifest: Record<string, unknown>): void {
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, 'package.json'), JSON.stringify(manifest));
}

function withTree(check: (root: string) => void): void {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'volcano-fresh-install-test-')));
  try {
    install(join(root, 'node_modules/sdk-runtime'), {
      version: '1.2.0',
      dependencies: { shared: '^2.0.0', '@types/node': '*' },
      optionalDependencies: { 'not-installed': '^1.0.0' },
      peerDependencies: { 'missing-peer': '^1.0.0' },
    });
    install(join(root, 'node_modules/shared'), { version: '2.1.0' });
    install(join(root, 'node_modules/@types/node'), { version: '26.0.0' });
    install(join(root, 'node_modules/transport'), { version: '8.0.0', dependencies: { shared: '^1.0.0' } });
    install(join(root, 'node_modules/transport/node_modules/shared'), { version: '1.4.0' });
    check(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

await test('collects each version Node loads, nested copies included, without type declarations', () => {
  withTree((root) => {
    const closure = runtimeClosure(root, { dependencies: { 'sdk-runtime': '1.2.0', transport: '^8.0.0' } });
    assert.deepEqual(
      closure,
      new Map([
        ['sdk-runtime', ['1.2.0']],
        ['transport', ['8.0.0']],
        ['shared', ['1.4.0', '2.1.0']],
      ]),
    );
  });
});

await test('rejects a missing dependency but not a missing optional or peer', () => {
  withTree((root) => {
    assert.throws(() => runtimeClosure(root, { dependencies: { absent: '^1.0.0' } }), /cannot load absent/u);
    assert.deepEqual(
      runtimeClosure(root, { optionalDependencies: { absent: '^1.0.0' }, peerDependencies: { other: '>=1 <2' } }),
      new Map(),
    );
  });
});

await test('requires exact pins to load at their pinned version and ignores ranges', () => {
  withTree((root) => {
    requireExactPins(root, { 'sdk-runtime': '1.2.0', shared: '^2.0.0', transport: '>=8 <9' });
    assert.throws(() => {
      requireExactPins(root, { 'sdk-runtime': '1.1.0' });
    }, /sdk-runtime is pinned to 1\.1\.0, but .* loads 1\.2\.0/u);
    assert.throws(() => {
      requireExactPins(root, { absent: '1.0.0' });
    }, /absent is pinned to 1\.0\.0, but .* loads nothing/u);
  });
});

await test('marks packages whose fresh versions differ from the lock', () => {
  const rows = driftRows(
    new Map([
      ['same', ['1.0.0']],
      ['moved', ['1.0.0']],
      ['dropped', ['1.0.0']],
    ]),
    new Map([
      ['same', ['1.0.0']],
      ['moved', ['1.1.0']],
      ['added', ['2.0.0']],
    ]),
  );
  assert.deepEqual(rows, [
    { name: 'added', lock: 'none', fresh: '2.0.0', drift: true },
    { name: 'dropped', lock: '1.0.0', fresh: 'none', drift: true },
    { name: 'moved', lock: '1.0.0', fresh: '1.1.0', drift: true },
    { name: 'same', lock: '1.0.0', fresh: '1.0.0', drift: false },
  ]);
  assert.equal(
    driftTable(rows.slice(2)),
    [
      '| Package | Lock | Fresh install | |',
      '| --- | --- | --- | --- |',
      '| `moved` | 1.0.0 | 1.1.0 | drift |',
      '| `same` | 1.0.0 | 1.0.0 |  |',
    ].join('\n'),
  );
});
