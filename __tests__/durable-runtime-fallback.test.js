// A function that depends on the durable runtime directly, without the Volcano
// package in front of it, still runs.
//
// That is what every durable function deployed before the package existed
// looks like, and what the platform's own deployed fixtures still install.
// Dropping the fallback would break them on the SDK's next release.
const mockRuntimeHandler = jest.fn();

jest.mock(
  '@volcano.dev/durable-runtime',
  () => {
    throw new Error("Cannot find module '@volcano.dev/durable-runtime'");
  },
  { virtual: true },
);

jest.mock(
  '@aws/durable-execution-sdk-js',
  () => ({ withDurableExecution: () => mockRuntimeHandler }),
  { virtual: true },
);

const { durable } = require('../src/durable.js');

describe('durable runtime resolution without the Volcano package', () => {
  it('falls back to the runtime the function depends on directly', async () => {
    mockRuntimeHandler.mockResolvedValue('from the runtime itself');

    await expect(durable(async () => null)({}, {})).resolves.toBe('from the runtime itself');
  });
});
