import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, extname, relative, resolve } from 'node:path';

const declarationFiles = [
  ['src/generated/openapi.d.ts', 'dist/generated/openapi.d.ts'],
  ['src/generated/openapi.d.ts', 'dist/generated/openapi.esm.d.mts', toEsmDeclaration],
];

const emitted = await emittedDeclarations('dist/typescript');
const emittedStems = new Set(emitted.map((file) => resolve(file.slice(0, -'.d.ts'.length))));
for (const source of emitted) {
  const stem = relative('dist/typescript', source).slice(0, -'.d.ts'.length);
  declarationFiles.push(
    [source, `dist/${stem}.d.ts`, toCjsDeclaration],
    [source, `dist/${stem}.esm.d.mts`, toEsmDeclaration],
  );
}

for (const [source, target, transform] of declarationFiles) {
  await mkdir(dirname(target), { recursive: true });
  const declaration = await readFile(source, 'utf8');
  await writeFile(target, transform ? transform(declaration, source, emittedStems) : declaration);
}

await rm('dist/typescript', { recursive: true, force: true });

async function emittedDeclarations(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory()) {
      files.push(...(await emittedDeclarations(path)));
    } else if (entry.name.endsWith('.d.ts')) {
      files.push(path);
    }
  }
  return files;
}

function toCjsDeclaration(declaration) {
  return declaration
    .replaceAll(/(from\s+['"])(\.{1,2}\/[^'"]+)\.ts(['"])/g, '$1$2$3')
    .replaceAll(/(import\(\s*['"])(\.{1,2}\/[^'"]+)\.ts(['"]\s*\))/g, '$1$2$3');
}

function toEsmDeclaration(declaration, source, stems) {
  return declaration
    .replaceAll(/(from\s+['"])(\.{1,2}\/[^'"]+)(['"])/g, (...match) =>
      replaceRelativeSpecifier(...match, source, stems),
    )
    .replaceAll(/(import\(\s*['"])(\.{1,2}\/[^'"]+)(['"]\s*\))/g, (...match) =>
      replaceRelativeSpecifier(...match, source, stems),
    );
}

function replaceRelativeSpecifier(
  _match,
  prefix,
  specifier,
  suffix,
  _offset,
  _input,
  source,
  stems,
) {
  if (specifier.endsWith('.js') || specifier.endsWith('.ts')) {
    return `${prefix}${specifier.slice(0, -3)}.esm.mjs${suffix}`;
  }
  if (extname(specifier)) {
    return `${prefix}${specifier}${suffix}`;
  }

  if (stems.has(resolve(dirname(source), specifier, 'index'))) {
    return `${prefix}${specifier}/index.esm.mjs${suffix}`;
  }

  return `${prefix}${specifier}.esm.mjs${suffix}`;
}
