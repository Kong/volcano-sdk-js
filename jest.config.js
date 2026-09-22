module.exports = {
  testEnvironment: 'jsdom',
  reporters: ['default', '<rootDir>/scripts/jest-completeness.cjs'],
  testMatch: ['**/__tests__/**/*.test.{js,ts}'],
  // The integration suite under __tests__/integration requires a live Volcano
  // server and is run by the volcano-hosting harness (scripts/ci/run-sdk-integration-tests.sh
  // via jest.integration.config.cjs), not by the SDK's unit `pnpm test`.
  testPathIgnorePatterns: [
    '/node_modules/',
    '<rootDir>/__tests__/contract/',
    '<rootDir>/__tests__/integration/',
  ],
  collectCoverageFrom: ['src/**/*.{js,ts}', '!src/**/*.d.ts'],
  coverageThreshold: {
    'src/response-headers.ts': { branches: 100, functions: 100, lines: 100, statements: 100 },
    'src/response-json.ts': { branches: 100, functions: 100, lines: 100, statements: 100 },
    'src/fetch-lifecycle.ts': { branches: 100, functions: 100, lines: 100, statements: 100 },
    'src/durable-duration.ts': { branches: 100, functions: 100, lines: 100, statements: 100 },
    'src/realtime-identity.ts': { branches: 100, functions: 100, lines: 100, statements: 100 },
    'src/auth-validation.ts': { branches: 100, functions: 100, lines: 100, statements: 100 },
    'src/lock-validation.ts': { branches: 100, functions: 100, lines: 100, statements: 100 },
    'src/function-url.ts': { branches: 100, functions: 100, lines: 100, statements: 100 },
    'src/token-claims.ts': { branches: 100, functions: 100, lines: 100, statements: 100 },
    'src/database-connection-string.ts': {
      branches: 100,
      functions: 100,
      lines: 100,
      statements: 100,
    },
    'src/lock-session.ts': { branches: 100, functions: 100, lines: 100, statements: 100 },
    'src/lock-clock.ts': { branches: 100, functions: 100, lines: 100, statements: 100 },
    'src/auth-session.ts': { branches: 100, functions: 100, lines: 100, statements: 100 },
    'src/next/request.ts': { branches: 100, functions: 100, lines: 100, statements: 100 },
  },
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov'],
  setupFilesAfterEnv: ['<rootDir>/__tests__/setup.js'],
};
