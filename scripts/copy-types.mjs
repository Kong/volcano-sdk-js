import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, extname } from 'node:path';

const declarationFiles = [
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
  ['src/realtime.d.ts', 'dist/realtime.d.ts'],
  ['src/realtime.d.ts', 'dist/realtime.esm.d.mts', toEsmDeclaration],
  ['src/durable.d.ts', 'dist/durable.d.ts'],
  ['src/durable.d.ts', 'dist/durable.esm.d.mts', toEsmDeclaration],
  ['src/next/middleware.d.ts', 'dist/next/middleware.d.ts'],
  ['src/next/middleware.d.ts', 'dist/next/middleware.esm.d.mts', toEsmDeclaration],
];

for (const [source, target, transform] of declarationFiles) {
  await mkdir(dirname(target), { recursive: true });
  const declaration = await readFile(source, 'utf8');
  await writeFile(target, transform ? transform(declaration) : declaration);
}

await rm('dist/typescript', { recursive: true, force: true });

function toEsmDeclaration(declaration) {
  return declaration
    .replaceAll(/(from\s+['"])(\.{1,2}\/[^'"]+)(['"])/g, replaceRelativeSpecifier)
    .replaceAll(/(import\(\s*['"])(\.{1,2}\/[^'"]+)(['"]\s*\))/g, replaceRelativeSpecifier);
}

function replaceRelativeSpecifier(_match, prefix, specifier, suffix) {
  if (extname(specifier)) {
    return `${prefix}${specifier}${suffix}`;
  }

  return `${prefix}${specifier}.esm.mjs${suffix}`;
}
