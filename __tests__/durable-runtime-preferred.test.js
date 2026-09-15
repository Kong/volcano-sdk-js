// `@volcano.dev/durable-runtime` is tried before the runtime under it, and the
// order is the reason that package exists rather than a preference.
//
// Under a strict node_modules layout a package can only resolve what it
// declares. The SDK declares the Volcano package as an optional peer, so pnpm
// satisfies it from the function's own dependencies; the runtime beneath is
// that package's dependency rather than the SDK's, and resolving it from here
// works only where a hoisted layout happens to expose it. Reversing this order
// would keep every test but this one passing, and break pnpm installs.
const mockWrapperHandler = jest.fn();
const mockRuntimeHandler = jest.fn();

jest.mock(
  '@volcano.dev/durable-runtime',
  () => ({ withDurableExecution: () => mockWrapperHandler }),
  { virtual: true },
);

jest.mock(
  '@aws/durable-execution-sdk-js',
  () => ({ withDurableExecution: () => mockRuntimeHandler }),
  { virtual: true },
);

const { durable } = require('../src/durable.js');

describe('durable runtime resolution', () => {
  it('loads the Volcano package when both resolve', async () => {
    mockWrapperHandler.mockResolvedValue('from the volcano package');

    await expect(durable(async () => null)({}, {})).resolves.toBe('from the volcano package');
    expect(mockRuntimeHandler).not.toHaveBeenCalled();
  });
});
