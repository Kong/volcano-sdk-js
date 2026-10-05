const base = require('./jest.typed.config.cjs');

module.exports = {
  ...base,
  collectCoverage: false,
  coverageThreshold: undefined,
};
