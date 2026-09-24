module.exports = {
  waitForUnhandledRejections: true,
  testEnvironment: '<rootDir>/__tests__/node-environment.cjs',
  testMatch: ['<rootDir>/__tests__/integration/**/*.test.{js,ts}'],
  testPathIgnorePatterns: ['/node_modules/', '<rootDir>/.stryker-tmp/'],
  modulePathIgnorePatterns: ['<rootDir>/.stryker-tmp/'],
  setupFilesAfterEnv: ['<rootDir>/__tests__/integration/setup.ts'],
  reporters: ['default', '<rootDir>/scripts/jest-completeness.cjs'],
};
