// The durable runtime, re-exported unchanged.
//
// This package exists so a durable function's dependencies name only Volcano,
// and so the runtime resolves under a strict node_modules layout: pnpm will not
// install an optional peer dependency on the SDK's behalf, and a runtime
// hoisted from somewhere else is not something the SDK can rely on. Declared
// here as a real dependency, it is installed and resolvable wherever this
// package is.
//
// CommonJS, and the only entry point, so it serves both kinds of function: a
// dynamic import of a CommonJS package hands the exports back under `default`,
// which is the shape @volcano.dev/sdk/durable already reads. The runtime ships
// both formats, so requiring it here takes its CommonJS build.
//
// Nothing is wrapped or renamed. @volcano.dev/sdk/durable is the API a durable
// function is written against; this is only how the runtime under it arrives.
module.exports = require('@aws/durable-execution-sdk-js');
