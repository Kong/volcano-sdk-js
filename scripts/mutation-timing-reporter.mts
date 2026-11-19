import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, relative } from 'node:path';

interface TestedMutant {
  fileName: string;
  location: { start: { line: number } };
}

const mutationTimingPath = 'reports/mutation-timing.json';

function sourcePath(fileName: string): string {
  return (isAbsolute(fileName) ? relative(process.cwd(), fileName) : fileName).replaceAll('\\', '/');
}

// Stryker reports neither when a mutant started nor how long it ran. Its
// worker pool stays full, so the wall time between consecutive results is each
// mutant's share of the shard, and the shares add up to the shard's run time.
// The file is rewritten after every result so a shard that times out still
// leaves the timings it measured.
export class MutationTimingReporter {
  static readonly inject = [] as const;
  readonly #costs = new Map<string, Map<number, number>>();
  readonly #now: () => number;
  readonly #output: string;
  #previous: number;

  constructor(now: () => number = () => performance.now(), output: string = mutationTimingPath) {
    this.#now = now;
    this.#output = output;
    this.#previous = now();
  }

  onMutationTestingPlanReady(): void {
    this.#previous = this.#now();
  }

  onMutantTested(result: TestedMutant): void {
    const now = this.#now();
    const path = sourcePath(result.fileName);
    const lines = this.#costs.get(path) ?? new Map<number, number>();
    const line = result.location.start.line;
    lines.set(line, (lines.get(line) ?? 0) + now - this.#previous);
    this.#costs.set(path, lines);
    this.#previous = now;
    this.#write();
  }

  #write(): void {
    const files = Object.fromEntries(
      [...this.#costs.entries()].map(([path, lines]) => [
        path,
        Object.fromEntries([...lines.entries()].map(([line, cost]) => [String(line), Math.round(cost)])),
      ]),
    );
    mkdirSync(dirname(this.#output), { recursive: true });
    writeFileSync(this.#output, `${JSON.stringify({ files })}\n`);
  }
}

export const strykerPlugins = [
  { kind: 'Reporter', name: 'mutation-timing', injectableClass: MutationTimingReporter },
] as const;
