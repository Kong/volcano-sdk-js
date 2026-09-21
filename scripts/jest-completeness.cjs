class TestCompletenessReporter {
  constructor(globalConfig) {
    this.testNamePattern = globalConfig.testNamePattern
      ? new RegExp(globalConfig.testNamePattern, 'i')
      : undefined;
  }

  onRunStart() {
    this.error = undefined;
  }

  onRunComplete(_contexts, results) {
    const selected = results.testResults
      .flatMap((suite) => suite.testResults)
      .filter((test) => this.testNamePattern?.test(test.fullName) ?? true);
    const skipped = selected.filter((test) => test.status === 'pending').length;
    const todo = selected.filter((test) => test.status === 'todo').length;
    const retried = selected.filter((test) => test.invocations > 1).length;
    if (selected.length === 0 || skipped > 0 || todo > 0 || retried > 0) {
      this.error = new Error(
        `Incomplete test run: ${selected.length} selected, ` +
          `${skipped} skipped, ${todo} todo, ` +
          `${retried} retried. Every selected test must run without retries.`,
      );
      process.stderr.write(`${this.error.message}\n`);
    }
  }

  getLastError() {
    return this.error;
  }
}

module.exports = TestCompletenessReporter;
