// A durable handler running where durable execution does not exist — a
// standard function, a browser, a local script — cannot load the engine. The
// failure has to name what to do about it rather than surface a
// module-resolution error.
//
// The engine is an optional peer dependency, so it may or may not be present in
// any given install (this repo's own dev install has it). The import is failed
// here on purpose so the assertion is about the facade's answer rather than
// about what happens to be installed.
jest.mock(
  '@aws/durable-execution-sdk-js',
  () => {
    throw new Error("Cannot find module '@aws/durable-execution-sdk-js'");
  },
  { virtual: true },
);

const { durable, DurableRuntimeMissingError } = require('../src/durable.js');

describe('durable() without the durable runtime installed', () => {
  it('fails on invocation, not on import', async () => {
    const handler = durable(async () => 'never runs');

    await expect(handler({}, {})).rejects.toThrow(DurableRuntimeMissingError);
  });

  it('says how to install it and that durable execution is cloud-only', async () => {
    const error = await durable(async () => null)({}, {}).catch((err) => err);

    expect(error.message).toMatch(/npm install @aws\/durable-execution-sdk-js/);
    expect(error.message).toMatch(/cloud capability and does not run locally/);
    expect(error.cause).toBeDefined();
  });
});
