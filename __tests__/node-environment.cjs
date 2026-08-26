const NodeEnvironment = require('jest-environment-node').TestEnvironment;

// Keep Node tests server-only before Jest copies host globals into its sandbox.
delete globalThis.localStorage;
delete globalThis.sessionStorage;

module.exports = NodeEnvironment;
