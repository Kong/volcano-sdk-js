import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname, isAbsolute, join, relative } from 'node:path';
import {
  formatMutantTiming,
  type MutantTiming,
  mutationTimingDirectory,
  projectRootVariable,
  slowMutantMs,
} from './mutation-timing.mts';
import { isRecord } from './values.mts';

// The subset of Stryker's TestRunner API this wrapper reads. Importing the
// real types pulls in declarations from Stryker's dependencies that fail this
// repository's strict compiler settings.
interface MutantRunOptions {
  activeMutant: { fileName: string; mutatorName: string; location: { start: { line: number } } };
}

interface MutantRunResult {
  status: string;
  nrOfTests?: number;
}

export interface TestRunner {
  capabilities: () => unknown;
  init?: () => Promise<void>;
  dryRun: (options: unknown) => Promise<unknown>;
  mutantRun: (options: MutantRunOptions) => Promise<MutantRunResult>;
  dispose?: () => Promise<void>;
}

interface Injector {
  injectFunction: (factory: unknown) => unknown;
}

interface Logger {
  info: (message: string) => void;
}

function sourcePath(root: string, fileName: string): string {
  return (isAbsolute(fileName) ? relative(root, fileName) : fileName).replaceAll('\\', '/');
}

// Times each mutant inside the worker that runs it, which a reporter cannot:
// Stryker reports results without start times, from several workers at once.
export class TimedTestRunner implements TestRunner {
  readonly #inner: TestRunner;
  readonly #log: Logger;
  readonly #root: string;
  readonly #output: string | undefined;
  readonly #now: () => number;

  constructor(inner: TestRunner, log: Logger, root: string | undefined, now: () => number = () => performance.now()) {
    this.#inner = inner;
    this.#log = log;
    this.#root = root ?? process.cwd();
    this.#output = root === undefined ? undefined : join(root, mutationTimingDirectory, `${String(process.pid)}.jsonl`);
    this.#now = now;
  }

  capabilities(): unknown {
    return this.#inner.capabilities();
  }

  async init(): Promise<void> {
    await this.#inner.init?.();
  }

  async dryRun(options: unknown): Promise<unknown> {
    return this.#inner.dryRun(options);
  }

  async mutantRun(options: MutantRunOptions): Promise<MutantRunResult> {
    const started = this.#now();
    const result = await this.#inner.mutantRun(options);
    const { activeMutant } = options;
    const timing: MutantTiming = {
      file: sourcePath(this.#root, activeMutant.fileName),
      line: activeMutant.location.start.line + 1,
      mutator: activeMutant.mutatorName,
      ms: Math.round(this.#now() - started),
      tests: result.nrOfTests ?? 0,
      status: result.status,
    };
    if (this.#output !== undefined) {
      mkdirSync(dirname(this.#output), { recursive: true });
      appendFileSync(this.#output, `${JSON.stringify(timing)}\n`);
    }
    if (timing.ms >= slowMutantMs) {
      this.#log.info(`Slow mutant ${formatMutantTiming(timing)}`);
    }
    return result;
  }

  async dispose(): Promise<void> {
    await this.#inner.dispose?.();
  }
}

function isTestRunner(value: unknown): value is TestRunner {
  return isRecord(value) && typeof value['mutantRun'] === 'function' && typeof value['dryRun'] === 'function';
}

const jestRunnerModule: string = '@stryker-mutator/jest-runner';
const jestRunner: unknown = await import(jestRunnerModule);
const jestPlugins: unknown = isRecord(jestRunner) ? jestRunner['strykerPlugins'] : undefined;
const jestPlugin: unknown = Array.isArray(jestPlugins)
  ? jestPlugins.find((plugin: unknown) => isRecord(plugin) && plugin['name'] === 'jest')
  : undefined;
const jestFactory: unknown = isRecord(jestPlugin) ? jestPlugin['factory'] : undefined;

function timedJestFactory(injector: Injector, log: Logger): TestRunner {
  const inner = injector.injectFunction(jestFactory);
  if (!isTestRunner(inner)) {
    throw new Error('@stryker-mutator/jest-runner did not create a test runner');
  }
  return new TimedTestRunner(inner, log, process.env[projectRootVariable]);
}
timedJestFactory.inject = ['$injector', 'logger'] as const;

export const strykerPlugins = [{ kind: 'TestRunner', name: 'timed-jest', factory: timedJestFactory }] as const;
