module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/__tests__/contract/sdk-contract.test.js'],
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
