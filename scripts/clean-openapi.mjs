import { rmSync } from 'node:fs';

for (const generatedPath of [
  'src/generated/client.ts',
  'src/generated/model',
  'src/generated/openapi.d.ts',
  'src/generated-runtime',
]) {
  rmSync(generatedPath, { force: true, recursive: true });
}
