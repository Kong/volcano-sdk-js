class TestCompletenessReporter {
  onRunStart() {
    this.error = undefined;
  }

  onRunComplete(_contexts, results) {
    const retried = results.testResults.flatMap((suite) =>
      suite.testResults.filter((test) => test.invocations > 1),
    );
    if (
      results.numTotalTests === 0 ||
      results.numPendingTests > 0 ||
      results.numTodoTests > 0 ||
      retried.length > 0
    ) {
      this.error = new Error(
        `Incomplete test run: ${results.numTotalTests} total, ` +
          `${results.numPendingTests} skipped, ${results.numTodoTests} todo, ` +
          `${retried.length} retried. Every selected test must run without retries.`,
      );
      process.stderr.write(`${this.error.message}\n`);
    }
  }

  getLastError() {
    return this.error;
  }
}

module.exports = TestCompletenessReporter;
