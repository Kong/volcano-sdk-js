// A durable handler running where durable execution does not exist — a function
// that was not deployed as durable, a browser, a local script — cannot load the
// runtime. The failure has to name what to do about it rather than surface a
// module-resolution error.
//
// Volcano installs the runtime when it builds a durable function, so this is no
// longer something the reader can fix by installing a package, and the message
// must not send them after one. The runtime is an optional peer dependency and
// this repo's own dev install has it, so it is failed here on purpose: the
// assertion is about the facade's answer, not about what happens to be present.
jest.mock(
  '@aws/durable-execution-sdk-js',
  () => {
    throw new Error("Cannot find module '@aws/durable-execution-sdk-js'");
  },
  { virtual: true },
);

const { durable, DurableRuntimeMissingError } = require('../src/durable.js');

describe('durable() where the durable runtime is not available', () => {
  it('fails on invocation, not on import', async () => {
    const handler = durable(async () => 'never runs');

    await expect(handler({}, {})).rejects.toThrow(DurableRuntimeMissingError);
  });

  it('says to deploy as durable, and that durable execution is cloud-only', async () => {
    const error = await durable(async () => null)({}, {}).catch((err) => err);

    expect(error.message).toMatch(/deploy this one that way/);
    expect(error.message).toMatch(/kind: durable/);
    expect(error.message).toMatch(/cloud capability and does not run locally/);
    expect(error.cause).toBeDefined();
  });

  it('does not tell the reader to install anything', async () => {
    const error = await durable(async () => null)({}, {}).catch((err) => err);

    // The platform installs it. A message naming a package would send the
    // reader to add a dependency that their function does not need and that
    // the build would then find already declared.
    expect(error.message).not.toMatch(/npm install/);
    expect(error.message).not.toMatch(/@aws\//);
  });
});
