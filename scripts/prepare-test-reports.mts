import { mkdir, rm } from 'node:fs/promises';

await mkdir('reports', { recursive: true });
await rm('reports/unit.json', { force: true });
