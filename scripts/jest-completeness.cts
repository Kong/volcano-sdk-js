import type { AggregatedResult, Reporter, TestContext } from '@jest/reporters';
import type { Config } from '@jest/types';

class TestCompletenessReporter implements Reporter {
  private readonly testNamePattern: RegExp | undefined;
  private error: Error | undefined;

  constructor(globalConfig: Config.GlobalConfig) {
    this.testNamePattern =
      globalConfig.testNamePattern === undefined || globalConfig.testNamePattern === ''
        ? undefined
        : new RegExp(globalConfig.testNamePattern, 'i');
  }

  onRunStart(): void {
    this.error = undefined;
  }

  onRunComplete(_contexts: Set<TestContext>, results: AggregatedResult): void {
    const selected = results.testResults
      .flatMap((suite) => suite.testResults)
      .filter((test) => this.testNamePattern?.test(test.fullName) ?? true);
    const skipped = selected.filter((test) => test.status === 'pending').length;
    const todo = selected.filter((test) => test.status === 'todo').length;
    const retried = selected.filter((test) => (test.invocations ?? 1) > 1).length;
    if (selected.length === 0 || skipped > 0 || todo > 0 || retried > 0) {
      this.error = new Error(
        `Incomplete test run: ${String(selected.length)} selected, ` +
          `${String(skipped)} skipped, ${String(todo)} todo, ` +
          `${String(retried)} retried. Every selected test must run without retries.`,
      );
      process.stderr.write(`${this.error.message}\n`);
    }
  }

  getLastError(): Error | undefined {
    return this.error;
  }
}

export = TestCompletenessReporter;
