/** @jest-environment node */
import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import { fetchWithTimeout } from '../src/fetch-lifecycle.ts';

const endpoint = 'https://api.example.test/resource';

function uninitializedResolver(): never {
  throw new Error('Promise executor did not initialize');
}

function deferred<Result>(): {
  promise: Promise<Result>;
  resolve: (value: Result) => void;
  reject: (error: unknown) => void;
} {
  let resolve: (value: Result) => void = uninitializedResolver;
  let reject: (error: unknown) => void = uninitializedResolver;
  const promise = new Promise<Result>((accept, fail) => {
    resolve = accept;
    reject = fail;
  });
  return { promise, resolve, reject };
}

function requestSignal(request: jest.SpiedFunction<typeof fetch>): AbortSignal {
  const signal = request.mock.calls[0]?.[1]?.signal;
  if (signal == null) {
    throw new Error('Fetch did not receive an AbortSignal');
  }
  return signal;
}

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  expect(jest.getTimerCount()).toBe(0);
  jest.restoreAllMocks();
  jest.useRealTimers();
});

test('returns the response and preserves request options', async () => {
  const response = new Response('ok');
  const request = jest.spyOn(globalThis, 'fetch').mockResolvedValue(response);
  const options: RequestInit = { method: 'POST', headers: { 'x-request': 'value' }, body: 'body' };
  const result: Response = await fetchWithTimeout(endpoint, options);

  expect(result).toBe(response);
  expect(request).toHaveBeenCalledWith(endpoint, { ...options, signal: expect.any(AbortSignal) });
  expect(options.signal).toBeUndefined();
});

test.each([undefined, null])('accepts an absent caller signal: %p', async (signal) => {
  const response = new Response('ok');
  jest.spyOn(globalThis, 'fetch').mockResolvedValue(response);
  const options: RequestInit = signal === undefined ? {} : { signal };
  await expect(fetchWithTimeout(endpoint, options)).resolves.toBe(response);
});

test('awaits the typed response consumer before clearing the timeout', async () => {
  const body = deferred<string>();
  const response = new Response('ok');
  jest.spyOn(globalThis, 'fetch').mockResolvedValue(response);
  const consume = jest
    .fn<(value: Response, signal: AbortSignal) => Promise<string>>()
    .mockReturnValue(body.promise);
  const running: Promise<string> = fetchWithTimeout(endpoint, {}, 100, consume);
  await jest.advanceTimersByTimeAsync(0);

  expect(consume).toHaveBeenCalledWith(response, expect.any(AbortSignal));
  expect(jest.getTimerCount()).toBe(1);
  body.resolve('decoded');
  await expect(running).resolves.toBe('decoded');
});

test('supports a synchronous typed consumer', async () => {
  jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('ok', { status: 201 }));
  const result: number = await fetchWithTimeout(endpoint, {}, 100, (response) => response.status);
  expect(result).toBe(201);
});

test('aborts a pending request at the default timeout and retains its cause', async () => {
  const pending = deferred<Response>();
  const request = jest.spyOn(globalThis, 'fetch').mockReturnValue(pending.promise);
  const error = new DOMException('aborted', 'AbortError');
  const running = fetchWithTimeout(endpoint);

  await jest.advanceTimersByTimeAsync(59999);
  expect(requestSignal(request).aborted).toBe(false);
  await jest.advanceTimersByTimeAsync(1);
  expect(requestSignal(request).aborted).toBe(true);
  pending.reject(error);
  await expect(running).rejects.toMatchObject({
    message: 'Request timeout after 60000ms',
    cause: error,
  });
});

test('keeps the timeout active while consuming the response body', async () => {
  const body = deferred<string>();
  const caller = new AbortController();
  const request = jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('ok'));
  const running = fetchWithTimeout(endpoint, { signal: caller.signal }, 50, () => body.promise);

  await jest.advanceTimersByTimeAsync(50);
  expect(requestSignal(request).aborted).toBe(true);
  expect(caller.signal.aborted).toBe(false);
  body.reject(new DOMException('body aborted', 'AbortError'));
  await expect(running).rejects.toThrow('Request timeout after 50ms');
});

