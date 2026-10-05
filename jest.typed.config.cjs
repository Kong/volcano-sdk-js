const base = require('./jest.config.js');

module.exports = {
  ...base,
  moduleNameMapper: {
    ...base.moduleNameMapper,
    '^\\.\\./src/index\\.ts$': '<rootDir>/src/index.ts',
    '^\\.\\./src(?:/index(?:\\.js)?)?$': '<rootDir>/src/index.ts',
    '^\\.\\./src/realtime$': '<rootDir>/src/realtime.ts',
  },
  collectCoverage: true,
  collectCoverageFrom: ['src/**/*.ts', '!src/**/*.d.ts', '!src/generated/**'],
  coverageThreshold: {
    global: { branches: 100, functions: 100, lines: 100, statements: 100 },
  },
  coverageReporters: ['text', 'json', 'lcov'],
  testMatch: ['**/__tests__/**/*.test.{js,ts}'],
};
