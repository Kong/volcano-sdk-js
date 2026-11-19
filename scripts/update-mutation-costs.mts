import { readFileSync, writeFileSync } from 'node:fs';
import { formatMutationCosts, mergeMutationCosts, mutationCostsPath, readMutationCosts } from './mutation-costs.mts';
import { type MutantTiming, parseMutantTimings, readMutantTimings, timingCosts } from './mutation-timing.mts';

// Usage: node .quality-tools/update-mutation-costs.mjs <timing directory or .jsonl file>...
// Pass every downloaded mutation-timing-node-22-shard-<n> artifact from one full run.
const inputs = process.argv.slice(2);
if (inputs.length === 0) {
  throw new Error('Pass the mutation-timing artifact directories or .jsonl files from a full mutation run');
}

// Decides by name rather than checking the path first, which a concurrent
// change could invalidate between the check and the read.
function timings(path: string): MutantTiming[] {
  return path.endsWith('.jsonl') ? parseMutantTimings(readFileSync(path, 'utf8'), path) : readMutantTimings(path);
}

const measured = inputs.flatMap((path) => timings(path));
writeFileSync(mutationCostsPath, formatMutationCosts(mergeMutationCosts(readMutationCosts(), [timingCosts(measured)])));
process.stdout.write(`Updated ${mutationCostsPath} from ${String(measured.length)} mutant timings\n`);
