module.exports = {
  waitForUnhandledRejections: true,
  testEnvironment: '<rootDir>/__tests__/node-environment.cjs',
  testMatch: ['<rootDir>/__tests__/integration/**/*.test.{js,ts}'],
  setupFilesAfterEnv: ['<rootDir>/__tests__/integration/setup.ts'],
  reporters: ['default', '<rootDir>/scripts/jest-completeness.cjs'],
};
