module.exports = {
  testEnvironment: '<rootDir>/__tests__/node-environment.cjs',
  testMatch: ['**/__tests__/contract/**/*.test.js'],
  // The durable scenarios poll a real execution to a terminal status, which the
  // world bounds at 300s. Anything shorter here would cut that short.
  testTimeout: 360000,
  reporters: [
    'default',
    [
      'jest-junit',
      {
        outputDirectory: 'reports',
        outputName: 'sdk-contract-js.xml',
      },
    ],
  ],
};
