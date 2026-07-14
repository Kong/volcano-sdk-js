const { createVolcanoClient } = require('../src/index.js');

const tokenForProject = (projectId, sessionId = 'session') => {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'none' })}.${encode({ project_id: projectId, sid: sessionId })}.signature`;
};

const jsonResponse = (body, status = 200, headers = {}) =>
  new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json', ...headers },
    status,
  });

describe('DNS function invocation', () => {
  it('resolves the function name, invokes its DNS host, and returns version metadata', async () => {
    const accessToken = tokenForProject('10000000-0000-0000-0000-000000000001');
    global.fetch
      .mockResolvedValueOnce(
        jsonResponse({
          cache_ttl_seconds: 300,
          function_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          name: 'hello',
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({ greeting: 'hello' }, 200, {
          'X-Volcano-Version': 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        }),
      );
    const volcano = createVolcanoClient({
      accessToken,
      baseUrl: 'https://api.test.com',
    });

    const result = await volcano.functions.invoke('hello', { name: 'Volcano' });

    expect(result).toMatchObject({
      data: { greeting: 'hello' },
      error: null,
      status: 200,
      version: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    });
    expect(global.fetch.mock.calls[0][0]).toBe('https://api.test.com/functions/resolve?name=hello');
    expect(global.fetch.mock.calls[1][0]).toBe(
      'https://aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.functions.test.com/',
    );
    expect(global.fetch.mock.calls[1][1]).toMatchObject({
      body: JSON.stringify({ name: 'Volcano' }),
      method: 'POST',
    });
    expect(global.fetch.mock.calls[1][1].headers.Authorization).toBe(`Bearer ${accessToken}`);
  });

  it('caches successful resolutions', async () => {
    const accessToken = tokenForProject('20000000-0000-0000-0000-000000000002');
    global.fetch
      .mockResolvedValueOnce(
        jsonResponse({
          cache_ttl_seconds: 300,
          function_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        }),
      )
      .mockResolvedValue(jsonResponse({ ok: true }, 200, { 'X-Volcano-Version': 'v1' }));
    const volcano = createVolcanoClient({ accessToken, baseUrl: 'https://api.test.com' });

    await volcano.functions.invoke('cached-function');
    await volcano.functions.invoke('cached-function');

    expect(global.fetch).toHaveBeenCalledTimes(3);
    expect(
      global.fetch.mock.calls.filter(([url]) => String(url).includes('/functions/resolve')),
    ).toHaveLength(1);
  });

  it('invalidates a stale resolution after a 404 and retries with the new function id', async () => {
    const accessToken = tokenForProject('30000000-0000-0000-0000-000000000003');
    global.fetch
      .mockResolvedValueOnce(
        jsonResponse({
          cache_ttl_seconds: 300,
          function_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ error: 'not found' }, 404))
      .mockResolvedValueOnce(
        jsonResponse({
          cache_ttl_seconds: 300,
          function_id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ ok: true }, 200, { 'X-Volcano-Version': 'v2' }));
    const volcano = createVolcanoClient({ accessToken, baseUrl: 'https://api.test.com' });

    const result = await volcano.functions.invoke('recreated-function');

    expect(result.error).toBeNull();
    expect(global.fetch.mock.calls.map(([url]) => url)).toEqual([
      'https://api.test.com/functions/resolve?name=recreated-function',
      'https://cccccccc-cccc-4ccc-8ccc-cccccccccccc.functions.test.com/',
      'https://api.test.com/functions/resolve?name=recreated-function',
      'https://dddddddd-dddd-4ddd-8ddd-dddddddddddd.functions.test.com/',
    ]);
  });

  it('rejects invalid DNS names before making a request', async () => {
    const volcano = createVolcanoClient({
      accessToken: tokenForProject('40000000-0000-0000-0000-000000000004'),
    });

    const result = await volcano.functions.invoke('../admin');

    expect(result.error.message).toContain('DNS-safe');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('requires an invocation credential', async () => {
    const volcano = createVolcanoClient();

    const result = await volcano.functions.invoke('hello');

    expect(result.error.message).toBe('No active session');
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
