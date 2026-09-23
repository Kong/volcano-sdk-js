/** @jest-environment node */
import { expect, test } from '@jest/globals';
import { VolcanoSystemError } from '../src/errors.ts';
import {
  functionInvokeResult,
  functionWasDispatched,
} from '../src/function-invocation-response.ts';

test('uses the dispatch marker instead of the version header', () => {
  expect(
    functionWasDispatched(new Response(null, { headers: { 'X-Volcano-Version': 'v1' } })),
  ).toBe(false);
  expect(
    functionWasDispatched(new Response(null, { headers: { 'X-Volcano-Function-Invoked': '1' } })),
  ).toBe(true);
});

test('preserves a successful function response and its version', async () => {
  const response = Response.json(
    { ok: true },
    { headers: { 'X-Volcano-Version': 'dev-v1', 'X-Request-ID': 'abc' } },
  );
  await expect(functionInvokeResult(response, true)).resolves.toMatchObject({
    data: { ok: true },
    status: 200,
    version: 'dev-v1',
    headers: { 'x-request-id': 'abc' },
    error: null,
  });
});

test('returns a function-authored 404 as data without a system error', async () => {
  const response = Response.json({ error: 'not found by function' }, { status: 404 });
  await expect(functionInvokeResult(response, true)).resolves.toMatchObject({
    data: { error: 'not found by function' },
    status: 404,
    version: null,
    error: null,
  });
});

test('retains status, code, and retry metadata for a platform failure', async () => {
  const response = Response.json(
    { error: 'deployment unavailable', code: 'DEPLOY_FAILED' },
    { status: 503, headers: { 'Retry-After': '4', 'X-Volcano-Version': '' } },
  );
  const result = await functionInvokeResult(response, false);
  expect(result.data).toBeNull();
  expect(result.version).toBeNull();
  expect(result.error).toBeInstanceOf(VolcanoSystemError);
  expect(result.error).toMatchObject({ message: 'deployment unavailable' });
  expect(result.error).toMatchObject({ status: 503, code: 'DEPLOY_FAILED', retryAfter: 4 });
});

test.each([
  ['plain text', 'Invoke request failed with status 503'],
  [null, 'Invoke request failed with status 503'],
  [{}, 'Invoke request failed with status 503'],
  [{ error: '' }, 'Invoke request failed with status 503'],
  [{ error: 12 }, '12'],
])('uses a stable platform message for malformed error payload %p', async (payload, message) => {
  const response = Response.json(payload, { status: 503 });
  const result = await functionInvokeResult(response, false);
  expect(result.error?.message).toBe(message);
});

test('rejects a non-string version at the response boundary', async () => {
  const response = {
    ok: true,
    status: 200,
    text: () => Promise.resolve('ok'),
    headers: {
      get: (name: string): unknown => (name === 'x-volcano-version' ? 42 : null),
    },
  };
  await expect(functionInvokeResult(response, false)).resolves.toMatchObject({
    data: 'ok',
    version: null,
  });
});
