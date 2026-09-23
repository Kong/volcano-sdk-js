const NodeEnvironment = require('jest-environment-node').TestEnvironment;
const { mixinJestEnvironment } = require('@stryker-mutator/jest-runner');

// Keep Node tests server-only before Jest copies host globals into its sandbox.
delete globalThis.localStorage;
delete globalThis.sessionStorage;

module.exports = mixinJestEnvironment(NodeEnvironment);
