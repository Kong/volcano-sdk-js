import { rmSync } from 'node:fs';

for (const generatedPath of ['src/generated', 'src/generated-runtime']) {
  rmSync(generatedPath, { force: true, recursive: true });
}
