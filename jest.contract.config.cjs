module.exports = {
  waitForUnhandledRejections: true,
  testEnvironment: '<rootDir>/__tests__/node-environment.cjs',
  testMatch: ['**/__tests__/contract/**/*.test.{js,ts}'],
  // The larger of the two budgets, since one file runs both sets: three 60s
  // invokes, a 240s ingestion poll, pagination and cleanup on main's side, and
  // durable scenarios that poll a real execution to a terminal status, which
  // the world bounds at 300s.
  testTimeout: 600000,
  reporters: [
    'default',
    '<rootDir>/scripts/jest-completeness.cjs',
    [
      'jest-junit',
      {
        outputDirectory: 'reports',
        outputName: 'sdk-contract-js.xml',
      },
    ],
  ],
};
