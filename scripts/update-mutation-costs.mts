import { readFileSync, writeFileSync } from 'node:fs';
import {
  formatMutationCosts,
  mergeMutationCosts,
  mutationCostsPath,
  parseMutationCosts,
  readMutationCosts,
} from './mutation-costs.mts';

// Usage: node .quality-tools/update-mutation-costs.mjs <mutation-timing.json>...
const inputs = process.argv.slice(2);
if (inputs.length === 0) {
  throw new Error('Pass the mutation-timing.json files from a full mutation run');
}
const timings = inputs.map((path) => parseMutationCosts(readFileSync(path, 'utf8')));
writeFileSync(mutationCostsPath, formatMutationCosts(mergeMutationCosts(readMutationCosts(), timings)));
process.stdout.write(`Updated ${mutationCostsPath} from ${String(inputs.length)} timing file(s)\n`);
