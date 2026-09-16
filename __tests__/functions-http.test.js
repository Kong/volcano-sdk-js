/**
 * @jest-environment node
 *
 * Function invocation over the real HTTP stack.
 *
 * These exercise fetch end to end against two local servers on different
 * ports: one standing in for the API, one for the resolved function endpoint.
 * Running them apart is the point -- an invocation that reached the API port
 * would prove the SDK derived the host instead of using the resolved
 * invoke_url.
 */

const http = require('node:http');

const { VolcanoAuth } = require('../src/index.js');

const FUNCTION_ID = '3cd3e058-e3ff-42a5-ae4d-650ef9b45746';
// Signed with the project the SDK requires on a function token.
const ACCESS_TOKEN = [
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9',
  'eyJwcm9qZWN0X2lkIjoicHJvamVjdC0xMjMiLCJzdWIiOiJ1c2VyLTEifQ',
  'signature',
].join('.');

/** Starts a local HTTP server that answers from `respond` and records requests. */
async function startServer(respond) {
  const requests = [];
  const server = http.createServer((request, response) => {
    const chunks = [];
    request.on('data', (chunk) => chunks.push(chunk));
    request.on('end', async () => {
      const body = Buffer.concat(chunks).toString();
      requests.push({
        target: request.url,
        body: body ? JSON.parse(body) : null,
        authorization: request.headers.authorization || null,
      });
      const [status, payload, extraHeaders] = await respond(request.url);
      const encoded = JSON.stringify(payload);
      response.writeHead(status, {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(encoded),
        // The server stamps this on every response, errors included, so a test
        // that omits it would accept a client keying the retry off its absence.
        'X-Volcano-Version': 'test-build',
        ...extraHeaders,
      });
      response.end(encoded);
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    requests,
    url: `http://127.0.0.1:${server.address().port}`,
    targets: () => requests.map((request) => request.target),
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

function apiServer(resolvePayload, { status = 200, resolveDelayMs = 0 } = {}) {
  return startServer(async (target) => {
    if (!target.startsWith('/functions/resolve')) {
      return [200, { ok: 'via-api' }];
    }
    if (resolveDelayMs) {
      await new Promise((resolve) => setTimeout(resolve, resolveDelayMs));
    }
    return [status, resolvePayload];
  });
}

function client(apiUrl) {
  const volcano = new VolcanoAuth({ apiUrl, anonKey: 'ak-test-anon-key' });
  volcano.accessToken = ACCESS_TOKEN;
  return volcano;
}

describe('function invocation over HTTP', () => {
  let servers;

  beforeEach(() => {
    servers = [];
    // The shared setup mocks fetch; these tests need the real one.
    global.fetch = global.__realFetch;
    VolcanoAuth.__resetFunctionResolveCacheForTests?.();
  });

  afterEach(async () => {
    await Promise.all(servers.map((server) => server.close()));
  });

  const track = (server) => {
    servers.push(server);
    return server;
  };

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
      const { error, status } = await volcano.functions.invoke('my-function', { user_id: 'u-1' });
      expect(error).toBeNull();
      expect(status).toBe(200);
    }

    expect(api.targets()).toEqual(['/functions/resolve?name=my-function']);
    expect(functions.targets()).toEqual(['/', '/', '/']);
    expect(functions.requests[0].body).toEqual({ payload: { user_id: 'u-1' } });
    expect(functions.requests[0].authorization).toBe(`Bearer ${ACCESS_TOKEN}`);
  });

  it('falls back to the API path without a resolved endpoint', async () => {
    const functions = track(await startServer(() => [200, { ok: true }]));
    const api = track(
      await apiServer({ name: 'my-function', function_id: FUNCTION_ID, cache_ttl_seconds: 300 }),
    );

    const { error } = await client(api.url).functions.invoke('my-function', {});

    expect(error).toBeNull();
    expect(api.targets()).toEqual([
      '/functions/resolve?name=my-function',
      `/functions/${FUNCTION_ID}/invoke`,
    ]);
    expect(functions.targets()).toEqual([]);
  });

  it('does not re-resolve an unknown name on every attempt', async () => {
    const api = track(await apiServer({ error: 'function not found' }, { status: 404 }));
    const volcano = client(api.url);

    for (let attempt = 0; attempt < 3; attempt += 1) {
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

    const results = await Promise.all(
      Array.from({ length: 8 }, () => volcano.functions.invoke('my-function', {})),
    );

    expect(results.every((result) => result.error === null)).toBe(true);
    expect(api.targets()).toEqual(['/functions/resolve?name=my-function']);
    expect(functions.targets()).toHaveLength(8);
  });

  it('resolves a recreated function again after a platform 404', async () => {
    let invoked = 0;
    const api = track(
      await startServer((target) => {
        if (target.startsWith('/functions/resolve')) {
          return [200, { name: 'my-function', function_id: FUNCTION_ID, cache_ttl_seconds: 300 }];
        }
        invoked += 1;
        // The first invocation finds the cached identity gone. The platform
        // answers without the dispatch marker, which is the only thing telling
        // this apart from the function itself returning 404.
        return invoked === 1
          ? [404, { error: 'function not found' }]
          : [200, { ok: true }, { 'X-Volcano-Function-Invoked': 'true' }];
      }),
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

  // The server stamps x-volcano-version on every response, so a check keyed on
  // its absence never fires and every platform failure would be handed back as
  // though the function had answered.
  it('surfaces a platform refusal as a system error', async () => {
    const api = track(
      await startServer((target) => {
        if (target.startsWith('/functions/resolve')) {
          return [200, { name: 'my-function', function_id: FUNCTION_ID, cache_ttl_seconds: 300 }];
        }
        // No dispatch marker: the platform refused before the function ran.
        return [400, { error: 'function cannot be invoked (status: failed)' }];
      }),
    );

    const { data, status, error } = await client(api.url).functions.invoke('my-function', {});

    expect(data).toBeNull();
    expect(status).toBe(400);
    expect(error).not.toBeNull();
    expect(error.isSystemError).toBe(true);
    expect(error.message).toBe('function cannot be invoked (status: failed)');
  });

  it('returns a function-authored error as data, not a system error', async () => {
    const api = track(
      await startServer((target) => {
        if (target.startsWith('/functions/resolve')) {
          return [200, { name: 'my-function', function_id: FUNCTION_ID, cache_ttl_seconds: 300 }];
        }
        // The function ran and chose 400, so this is its answer.
        return [400, { error: 'bad input' }, { 'X-Volcano-Function-Invoked': 'true' }];
      }),
    );

    const { data, status, error } = await client(api.url).functions.invoke('my-function', {});

    expect(error).toBeNull();
    expect(status).toBe(400);
    expect(data).toEqual({ error: 'bad input' });
  });

  it('returns a function-authored 404 without invoking it twice', async () => {
    const api = track(
      await startServer((target) => {
        if (target.startsWith('/functions/resolve')) {
          return [200, { name: 'my-function', function_id: FUNCTION_ID, cache_ttl_seconds: 300 }];
        }
        // The function ran and chose 404. Retrying would repeat whatever it did
        // on the way to deciding that.
        return [404, { error: 'no such record' }, { 'X-Volcano-Function-Invoked': 'true' }];
      }),
    );

    const { status, error } = await client(api.url).functions.invoke('my-function', {});

    expect(status).toBe(404);
    expect(error).toBeNull();
    expect(api.targets()).toEqual([
      '/functions/resolve?name=my-function',
      `/functions/${FUNCTION_ID}/invoke`,
    ]);
  });
});
