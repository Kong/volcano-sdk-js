import assert from 'node:assert/strict';
import { type SpawnSyncOptions, spawnSync } from 'node:child_process';
import { appendFileSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { driftRows, driftTable, installedPackage, requireExactPins, runtimeClosure } from './fresh-install.mts';
import { isRecord, record, stringValue } from './values.mts';

// Install the packed SDK as a consumer does, with no lockfile, so every range
// it publishes resolves to the newest release it allows. Then exercise those
// releases: load the lazily imported realtime and durable dependencies from the
// installed package, and run the Jest suite against them while development
// tooling stays at pnpm-lock.yaml.
const [artifact, ...extra] = process.argv.slice(2);
assert.ok(
  artifact !== undefined && artifact !== '' && extra.length === 0,
  'Usage: node .quality-tools/test-fresh-install.mjs <tarball>',
);
const tarball = resolve(artifact);
const root = fileURLToPath(new URL('..', import.meta.url));
const workspace = record(JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')));
const peers = isRecord(workspace['peerDependencies']) ? workspace['peerDependencies'] : {};

function run(command: string, args: readonly string[], options: SpawnSyncOptions): string {
  const result = spawnSync(command, args, { encoding: 'utf8', timeout: 120_000, ...options });
  assert.equal(result.error, undefined, `${command} ${args.join(' ')} did not run`);
  assert.equal(
    result.status,
    0,
    `${command} ${args.join(' ')} failed:\n${String(result.stdout)}${String(result.stderr)}`,
  );
  return String(result.stdout);
}

function report(markdown: string): void {
  process.stdout.write(`${markdown}\n`);
  const summary = process.env['GITHUB_STEP_SUMMARY'];
  if (summary !== undefined && summary !== '') {
    appendFileSync(summary, `${markdown}\n`);
  }
}

function moduleSource(esm: boolean, imports: readonly (readonly [string, string])[], body: string): string {
  const header = imports.map(([binding, specifier]) =>
    esm ? `import ${binding} from '${specifier}';` : `const ${binding} = require('${specifier}');`,
  );
  return `${header.join('\n')}\n\nasync function main() {\n${body}\n}\n\nmain().catch((error) => {\n  console.error(error);\n  process.exitCode = 1;\n});\n`;
}

// A local server speaking the realtime JSON protocol. The client is built
// without a WebSocket implementation, so the SDK imports both `centrifuge` and
// `ws` from the consumer's install to connect, subscribe, receive and publish.
const realtimeImports = [
  ['assert', 'node:assert/strict'],
  ['{ once }', 'node:events'],
  ['{ WebSocketServer }', 'ws'],
  ['{ VolcanoRealtime }', '@volcano.dev/sdk/realtime'],
] as const;
const realtimeSmoke = `  const server = new WebSocketServer({ host: '127.0.0.1', port: 0, path: '/realtime/v1/websocket' });
  await once(server, 'listening');
  const commands = [];
  const published = [];
  server.on('connection', (socket, request) => {
    assert.equal(new URL(request.url, 'ws://127.0.0.1').searchParams.get('apikey'), 'synthetic-anon');
    socket.on('message', (raw) => {
      for (const line of raw.toString().split('\\n').filter(Boolean)) {
        const command = JSON.parse(line);
        const reply = (result) => socket.send(JSON.stringify({ id: command.id, ...result }));
        commands.push(Object.keys(command).filter((key) => key !== 'id').join());
        if (command.connect) {
          assert.equal(command.connect.token, 'synthetic-access');
          reply({ connect: { client: 'fresh-install', version: '0.0.0' } });
        } else if (command.subscribe) {
          reply({ subscribe: {} });
          socket.send(JSON.stringify({ push: { channel: command.subscribe.channel, pub: { data: { text: 'from-server' } } } }));
        } else if (command.publish) {
          published.push(command.publish);
          reply({ publish: {} });
        } else {
          reply({ error: { code: 100, message: 'unexpected command' } });
        }
      }
    });
  });
  const realtime = new VolcanoRealtime({
    apiUrl: \`http://127.0.0.1:\${server.address().port}\`,
    anonKey: 'synthetic-anon',
    accessToken: 'synthetic-access',
  });
  try {
    await realtime.connect();
    const channel = realtime.channel('fresh-install');
    const received = new Promise((resolve) => channel.on('message', resolve));
    await channel.subscribe();
    assert.deepEqual(await received, { text: 'from-server' });
    await channel.send({ text: 'from-client' });
    assert.deepEqual(published, [{ channel: 'broadcast:fresh-install', data: { text: 'from-client' } }]);
    assert.deepEqual(commands, ['connect', 'subscribe', 'publish']);
  } finally {
    realtime.disconnect();
    for (const client of server.clients) {
      client.terminate();
    }
    server.close();
  }
  console.log('realtime connected, subscribed, received and published');`;

// The durable wrapper imports the optional peer on its first invocation. The
// runtime's local runner replays the execution across the wait.
const durableImports = [
  ['assert', 'node:assert/strict'],
  ['{ LocalDurableTestRunner }', '@aws/durable-execution-sdk-js-testing'],
  ['{ durable }', '@volcano.dev/sdk/durable'],
] as const;
const durableSmoke = `  let invocations = 0;
  const handler = durable(async (input, ctx) => {
    const doubled = await ctx.step('double', async () => input.value * 2);
    await ctx.wait('pause', '1s');
    return { doubled };
  });
  await LocalDurableTestRunner.setupTestEnvironment({ skipTime: true });
  try {
    const runner = new LocalDurableTestRunner({
      handlerFunction(event, context) {
        invocations += 1;
        return handler(event, context);
      },
    });
    const result = await runner.run({ payload: { value: 21 } });
    assert.deepEqual(result.getResult(), { doubled: 42 });
    assert.ok(invocations > 1, 'The wait did not replay the execution');
  } finally {
    await LocalDurableTestRunner.teardownTestEnvironment();
  }
  console.log('durable execution replayed through the installed runtime');`;

function requireJestResolvedFreshInstall(directory: string, log: string, packages: readonly string[]): string[] {
  const loaded = readFileSync(log, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => realpathSync(line));
  return packages.map((name) => {
    const installed = installedPackage(directory, name);
    assert.ok(installed !== undefined, `The fresh install has no ${name}`);
    assert.ok(
      loaded.some((path) => path.startsWith(`${installed.directory}${sep}`)),
      `Jest never resolved ${name} from the fresh install`,
    );
    return `${name} ${installed.version}`;
  });
}

const directory = realpathSync(mkdtempSync(join(tmpdir(), 'volcano-fresh-install-')));
try {
  // Keep the install outside the checkout and omit publisher credentials and hooks.
  const env = {
    PATH: process.env['PATH'],
    HOME: directory,
    NPM_CONFIG_CACHE: join(directory, '.npm-cache'),
    NPM_CONFIG_USERCONFIG: join(directory, '.npmrc'),
    NPM_CONFIG_GLOBALCONFIG: join(directory, '.global-npmrc'),
  };
  const npm = ['--ignore-scripts', '--no-audit', '--no-fund', '--registry=https://registry.npmjs.org'];
  writeFileSync(join(directory, 'package.json'), JSON.stringify({ private: true }));
  writeFileSync(join(directory, '.npmrc'), '');
  writeFileSync(join(directory, '.global-npmrc'), '');

  // Optional peers are not installed by default; request each at its newest allowed release.
  const peerSpecs = Object.entries(peers).map(([name, range]) => `${name}@${stringValue(range)}`);
  run('npm', ['install', ...npm, tarball, ...peerSpecs], { cwd: directory, env });

  const sdk = installedPackage(directory, '@volcano.dev/sdk');
  assert.ok(sdk !== undefined, 'npm did not install the packed SDK');
  const dependencies = record(sdk.manifest['dependencies']);
  requireExactPins(sdk.directory, dependencies);
  requireExactPins(root, dependencies);
  const fresh = runtimeClosure(sdk.directory, sdk.manifest);
  const rows = driftRows(runtimeClosure(root, workspace), fresh);
  const drifted = rows.filter((row) => row.drift);
  const count = `${String(drifted.length)} of ${String(rows.length)} runtime packages differ from pnpm-lock.yaml`;
  report(
    `### Fresh-install resolution\n\n${count}. Lock is what the workspace loads; fresh install is what npm resolves today for the package and its optional peers.\n\n${driftTable(rows)}`,
  );
  if (drifted.length > 0 && process.env['GITHUB_ACTIONS'] === 'true') {
    const changes = drifted.map((row) => `${row.name} ${row.lock} -> ${row.fresh}`).join(', ');
    process.stdout.write(`::warning title=Fresh-install drift::${count}: ${changes}\n`);
  }

  // The durable runner is development tooling, so it stays at the workspace's version.
  const devDependencies = record(workspace['devDependencies']);
  const runner = `@aws/durable-execution-sdk-js-testing@${stringValue(devDependencies['@aws/durable-execution-sdk-js-testing'])}`;
  run('npm', ['install', ...npm, '--no-save', runner], { cwd: directory, env });
  assert.deepEqual(
    runtimeClosure(sdk.directory, sdk.manifest),
    fresh,
    'Installing the durable runner moved a runtime package',
  );

  for (const esm of [true, false]) {
    const extension = esm ? 'mjs' : 'cjs';
    for (const [name, imports, body] of [
      ['realtime', realtimeImports, realtimeSmoke],
      ['durable', durableImports, durableSmoke],
    ] as const) {
      const file = `${name}-smoke.${extension}`;
      writeFileSync(join(directory, file), moduleSource(esm, imports, body));
      process.stdout.write(`${file}: ${run(process.execPath, [file], { cwd: directory, env, timeout: 30_000 })}`);
    }
  }

  // Jest's resolver hook sends every import of a runtime package to the fresh
  // install. Their own dependencies then resolve inside that tree, while Jest,
  // Babel and the durable runner stay at pnpm-lock.yaml.
  const log = join(directory, 'jest-resolutions.log');
  writeFileSync(log, '');
  const packages = [...Object.keys(dependencies), ...Object.keys(peers)];
  const jest = spawnSync(
    process.execPath,
    [
      join(root, 'node_modules/jest/bin/jest.js'),
      '--ci',
      `--resolver=${join(root, '.quality-tools/fresh-install-resolver.cjs')}`,
    ],
    {
      cwd: root,
      stdio: 'inherit',
      env: {
        ...process.env,
        VOLCANO_FRESH_INSTALL_DIRECTORY: directory,
        VOLCANO_FRESH_INSTALL_PACKAGES: JSON.stringify(packages),
        VOLCANO_FRESH_INSTALL_LOG: log,
      },
    },
  );
  assert.equal(jest.status, 0, 'Jest failed against the fresh install');
  const loaded = requireJestResolvedFreshInstall(directory, log, packages);
  process.stdout.write(`Jest resolved the fresh install's ${loaded.join(', ')}.\n`);
} finally {
  rmSync(directory, { recursive: true, force: true });
}
