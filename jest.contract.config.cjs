module.exports = {
  testEnvironment: '<rootDir>/__tests__/node-environment.cjs',
  testMatch: ['**/__tests__/contract/**/*.test.js'],
  // Retained log ingestion may take four minutes; each poll has its own deadline.
  testTimeout: 300000,
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
