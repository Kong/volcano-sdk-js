import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);
const [artifact, ...extra] = process.argv.slice(2);
assert.ok(
  artifact !== undefined && artifact !== '' && extra.length === 0,
  'Usage: node .quality-tools/test-package-quickstart.mjs <tarball>',
);
const tarball = resolve(artifact);
const digest = createHash('sha256')
  .update(await readFile(tarball))
  .digest('hex');
const document = await readFile(new URL('../docs/getting-started.md', import.meta.url), 'utf8');
const section = document.split('## Sign in and read a profile\n')[1]?.split(/\n#{2,3} /)[0];
const examples = [...(section?.matchAll(/```javascript\n([\s\S]*?)\n```/g) ?? [])];
assert.equal(examples.length, 1, 'Expected one complete documented quickstart');
const quickstart = examples[0]?.[1];
assert.ok(quickstart !== undefined);

const user = {
  id: '22222222-2222-4222-8222-222222222222',
  project_id: '11111111-1111-4111-8111-111111111111',
  email: 'quickstart@example.test',
  email_confirmed: true,
  status: 'active',
};
const credentials = { email: user.email, password: randomUUID() };
const session = {
  access_token: 'synthetic-access',
  refresh_token: 'synthetic-refresh',
  token_type: 'bearer',
  expires_in: 3600,
  user,
};
const requests: string[] = [];
const failures: unknown[] = [];

async function respond(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const key = `${String(request.method)} ${String(request.url)}`;
  requests.push(key);
  const body = await readBody(request);
  response.setHeader('Content-Type', 'application/json');
  switch (key) {
    case 'POST /auth/signin': {
      assert.equal(request.headers.authorization, 'Bearer synthetic-anon');
      assert.deepEqual(JSON.parse(body), credentials);
      response.end(JSON.stringify(session));
      break;
    }
    case 'GET /auth/user': {
      assert.equal(request.headers.authorization, `Bearer ${session.access_token}`);
      response.end(JSON.stringify({ user }));
      break;
    }
    case 'POST /auth/logout': {
      assert.equal(request.headers.authorization, 'Bearer synthetic-anon');
      assert.deepEqual(JSON.parse(body), { refresh_token: session.refresh_token });
      response.writeHead(204).end();
      break;
    }
    default: {
      assert.fail('Unexpected quickstart request');
    }
  }
}

async function readBody(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  const stream: AsyncIterable<unknown> = request;
  for await (const chunk of stream) {
    assert.ok(Buffer.isBuffer(chunk));
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString();
}

const server = createServer((request, response) => {
  respond(request, response).catch((error: unknown) => {
    failures.push(error);
    response.writeHead(500).end();
  });
});
const directory = await mkdtemp(join(tmpdir(), 'volcano-package-quickstart-'));
try {
  // Keep the install outside the checkout and omit publisher credentials and hooks.
  const env = {
    PATH: process.env['PATH'],
    HOME: directory,
    NPM_CONFIG_CACHE: join(directory, '.npm-cache'),
    NPM_CONFIG_USERCONFIG: join(directory, '.npmrc'),
    NPM_CONFIG_GLOBALCONFIG: join(directory, '.global-npmrc'),
  };
  await writeFile(
    join(directory, 'package.json'),
    JSON.stringify({ private: true, type: 'module' }),
  );
  await writeFile(join(directory, '.npmrc'), '');
  await writeFile(join(directory, '.global-npmrc'), '');
  await run(
    'npm',
    [
      'install',
      '--ignore-scripts',
      '--legacy-peer-deps',
      '--no-audit',
      '--no-fund',
      '--registry=https://registry.npmjs.org',
      tarball,
    ],
    { cwd: directory, env, timeout: 120_000 },
  );
  await writeFile(
    join(directory, 'realtime-imports.mjs'),
    `import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import RealtimeDefault, { VolcanoRealtime, RealtimeChannel } from '@volcano.dev/sdk/realtime';

assert.equal(typeof VolcanoRealtime, 'function');
assert.equal(typeof RealtimeChannel, 'function');
assert.equal(RealtimeDefault, VolcanoRealtime);
const commonjs = createRequire(import.meta.url)('@volcano.dev/sdk/realtime');
assert.equal(typeof commonjs.VolcanoRealtime, 'function');
assert.equal(typeof commonjs.RealtimeChannel, 'function');
assert.equal(commonjs.default, commonjs.VolcanoRealtime);
`,
  );
  await run(process.execPath, ['realtime-imports.mjs'], {
    cwd: directory,
    env,
    timeout: 30_000,
  });
  await writeFile(
    join(directory, 'next-imports.mjs'),
    `import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createServerClient, getTokenFromRequest, withAuth } from '@volcano.dev/sdk/next/middleware';

const commonjs = createRequire(import.meta.url)('@volcano.dev/sdk/next/middleware');
for (const entrypoint of [{ createServerClient, getTokenFromRequest, withAuth }, commonjs]) {
  assert.equal(typeof entrypoint.createServerClient, 'function');
  assert.equal(typeof entrypoint.getTokenFromRequest, 'function');
  assert.equal(typeof entrypoint.withAuth, 'function');
  const client = entrypoint.createServerClient({ anonKey: 'synthetic-anon' });
  assert.deepEqual(await client.getUser(''), {
    user: null,
    error: new Error('No access token provided'),
  });
}
`,
  );
  await run(process.execPath, ['next-imports.mjs'], {
    cwd: directory,
    env,
    timeout: 30_000,
  });
  await writeFile(join(directory, 'quickstart.mjs'), quickstart);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address !== null && typeof address === 'object');
  const result = await run(process.execPath, ['quickstart.mjs'], {
    cwd: directory,
    timeout: 30_000,
    env: {
      ...env,
      VOLCANO_API_URL: `http://127.0.0.1:${String(address.port)}`,
      VOLCANO_ANON_KEY: 'synthetic-anon',
      VOLCANO_USER_EMAIL: credentials.email,
      VOLCANO_USER_PASSWORD: credentials.password,
    },
  });
  assert.deepEqual(failures, []);
  assert.deepEqual(requests, ['POST /auth/signin', 'GET /auth/user', 'POST /auth/logout']);
  assert.equal(result.stdout.trim(), `Signed in as ${user.email}`);
  assert.equal(result.stderr.trim(), '');
  assert.equal(
    createHash('sha256')
      .update(await readFile(tarball))
      .digest('hex'),
    digest,
  );
  process.stdout.write(
    `Documented quickstart passed for package SHA256 ${digest} (synthetic HTTP).\n`,
  );
} finally {
  server.closeAllConnections();
  if (server.listening) {
    server.close();
    await once(server, 'close');
  }
  await rm(directory, { recursive: true, force: true });
}
