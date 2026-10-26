/** @jest-environment ./__tests__/node-environment.cjs */
import { beforeEach, describe, expect, it } from '@jest/globals';
import { VolcanoAuth } from '../src/index.ts';
import { reply } from './auth-concurrency-fixtures.ts';
import { testAccessToken } from './auth-token-fixtures.ts';
import { config, fetchMock, resolvedFunction, withBrowserWindow } from './support/volcano-auth-functions-fixtures.ts';

const TEST_ACCESS_TOKEN = testAccessToken();
let volcano: VolcanoAuth;

withBrowserWindow();

beforeEach(() => {
  volcano = new VolcanoAuth(config);
});

function trustsOnlySecureInvokeUrls(): void {
  it('should invoke on any apiUrl because the server supplies the invocation URL', async () => {
    const customVolcano = new VolcanoAuth({
      apiUrl: 'https://edge.example.com',
      anonKey: 'ak-test-anon-key',
    });
    customVolcano.accessToken = TEST_ACCESS_TOKEN;

    fetchMock.mockResolvedValueOnce(resolvedFunction('my-function'));
    fetchMock.mockResolvedValueOnce(reply(200, { ok: true }));

    const { error } = await customVolcano.functions.invoke('my-function', {});

    expect(error).toBeNull();
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      'https://3cd3e058-e3ff-42a5-ae4d-650ef9b45746.functions.test.run/',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('should refuse a plaintext invoke_url when the API is https', async () => {
    volcano.accessToken = TEST_ACCESS_TOKEN;
    const insecureUrl = new URL('https://3cd3e058-e3ff-42a5-ae4d-650ef9b45746.functions.test.run/');
    insecureUrl.protocol = 'http:';

    fetchMock.mockResolvedValueOnce(
      reply(200, {
        name: 'my-function',
        function_id: '3cd3e058-e3ff-42a5-ae4d-650ef9b45746',
        invoke_url: insecureUrl.href,
        cache_ttl_seconds: 300,
      }),
    );
    fetchMock.mockResolvedValueOnce(reply(200, { ok: true }));

    const { error } = await volcano.functions.invoke('my-function', {});

    // Sending the bearer token in the clear would downgrade a credential the
    // https API keeps encrypted, so the API path is used instead.
    expect(error).toBeNull();
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      `${volcano.apiUrl}/functions/3cd3e058-e3ff-42a5-ae4d-650ef9b45746/invoke`,
      expect.objectContaining({ method: 'POST' }),
    );
  });
}

function invokesThroughApiWithoutInvokeUrl(): void {
  it('should invoke through the API path when the resolve response omits invoke_url', async () => {
    volcano.accessToken = TEST_ACCESS_TOKEN;

    fetchMock.mockResolvedValueOnce(
      reply(200, {
        name: 'my-function',
        function_id: '3cd3e058-e3ff-42a5-ae4d-650ef9b45746',
        cache_ttl_seconds: 300,
      }),
    );
    fetchMock.mockResolvedValueOnce(reply(200, { ok: true }));

    const { error } = await volcano.functions.invoke('my-function', {});

    expect(error).toBeNull();
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      `${volcano.apiUrl}/functions/3cd3e058-e3ff-42a5-ae4d-650ef9b45746/invoke`,
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('should use direct invoke path on localhost, where resolve omits invoke_url', async () => {
    const localVolcano = new VolcanoAuth({
      apiUrl: 'http://localhost:8000',
      anonKey: 'ak-test-anon-key',
    });
    localVolcano.accessToken = TEST_ACCESS_TOKEN;

    fetchMock.mockResolvedValueOnce(
      reply(200, {
        name: 'my-function',
        function_id: '3cd3e058-e3ff-42a5-ae4d-650ef9b45746',
        cache_ttl_seconds: 300,
      }),
    );
    fetchMock.mockResolvedValueOnce(reply(200, { result: 'success' }));

    const { error } = await localVolcano.functions.invoke('my-function', {});

    expect(error).toBeNull();
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      'http://localhost:8000/functions/3cd3e058-e3ff-42a5-ae4d-650ef9b45746/invoke',
      expect.objectContaining({ method: 'POST' }),
    );
  });
}

function fallsBackFromMalformedInvokeUrls(): void {
  it.each([
    ['an unclosed IPv6 literal', 'https://['],
    ['a port out of range', 'https://example.test:99999/'],
    ['whitespace in the host', 'https://exa mple.test/'],
  ])('should fall back to the API path for %s', async (_label, invokeUrl) => {
    volcano.accessToken = TEST_ACCESS_TOKEN;

    fetchMock.mockResolvedValueOnce(
      reply(200, {
        name: 'my-function',
        function_id: '3cd3e058-e3ff-42a5-ae4d-650ef9b45746',
        invoke_url: invokeUrl,
        cache_ttl_seconds: 300,
      }),
    );
    fetchMock.mockResolvedValueOnce(reply(200, { ok: true }));

    const { error } = await volcano.functions.invoke('my-function', {});

    // A malformed endpoint is unusable, not fatal: the invocation still goes
    // through the API path rather than raising out of invoke().
    expect(error).toBeNull();
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      `${volcano.apiUrl}/functions/3cd3e058-e3ff-42a5-ae4d-650ef9b45746/invoke`,
      expect.objectContaining({ method: 'POST' }),
    );
  });
}

describe('VolcanoAuth function invocation and auth races', () => {
  trustsOnlySecureInvokeUrls();
  invokesThroughApiWithoutInvokeUrl();
  fallsBackFromMalformedInvokeUrls();
});