test('forwards preexisting cancellation without attaching a listener', async () => {
  const caller = new AbortController();
  const reason = new Error('cancelled before request');
  caller.abort(reason);
  const attach = jest.spyOn(caller.signal, 'addEventListener');
  const request = jest.spyOn(globalThis, 'fetch').mockRejectedValue(reason);

  await expect(fetchWithTimeout(endpoint, { signal: caller.signal })).rejects.toBe(reason);
  expect(requestSignal(request).reason).toBe(reason);
  expect(attach).not.toHaveBeenCalled();
});

test('forwards caller cancellation and removes its listener after rejection', async () => {
  const pending = deferred<Response>();
  const caller = new AbortController();
  const reason = new Error('cancelled by caller');
  const request = jest.spyOn(globalThis, 'fetch').mockReturnValue(pending.promise);
  const remove = jest.spyOn(caller.signal, 'removeEventListener');
  const running = fetchWithTimeout(endpoint, { signal: caller.signal });

  caller.abort(reason);
  expect(requestSignal(request).reason).toBe(reason);
  pending.reject(reason);
  await expect(running).rejects.toBe(reason);
  expect(remove).toHaveBeenCalledWith('abort', expect.any(Function));
});

test('preserves caller cancellation even when the request timeout also fires', async () => {
  const pending = deferred<Response>();
  const caller = new AbortController();
  const error = new DOMException('caller cancelled', 'AbortError');
  jest.spyOn(globalThis, 'fetch').mockReturnValue(pending.promise);
  const running = fetchWithTimeout(endpoint, { signal: caller.signal }, 50);

  caller.abort(error);
  await jest.advanceTimersByTimeAsync(50);
  pending.reject(error);
  await expect(running).rejects.toBe(error);
});

test('removes the caller listener after success', async () => {
  const caller = new AbortController();
  const request = jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('ok'));
  const remove = jest.spyOn(caller.signal, 'removeEventListener');
  await fetchWithTimeout(endpoint, { signal: caller.signal });
  caller.abort();

  expect(remove).toHaveBeenCalledWith('abort', expect.any(Function));
  expect(requestSignal(request).aborted).toBe(false);
});

test('cleans up the captured signal when request options are later changed', async () => {
  const pending = deferred<Response>();
  const caller = new AbortController();
  const replacement = new AbortController();
  const options: RequestInit = { signal: caller.signal };
  const remove = jest.spyOn(caller.signal, 'removeEventListener');
  const request = jest.spyOn(globalThis, 'fetch').mockReturnValue(pending.promise);
  const running = fetchWithTimeout(endpoint, options);
  options.signal = replacement.signal;
  pending.resolve(new Response('ok'));
  await running;
  caller.abort();

  expect(remove).toHaveBeenCalledWith('abort', expect.any(Function));
  expect(requestSignal(request).aborted).toBe(false);
});

test.each([
  undefined,
  null,
  'failure',
  5,
  {},
  { name: 'OtherError' },
  new Error('network failed'),
  () => 'failure',
])('preserves non-timeout rejection values: %p', async (reason) => {
  jest.spyOn(globalThis, 'fetch').mockRejectedValue(reason);
  await expect(fetchWithTimeout(endpoint)).rejects.toBe(reason);
});

test('preserves an AbortError when the timer did not expire', async () => {
  const error = new DOMException('transport cancelled', 'AbortError');
  jest.spyOn(globalThis, 'fetch').mockRejectedValue(error);
  await expect(fetchWithTimeout(endpoint)).rejects.toBe(error);
});

test('cleans up when the response consumer throws', async () => {
  const caller = new AbortController();
  const remove = jest.spyOn(caller.signal, 'removeEventListener');
  const error = new Error('invalid response');
  jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('ok'));
  const consume = jest
    .fn<(response: Response, signal: AbortSignal) => never>()
    .mockImplementation(() => {
      throw error;
    });

  await expect(fetchWithTimeout(endpoint, { signal: caller.signal }, 50, consume)).rejects.toBe(
    error,
  );
  expect(remove).toHaveBeenCalledWith('abort', expect.any(Function));
});
