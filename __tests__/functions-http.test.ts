/**
 * @jest-environment ./__tests__/node-environment.cjs
 *
 * Function invocation over the real HTTP stack.
 *
 * These exercise fetch end to end against two local servers on different
 * ports: one standing in for the API, one for the resolved function endpoint.
 * Running them apart is the point -- an invocation that reached the API port
 * would prove the SDK derived the host instead of using the resolved
 * invoke_url.
 */

import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { VolcanoAuth, VolcanoSystemError } from '../src/index.ts';
import { realFetch } from './setup.ts';
import { apiServer, startServer, type TestServer } from './support/functions-http-server.ts';

type Respond = Parameters<typeof startServer>[0];
type Reply = Awaited<ReturnType<Respond>>;

const FUNCTION_ID = '3cd3e058-e3ff-42a5-ae4d-650ef9b45746';
// Signed with the project the SDK requires on a function token.
const ACCESS_TOKEN = [
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9',
  'eyJwcm9qZWN0X2lkIjoicHJvamVjdC0xMjMiLCJzdWIiOiJ1c2VyLTEifQ',
  'signature',
].join('.');
const RESOLVED: Reply = [200, { name: 'my-function', function_id: FUNCTION_ID, cache_ttl_seconds: 300 }];
let servers: TestServer[];

function client(apiUrl: string) {
  return new VolcanoAuth({ apiUrl, anonKey: 'ak-test-anon-key', accessToken: ACCESS_TOKEN });
}

function track(server: TestServer): TestServer {
  servers.push(server);
  return server;
}

/** Answers successive requests with `replies`, in order. */
function answersInOrder(...replies: Reply[]): Respond {
  const respond = jest.fn<Respond>();
  for (const reply of replies) {
    respond.mockReturnValueOnce(reply);
  }
  return respond;
}

function reachesResolvedHost(): void {
  it('resolves once and reaches the resolved host for repeated invocations', async () => {
    const functions = track(await startServer(() => [200, { ok: true }]));
    const api = track(
      await apiServer({
        name: 'my-function',
        function_id: FUNCTION_ID,
        invoke_url: `${functions.url}/`,
        cache_ttl_seconds: 300,
      }),
    );
    const volcano = client(api.url);

    for (let attempt = 0; attempt < 3; attempt += 1) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- Each repeat must follow the cached first resolve.
      const { error, status } = await volcano.functions.invoke('my-function', { user_id: 'u-1' });
      expect(error).toBeNull();
      expect(status).toBe(200);
    }

    expect(api.targets()).toEqual(['/functions/resolve?name=my-function']);
    expect(functions.targets()).toEqual(['/', '/', '/']);
    expect(functions.requests[0]?.body).toEqual({ payload: { user_id: 'u-1' } });
    expect(functions.requests[0]?.authorization).toBe(`Bearer ${ACCESS_TOKEN}`);
  });

  it('falls back to the API path without a resolved endpoint', async () => {
    const functions = track(await startServer(() => [200, { ok: true }]));
    const api = track(await apiServer({ name: 'my-function', function_id: FUNCTION_ID, cache_ttl_seconds: 300 }));

    const { error } = await client(api.url).functions.invoke('my-function', {});

    expect(error).toBeNull();
    expect(api.targets()).toEqual(['/functions/resolve?name=my-function', `/functions/${FUNCTION_ID}/invoke`]);
    expect(functions.targets()).toEqual([]);
  });
}

function sharesResolution(): void {
  it('does not re-resolve an unknown name on every attempt', async () => {
    const api = track(await apiServer({ error: 'function not found' }, { status: 404 }));
    const volcano = client(api.url);

    for (let attempt = 0; attempt < 3; attempt += 1) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- Each retry must follow the cached failed resolve.
      const { error } = await volcano.functions.invoke('missing-function', {});
      expect(error).toBeDefined();
    }

    expect(api.targets()).toEqual(['/functions/resolve?name=missing-function']);
  });

  it('shares one resolve across concurrent first invocations', async () => {
    const functions = track(await startServer(() => [200, { ok: true }]));
    const api = track(
      await apiServer(
        {
          name: 'my-function',
          function_id: FUNCTION_ID,
          invoke_url: `${functions.url}/`,
          cache_ttl_seconds: 300,
        },
        { resolveDelayMs: 100 },
      ),
    );
    const volcano = client(api.url);

    const results = await Promise.all(Array.from({ length: 8 }, () => volcano.functions.invoke('my-function', {})));

    expect(results.every((result) => result.error === null)).toBe(true);
    expect(api.targets()).toEqual(['/functions/resolve?name=my-function']);
    expect(functions.targets()).toHaveLength(8);
  });
}

