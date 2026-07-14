import { spawnSync } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const expectedDirectory = join(repositoryRoot, 'src/generated/api');
const temporaryRoot = await mkdtemp(join(repositoryRoot, '.openapi-check-'));
const actualDirectory = join(temporaryRoot, 'api');
const generator = join(repositoryRoot, 'node_modules/@hey-api/openapi-ts/bin/run.js');

try {
  const result = spawnSync(process.execPath, [generator], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      OPENAPI_OUTPUT: actualDirectory,
    },
  });

  if (result.status !== 0) {
    throw new Error(`OpenAPI generation failed:\n${result.stdout}${result.stderr}`);
  }

  const [expectedFiles, actualFiles] = await Promise.all([
    listFiles(expectedDirectory),
    listFiles(actualDirectory),
  ]);

  if (expectedFiles.join('\n') !== actualFiles.join('\n')) {
    throw new Error('Generated OpenAPI file list differs. Run pnpm generate:openapi.');
  }

  for (const file of expectedFiles) {
    const [expected, actual] = await Promise.all([
      readFile(join(expectedDirectory, file)),
      readFile(join(actualDirectory, file)),
    ]);

    if (!expected.equals(actual)) {
      throw new Error(`Generated OpenAPI file differs: ${file}. Run pnpm generate:openapi.`);
    }
  }
} finally {
  await rm(temporaryRoot, { force: true, recursive: true });
}

async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true, recursive: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => relative(directory, join(entry.parentPath, entry.name)))
    .sort();
}
