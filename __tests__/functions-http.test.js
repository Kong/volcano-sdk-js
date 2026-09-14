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
    request.on('end', () => {
      const body = Buffer.concat(chunks).toString();
      requests.push({
        target: request.url,
        body: body ? JSON.parse(body) : null,
        authorization: request.headers.authorization || null,
      });
      const [status, payload] = respond(request.url);
      const encoded = JSON.stringify(payload);
      response.writeHead(status, {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(encoded),
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

function apiServer(resolvePayload, status = 200) {
  return startServer((target) =>
    target.startsWith('/functions/resolve') ? [status, resolvePayload] : [200, { ok: 'via-api' }],
  );
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
    const api = track(await apiServer({ error: 'function not found' }, 404));
    const volcano = client(api.url);

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const { error } = await volcano.functions.invoke('missing-function', {});
      expect(error).toBeDefined();
    }

    expect(api.targets()).toEqual(['/functions/resolve?name=missing-function']);
  });
});
