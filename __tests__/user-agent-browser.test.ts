/** @jest-environment ./__tests__/browser-environment.cjs */
import { expect, jest, test } from '@jest/globals';
import { postToPlatform } from '../src/durable-platform-request.ts';
import { fetchWithTimeout } from '../src/fetch-lifecycle.ts';
import { VolcanoAuth } from '../src/index.ts';
import { createServerClient } from '../src/next/middleware.ts';
import { identifiedWebSocket } from '../src/realtime-websocket.ts';
import { sdkUserAgent } from '../src/user-agent.ts';

// Browsers send their own User-Agent; a header the SDK added could also make
// the request need a CORS preflight the API does not allow.
const fetchMock = jest.mocked(globalThis.fetch);

function sentHeaders(): Headers[] {
  return fetchMock.mock.calls.map(([, init]) => new Headers(init?.headers));
}

test('browsers get no SDK User-Agent', () => {
  expect(sdkUserAgent()).toBeNull();
  expect(identifiedWebSocket(window.WebSocket, sdkUserAgent())).toBe(window.WebSocket);
});

test('browser requests carry only the headers the SDK already sends', async () => {
  fetchMock.mockImplementation(() => Promise.resolve(Response.json({})));
  const options = { headers: { 'Content-Type': 'application/json' } };

  await fetchWithTimeout('https://api.test.com/resource', options);
  await new VolcanoAuth({ apiUrl: 'https://api.test.com', anonKey: 'ak-test' }).auth.resetPasswordForEmail(
    'user@example.com',
  );
  await postToPlatform('https://api.test.com', { path: '/durable-callbacks', body: {}, action: 'a', subject: 's' });
  await createServerClient({ apiUrl: 'https://api.test.com', anonKey: 'ak-test' }).getUser('token');

  expect(fetchMock).toHaveBeenCalledTimes(4);
  expect(fetchMock.mock.calls[0]?.[1]?.headers).toBe(options.headers);
  for (const headers of sentHeaders()) {
    expect([...headers.keys()].every((name) => ['authorization', 'content-type', 'x-anon-key'].includes(name))).toBe(
      true,
    );
  }
});
