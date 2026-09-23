import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, extname } from 'node:path';

const declarationFiles = [
  ['dist/typescript/database-filters.d.ts', 'dist/database-filters.d.ts'],
  ['dist/typescript/database-filters.d.ts', 'dist/database-filters.esm.d.mts', toEsmDeclaration],
  ['dist/typescript/errors.d.ts', 'dist/errors.d.ts'],
  ['dist/typescript/errors.d.ts', 'dist/errors.esm.d.mts', toEsmDeclaration],
  ['dist/typescript/database-connection-string.d.ts', 'dist/database-connection-string.d.ts'],
  [
    'dist/typescript/database-connection-string.d.ts',
    'dist/database-connection-string.esm.d.mts',
    toEsmDeclaration,
  ],
  ['dist/typescript/next/request.d.ts', 'dist/next/request.d.ts'],
  ['dist/typescript/next/request.d.ts', 'dist/next/request.esm.d.mts', toEsmDeclaration],
  ['src/index.d.ts', 'dist/index.d.ts'],
  ['src/index.d.ts', 'dist/index.esm.d.mts', toEsmDeclaration],
  ['src/generated/openapi.d.ts', 'dist/generated/openapi.d.ts'],
  ['src/generated/openapi.d.ts', 'dist/generated/openapi.esm.d.mts', toEsmDeclaration],
  ['dist/typescript/durable-types.d.ts', 'dist/durable-types.d.ts', toCjsDeclaration],
  ['dist/typescript/durable-types.d.ts', 'dist/durable-types.esm.d.mts', toEsmDeclaration],
  [
    'dist/typescript/durable-runtime-error.d.ts',
    'dist/durable-runtime-error.d.ts',
    toCjsDeclaration,
  ],
  [
    'dist/typescript/durable-runtime-error.d.ts',
    'dist/durable-runtime-error.esm.d.mts',
    toEsmDeclaration,
  ],
  ['dist/typescript/durable.d.ts', 'dist/durable.d.ts', toCjsDeclaration],
  ['dist/typescript/durable.d.ts', 'dist/durable.esm.d.mts', toEsmDeclaration],
  ['dist/typescript/next/middleware.d.ts', 'dist/next/middleware.d.ts', toCjsDeclaration],
  ['dist/typescript/next/middleware.d.ts', 'dist/next/middleware.esm.d.mts', toEsmDeclaration],
];

for (const filename of await readdir('dist/typescript')) {
  if (!filename.startsWith('realtime') || !filename.endsWith('.d.ts')) {
    continue;
  }
  const source = `dist/typescript/${filename}`;
  const stem = filename.slice(0, -'.d.ts'.length);
  declarationFiles.push(
    [source, `dist/${stem}.d.ts`, toCjsDeclaration],
    [source, `dist/${stem}.esm.d.mts`, toEsmDeclaration],
  );
}

for (const [source, target, transform] of declarationFiles) {
  await mkdir(dirname(target), { recursive: true });
  const declaration = await readFile(source, 'utf8');
  await writeFile(target, transform ? transform(declaration) : declaration);
}

await rm('dist/typescript', { recursive: true, force: true });

function toCjsDeclaration(declaration) {
  return declaration.replaceAll(/(from\s+['"])(\.{1,2}\/[^'"]+)\.ts(['"])/g, '$1$2$3');
}

function toEsmDeclaration(declaration) {
  return declaration
    .replaceAll(/(from\s+['"])(\.{1,2}\/[^'"]+)(['"])/g, replaceRelativeSpecifier)
    .replaceAll(/(import\(\s*['"])(\.{1,2}\/[^'"]+)(['"]\s*\))/g, replaceRelativeSpecifier);
}

function replaceRelativeSpecifier(_match, prefix, specifier, suffix) {
  if (specifier.endsWith('.js') || specifier.endsWith('.ts')) {
    return `${prefix}${specifier.slice(0, -3)}.esm.mjs${suffix}`;
  }
  if (extname(specifier)) {
    return `${prefix}${specifier}${suffix}`;
  }

  return `${prefix}${specifier}.esm.mjs${suffix}`;
}
