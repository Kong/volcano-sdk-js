// `@volcano.dev/durable-runtime` names the durable runtime's version range in a
// second place, so the two can drift. A function installing the Volcano package
// would then get a runtime the SDK does not claim to support, and nothing at
// install time would say so — the SDK's own declaration is satisfied by the
// Volcano package, not by the runtime beneath it.
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const sdk = require('../package.json');

const wrapperDirectory = join(__dirname, '..', 'packages', 'durable-runtime');
const wrapper = JSON.parse(readFileSync(join(wrapperDirectory, 'package.json'), 'utf8'));

const runtime = '@aws/durable-execution-sdk-js';

describe('the durable runtime package', () => {
  it('pins the same runtime range the SDK declares', () => {
    expect(wrapper.dependencies[runtime]).toBe(sdk.peerDependencies[runtime]);
  });

  it('is the specifier the SDK loads first', async () => {
    const source = readFileSync(join(__dirname, '..', 'src', 'durable.js'), 'utf8');
    const specifiers = source.match(/const runtimeSpecifiers = \[([^\]]+)\]/);

    expect(specifiers).not.toBeNull();
    expect(specifiers[1].split(',')[0].trim()).toBe(`'${wrapper.name}'`);
  });

  it('is an optional peer of the SDK, so a browser bundle never pulls it in', () => {
    expect(sdk.peerDependencies[wrapper.name]).toBeDefined();
    expect(sdk.peerDependenciesMeta[wrapper.name].optional).toBe(true);
  });

  it('ships one CommonJS entry and its types', () => {
    // One entry for both kinds of function: a dynamic import of a CommonJS
    // package resolves its re-exported names, and a require gets them
    // directly. A second ESM entry would only be another thing to keep in
    // step.
    expect(wrapper.exports['.']).toMatchObject({
      default: './index.js',
      types: './index.d.ts',
    });
    for (const file of ['index.js', 'index.d.ts']) {
      expect(wrapper.files).toContain(file);
      expect(readFileSync(join(wrapperDirectory, file), 'utf8')).toContain(runtime);
    }
  });
});
