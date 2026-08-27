import { execFileSync } from 'node:child_process';
import { rmSync } from 'node:fs';

const pnpm = process.env.npm_execpath || 'pnpm';

for (const generatedPath of [
  'src/generated/client.ts',
  'src/generated/model',
  'src/generated/openapi.d.ts',
  'src/generated-runtime',
]) {
  rmSync(generatedPath, { force: true, recursive: true });
}

execFileSync(pnpm, ['exec', 'orval', '--config', 'orval.config.mjs'], {
  stdio: 'inherit',
});
execFileSync(pnpm, ['exec', 'tsc', '-p', 'tsconfig.generated.json'], {
  stdio: 'inherit',
});
