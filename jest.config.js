module.exports = {
  testEnvironment: 'jsdom',
  testMatch: ['**/__tests__/**/*.test.js'],
  // The integration suite under __tests__/integration requires a live Volcano
  // server and is run by the volcano-hosting harness (scripts/ci/run-sdk-integration-tests.sh
  // via jest.integration.config.cjs), not by the SDK's unit `pnpm test`.
  testPathIgnorePatterns: ['/node_modules/', '<rootDir>/__tests__/integration/'],
  collectCoverageFrom: ['src/**/*.js'],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov'],
  setupFilesAfterEnv: ['<rootDir>/__tests__/setup.js'],
};
