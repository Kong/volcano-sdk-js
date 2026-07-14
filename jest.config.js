module.exports = {
  testEnvironment: 'jsdom',
  testMatch: ['**/__tests__/**/*.test.{js,ts}'],
  // The integration suite under __tests__/integration requires a live Volcano
  // server and is run by the volcano-hosting harness (scripts/ci/run-sdk-integration-tests.sh
  // via jest.integration.config.cjs), not by the SDK's unit `pnpm test`.
  testPathIgnorePatterns: ['/node_modules/', '<rootDir>/__tests__/integration/'],
  collectCoverageFrom: ['src/**/*.{js,ts}', '!src/generated/**'],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  setupFilesAfterEnv: ['<rootDir>/__tests__/setup.js'],
};
