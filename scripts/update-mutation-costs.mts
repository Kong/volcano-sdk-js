import { existsSync, readFileSync, writeFileSync } from 'node:fs';
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
// A mistyped or undownloaded artifact would otherwise leave its files' old
// costs in place while the refresh reports success.
function timings(path: string): MutantTiming[] {
  const measured = path.endsWith('.jsonl')
    ? parseMutantTimings(readFileSync(path, 'utf8'), path)
    : readMutantTimings(path);
  if (measured.length === 0) {
    throw new Error(`${path}: no mutant timings; check the artifact path`);
  }
  return measured;
}

const measured = inputs.flatMap((path) => timings(path));
// Entries for deleted or renamed files would otherwise stay forever.
const merged = mergeMutationCosts(readMutationCosts(), [timingCosts(measured)]);
const current = new Map([...merged].filter(([path]) => existsSync(path)));
writeFileSync(mutationCostsPath, formatMutationCosts(current));
process.stdout.write(`Updated ${mutationCostsPath} from ${String(measured.length)} mutant timings\n`);
