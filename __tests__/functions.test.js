const { createVolcanoClient } = require('../src/index.ts');

const tokenForProject = (projectId, sessionId = 'session') => {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'none' })}.${encode({ project_id: projectId, sid: sessionId })}.signature`;
};

const jsonResponse = (body, status = 200, headers = {}) =>
  new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json', ...headers },
    status,
  });

const requestFromFetchCall = (index = 0) => {
  const [input, init] = global.fetch.mock.calls[index];
  return input instanceof Request ? input : new Request(input, init);
};

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

    const result = await volcano.functions.invoke('hello', { body: { name: 'Volcano' } });

    expect(result).toMatchObject({
      data: { greeting: 'hello' },
      error: null,
      status: 200,
      version: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    });
    expect(requestFromFetchCall().url).toBe('https://api.test.com/functions/resolve?name=hello');
    expect(requestFromFetchCall(1).url).toBe(
      'https://aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.functions.test.com/',
    );
    const invocationRequest = requestFromFetchCall(1);
    expect(invocationRequest.method).toBe('POST');
    await expect(invocationRequest.clone().json()).resolves.toEqual({
      payload: { name: 'Volcano' },
    });
    expect(invocationRequest.headers.get('Authorization')).toBe(`Bearer ${accessToken}`);
    expect(invocationRequest.headers.get('X-Client-Info')).toBe(
      'volcano-sdk-js/2.0.0; runtime=web',
    );
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
      global.fetch.mock.calls.filter((_call, index) =>
        requestFromFetchCall(index).url.includes('/functions/resolve'),
      ),
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
    expect(global.fetch.mock.calls.map((_call, index) => requestFromFetchCall(index).url)).toEqual([
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

  it('waits for an asynchronously persisted session before checking credentials', async () => {
    const accessToken = tokenForProject('50000000-0000-0000-0000-000000000005');
    const storedSession = {
      access_token: accessToken,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      expires_in: 3600,
      refresh_token: 'stored-refresh-token',
      user: { id: 'stored-user' },
    };
    const storage = {
      getItem: jest.fn(async () => JSON.stringify(storedSession)),
      removeItem: jest.fn(),
      setItem: jest.fn(),
    };
    global.fetch
      .mockResolvedValueOnce(
        jsonResponse({
          cache_ttl_seconds: 300,
          function_id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ ok: true }, 200, { 'X-Volcano-Version': 'v1' }));
    const volcano = createVolcanoClient({
      auth: { storage, storageKey: 'persisted-function-session' },
      baseUrl: 'https://api.test.com',
    });

    const result = await volcano.functions.invoke('persisted-function');

    expect(result.error).toBeNull();
    expect(requestFromFetchCall().headers.get('Authorization')).toBe(`Bearer ${accessToken}`);
  });

  it('applies a per-call timeout while resolving a function name', async () => {
    const accessToken = tokenForProject('60000000-0000-0000-0000-000000000006');
    let requestSignal;
    const fetchMock = jest.fn(
      (input, init) =>
        new Promise((_resolve, reject) => {
          requestSignal = input instanceof Request ? input.signal : init.signal;
          if (requestSignal.aborted) {
            reject(requestSignal.reason);
            return;
          }
          requestSignal.addEventListener('abort', () => reject(requestSignal.reason), {
            once: true,
          });
        }),
    );
    const volcano = createVolcanoClient({
      accessToken,
      auth: { persistSession: false },
      baseUrl: 'https://api.test.com',
      fetch: fetchMock,
    });
    const caller = new AbortController();
    const addAbortListener = jest.spyOn(caller.signal, 'addEventListener');

    const pending = volcano.functions.invoke('slow-resolver', {
      signal: caller.signal,
      timeoutMs: 10,
    });
    for (
      let attempt = 0;
      attempt < 100 && !addAbortListener.mock.calls.some(([type]) => type === 'abort');
      attempt += 1
    ) {
      await Promise.resolve();
    }
    expect(addAbortListener).toHaveBeenCalledWith('abort', expect.any(Function), {
      once: true,
    });
    const result = await pending;

    expect(requestSignal).toBeDefined();
    expect(requestSignal.aborted).toBe(true);
    expect(requestSignal.reason).toMatchObject({ name: 'TimeoutError' });
    expect(result.error).not.toBeNull();
  });
});
