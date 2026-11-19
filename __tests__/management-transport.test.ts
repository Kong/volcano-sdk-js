/** @jest-environment ./__tests__/node-environment.cjs */
import { afterEach, expect, jest, test } from '@jest/globals';
import { inspect } from 'node:util';
import { ManagementClient } from '../src/index.ts';

const originalFetch = globalThis.fetch;
const repositoryId = 'e7fc4fbf-5bfc-4971-868d-2ea49b712ae4';
const token = 'explicit-management-secret';

afterEach(() => {
  globalThis.fetch = originalFetch;
  jest.restoreAllMocks();
});

test.each(['', ' bad', 'bad token', 'bad\ntoken'])(
  'rejects invalid credentials without revealing them: %j',
  (invalid) => {
    expect(() => new ManagementClient({ token: invalid })).toThrow(/token/iu);
  },
);

test.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 2147483648])(
  'rejects unsupported timeout %s',
  (timeoutMs) => {
    expect(() => new ManagementClient({ token, timeoutMs })).toThrow(/timeout/iu);
  },
);

test.each([
  'ftp://example.com',
  '//example.com',
  'https://user:secret@example.com',
  'https://example.com?query=1',
  'https://example.com#fragment',
  'https://example.com?',
  'https://example.com#',
  'https://exam\nple.com',
])('rejects unsafe API base %s', (apiUrl) => {
  expect(() => new ManagementClient({ token, apiUrl })).toThrow(/apiUrl/u);
});

test('normal inspection cannot reveal the credential', () => {
  const client = new ManagementClient({ token });
  expect(inspect(client, { showHidden: true, depth: 10 })).not.toContain(token);
});

test('all error fields are fresh and redacted, retaining only safe scalar metadata', async () => {
  globalThis.fetch = jest.fn<typeof fetch>().mockResolvedValue(
    Response.json(
      {
        error: `Bearer ${token} again ${token}`,
        code: `provider_${token}`,
        nested: { authorization: `Bearer ${token}` },
      },
      { status: 429, headers: { 'Retry-After': '7' } },
    ),
  );
  const result = await new ManagementClient({ token }).git.repositories.get(repositoryId);
  expect(result.error).toMatchObject({ status: 429, retryAfter: 7, code: 'provider_[redacted]' });
  expect(result.error?.message).toBe('Management request failed with status 429');
  expect(result.error).not.toHaveProperty('info');
  expect(result.error).not.toHaveProperty('cause');
  expect(inspect(result, { showHidden: true, depth: 10 })).not.toContain(token);
  expect(JSON.stringify(result)).not.toContain(token);
});

test('structured server codes never escape as arbitrary response objects', async () => {
  globalThis.fetch = jest
    .fn<typeof fetch>()
    .mockResolvedValue(Response.json({ error: 'refused', code: { token } }, { status: 403 }));
  const result = await new ManagementClient({ token }).git.repositories.get(repositoryId);
  expect(result.error).toMatchObject({ status: 403 });
  expect(result.error).not.toHaveProperty('code');
});

test('already-canceled calls perform no fetch and redact the caller reason', async () => {
  const fetchMock = jest.fn<typeof fetch>();
  globalThis.fetch = fetchMock;
  const controller = new AbortController();
  controller.abort(new Error(`caller echoed ${token}`));
  const result = await new ManagementClient({ token }).git.repositories.get(repositoryId, {
    signal: controller.signal,
  });
  expect(result.error?.message).toBe('Management request failed');
  expect(fetchMock).not.toHaveBeenCalled();
});

function signalFor(options: RequestInit | undefined): AbortSignal {
  const signal = options?.signal;
  if (signal === undefined || signal === null) {
    throw new TypeError('Expected a request signal');
  }
  return signal;
}

test('timeout cancels stalled response headers with no retry', async () => {
  const fetchMock = jest.fn<typeof fetch>().mockImplementation(
    (_url, options) =>
      new Promise((_resolve, reject) => {
        signalFor(options).addEventListener(
          'abort',
          () => {
            reject(new DOMException('aborted', 'AbortError'));
          },
          { once: true },
        );
      }),
  );
  globalThis.fetch = fetchMock;
  const result = await new ManagementClient({ token, timeoutMs: 20 }).git.repositories.get(repositoryId);
  expect(result.error).toBeInstanceOf(Error);
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(signalFor(fetchMock.mock.calls[0]?.[1]).aborted).toBe(true);
});

