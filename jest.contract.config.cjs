module.exports = {
  testEnvironment: '<rootDir>/__tests__/node-environment.cjs',
  testMatch: ['**/__tests__/contract/**/*.test.js'],
  testTimeout: 30000,
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