function retriesOnlyPlatformNotFound(): void {
  it('resolves a recreated function again after a platform 404', async () => {
    const api = track(
      await startServer(
        answersInOrder(
          RESOLVED,
          // The first invocation finds the cached identity gone. The platform
          // answers without the dispatch marker, which is the only thing telling
          // this apart from the function itself returning 404.
          [404, { error: 'function not found' }],
          RESOLVED,
          [200, { ok: true }, { 'X-Volcano-Function-Invoked': 'true' }],
        ),
      ),
    );

    const { error, status } = await client(api.url).functions.invoke('my-function', {});

    expect(error).toBeNull();
    expect(status).toBe(200);
    expect(api.targets()).toEqual([
      '/functions/resolve?name=my-function',
      `/functions/${FUNCTION_ID}/invoke`,
      '/functions/resolve?name=my-function',
      `/functions/${FUNCTION_ID}/invoke`,
    ]);
  });

  it('returns a function-authored 404 without invoking it twice', async () => {
    const api = track(
      await startServer(
        answersInOrder(
          RESOLVED,
          // The function ran and chose 404. Retrying would repeat whatever it did
          // on the way to deciding that.
          [404, { error: 'no such record' }, { 'X-Volcano-Function-Invoked': 'true' }],
        ),
      ),
    );

    const { status, error } = await client(api.url).functions.invoke('my-function', {});

    expect(status).toBe(404);
    expect(error).toBeNull();
    expect(api.targets()).toEqual(['/functions/resolve?name=my-function', `/functions/${FUNCTION_ID}/invoke`]);
  });
}

function separatesPlatformAndFunctionErrors(): void {
  // The server stamps x-volcano-version on every response, so a check keyed on
  // its absence never fires and every platform failure would be handed back as
  // though the function had answered.
  it('surfaces a platform refusal as a system error', async () => {
    const api = track(
      await startServer(
        answersInOrder(
          RESOLVED,
          // No dispatch marker: the platform refused before the function ran.
          [400, { error: 'function cannot be invoked (status: failed)' }],
        ),
      ),
    );

    const { data, status, error } = await client(api.url).functions.invoke('my-function', {});

    expect(api.targets()).toEqual(['/functions/resolve?name=my-function', `/functions/${FUNCTION_ID}/invoke`]);
    expect(data).toBeNull();
    expect(status).toBe(400);
    expect(error).not.toBeNull();
    expect(VolcanoSystemError.is(error)).toBe(true);
    expect(error?.message).toBe('function cannot be invoked (status: failed)');
  });

  it('returns a function-authored error as data, not a system error', async () => {
    const api = track(
      await startServer(
        answersInOrder(
          RESOLVED,
          // The function ran and chose 400, so this is its answer.
          [400, { error: 'bad input' }, { 'X-Volcano-Function-Invoked': 'true' }],
        ),
      ),
    );

    const { data, status, error } = await client(api.url).functions.invoke('my-function', {});

    expect(api.targets()).toEqual(['/functions/resolve?name=my-function', `/functions/${FUNCTION_ID}/invoke`]);
    expect(error).toBeNull();
    expect(status).toBe(400);
    expect(data).toEqual({ error: 'bad input' });
  });
}

describe('function invocation over HTTP', () => {
  beforeEach(() => {
    servers = [];
    // The shared setup mocks fetch; these tests need the real one.
    globalThis.fetch = realFetch;
  });

  afterEach(async () => {
    await Promise.all(servers.map((server) => server.close()));
  });

  reachesResolvedHost();
  sharesResolution();
  retriesOnlyPlatformNotFound();
  separatesPlatformAndFunctionErrors();
});