function stalledBody(signal: AbortSignal): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      signal.addEventListener(
        'abort',
        () => {
          controller.error(signal.reason);
        },
        { once: true },
      );
    },
  });
  return new Response(stream, { headers: { 'content-type': 'application/json' } });
}

test('timeout remains active after response headers while reading the body', async () => {
  const fetchMock = jest
    .fn<typeof fetch>()
    .mockImplementation((_url, options) => Promise.resolve(stalledBody(signalFor(options))));
  globalThis.fetch = fetchMock;
  const result = await new ManagementClient({ token, timeoutMs: 20 }).git.repositories.get(repositoryId);
  expect(result.error).toBeInstanceOf(Error);
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(signalFor(fetchMock.mock.calls[0]?.[1]).aborted).toBe(true);
});

test('caller cancellation reaches an active body read and never retains its raw reason', async () => {
  const caller = new AbortController();
  let markStarted: (() => void) | undefined;
  const started = new Promise<void>((resolve) => {
    markStarted = resolve;
  });
  const fetchMock = jest.fn<typeof fetch>().mockImplementation((_url, options) => {
    const response = stalledBody(signalFor(options));
    markStarted?.();
    return Promise.resolve(response);
  });
  globalThis.fetch = fetchMock;
  const request = new ManagementClient({ token }).git.repositories.get(repositoryId, { signal: caller.signal });
  await started;
  caller.abort(new Error(`cancel ${token}`));
  const result = await request;
  expect(result.error?.message).toBe('Management request failed');
  expect(result.error).not.toHaveProperty('cause');
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

test('success and failure clean up timers and caller listeners', async () => {
  const clear = jest.spyOn(globalThis, 'clearTimeout');
  const caller = new AbortController();
  const remove = jest.spyOn(caller.signal, 'removeEventListener');
  const fetchMock = jest.fn<typeof fetch>().mockResolvedValue(Response.json({ error: 'refused' }, { status: 401 }));
  globalThis.fetch = fetchMock;
  await new ManagementClient({ token }).git.repositories.get(repositoryId, { signal: caller.signal });
  expect(clear).toHaveBeenCalledTimes(1);
  expect(remove).toHaveBeenCalledWith('abort', expect.any(Function));
});

test.each(['message', 'status', 'code', 'retryAfter'])(
  'cancellation reason %s accessors are never invoked',
  async (key) => {
    const fetchMock = jest.fn<typeof fetch>();
    globalThis.fetch = fetchMock;
    const accessor = jest.fn(() => {
      throw new Error(`raw ${token}`);
    });
    const reason = new Error(`cancel ${token}`);
    Object.defineProperty(reason, key, { get: accessor });
    const caller = new AbortController();
    caller.abort(reason);
    const result = await new ManagementClient({ token }).git.repositories.get(repositoryId, { signal: caller.signal });
    expect(result.error?.message).toBe('Management request failed');
    expect(inspect(result, { showHidden: true, depth: 10 })).not.toContain(token);
    expect(accessor).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  },
);

test('a revoked proxy reason cannot escape the result envelope', async () => {
  const fetchMock = jest.fn<typeof fetch>();
  globalThis.fetch = fetchMock;
  const reason = Proxy.revocable({}, {});
  reason.revoke();
  const caller = new AbortController();
  caller.abort(reason.proxy);
  const result = await new ManagementClient({ token }).git.repositories.get(repositoryId, { signal: caller.signal });
  expect(result.error?.message).toBe('Management request failed');
  expect(result.error).not.toHaveProperty('cause');
  expect(fetchMock).not.toHaveBeenCalled();
});

test.each([200, 401])('malformed JSON with a credential never exposes parser excerpts (HTTP %s)', async (status) => {
  globalThis.fetch = jest.fn<typeof fetch>().mockResolvedValue(
    new Response(token, {
      status,
      headers: { 'content-type': 'application/json' },
    }),
  );
  const result = await new ManagementClient({ token }).git.repositories.get(repositoryId);
  expect(result.error?.message).toBe('Management request failed');
  expect(inspect(result, { showHidden: true, depth: 10 })).not.toContain(token.slice(0, 10));
  expect(JSON.stringify(result)).not.toContain(token.slice(0, 10));
});
