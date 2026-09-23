const base = require('./jest.config.js');

module.exports = {
  ...base,
  collectCoverage: true,
  collectCoverageFrom: ['src/**/*.ts', '!src/**/*.d.ts', '!src/generated/**'],
  coverageThreshold: {
    global: { branches: 100, functions: 100, lines: 100, statements: 100 },
  },
  coverageReporters: ['text', 'json', 'lcov'],
  testMatch: ['**/__tests__/**/*.test.{js,ts}'],
};
