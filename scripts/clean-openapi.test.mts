import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const cleaner = fileURLToPath(new URL('clean-openapi.mjs', import.meta.url));
const checker = fileURLToPath(new URL('check-openapi.mjs', import.meta.url));

await test('regeneration exposes handwritten files added to generated directories', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'sdk-generated-provenance-'));
  try {
    const generated = join(directory, 'src/generated');
    await mkdir(generated, { recursive: true });
    await writeFile(join(generated, 'handwritten.ts'), 'export const hidden = true;\n');
    execFileSync('/usr/bin/git', ['init', '-q'], { cwd: directory });
    execFileSync('/usr/bin/git', ['add', 'src/generated/handwritten.ts'], { cwd: directory });

    execFileSync(process.execPath, [cleaner], { cwd: directory });

    const status = execFileSync(
      '/usr/bin/git',
      ['status', '--porcelain=v1', '--', 'src/generated'],
      {
        cwd: directory,
        encoding: 'utf8',
      },
    );
    assert.equal(status, 'AD src/generated/handwritten.ts\n');
    const check = spawnSync(process.execPath, [checker], { cwd: directory, encoding: 'utf8' });
    assert.equal(check.status, 1);
    assert.match(check.stderr, /Generated OpenAPI files are not up to date/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
