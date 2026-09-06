// No mock here on purpose: the durable runtime really is absent from this
// repo's install, which is the same situation as a durable handler running
// where durable execution does not exist. The failure has to name what to do
// about it rather than surface a module-resolution error.
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
