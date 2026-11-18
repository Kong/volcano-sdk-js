/**
 * @jest-environment ./__tests__/node-environment.cjs
 *
 * Every request the SDK sends from Node.js identifies the SDK on the wire.
 * A local server records the User-Agent each request arrives with, so these
 * also prove the runtime's fetch does not replace the header.
 */

import * as http from 'node:http';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from '@jest/globals';
import { WebSocket as NodeWebSocket, WebSocketServer } from 'ws';
import { postToPlatform } from '../src/durable-platform-request.ts';
import { VolcanoAuth } from '../src/index.ts';
import { createServerClient } from '../src/next/middleware.ts';
import { loadWebSocket } from '../src/realtime-websocket.ts';
import { realFetch } from './setup.ts';
import { NODE_USER_AGENT } from './support/user-agent.ts';

interface Recorded {
  method: string;
  path: string;
  userAgent: string | undefined;
}

const ACCESS_TOKEN = [
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9',
  'eyJwcm9qZWN0X2lkIjoicHJvamVjdC0xMjMiLCJzdWIiOiJ1c2VyLTEifQ',
  'signature',
].join('.');
const PROJECT_ID = '11111111-1111-4111-8111-111111111111';
const user = {
  id: 'user-1',
  email: 'user@example.com',
  status: 'active',
  created_at: '2026-08-26T12:00:00Z',
  updated_at: '2026-08-26T12:00:00Z',
};

const recorded: Recorded[] = [];
let server: http.Server;
let apiUrl = '';

function reply(path: string): unknown {
  if (path.startsWith('/auth/signin')) {
    return { user, access_token: ACCESS_TOKEN, refresh_token: 'refresh', expires_in: 3600, token_type: 'bearer' };
  }
  if (path.startsWith('/functions/resolve')) {
    return { name: 'greet', function_id: PROJECT_ID, invoke_url: `${apiUrl}/direct/`, cache_ttl_seconds: 300 };
  }
  return { user, data: [], count: 0 };
}

function answer(request: http.IncomingMessage, response: http.ServerResponse): void {
  const path = request.url ?? '';
  recorded.push({ method: request.method ?? '', path, userAgent: request.headers['user-agent'] });
  request.resume();
  request.on('end', () => {
    const body = JSON.stringify(reply(path));
    response.writeHead(200, { 'Content-Type': 'application/json', 'X-Volcano-Version': 'test-build' });
    response.end(body);
  });
}

function client(): VolcanoAuth {
  return new VolcanoAuth({ apiUrl, anonKey: 'ak-test-anon-key', accessToken: ACCESS_TOKEN });
}

beforeAll(async () => {
  globalThis.fetch = realFetch;
  server = http.createServer(answer);
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new TypeError('Expected a bound TCP port');
  }
  apiUrl = `http://127.0.0.1:${String(address.port)}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error === undefined) {
        resolve();
      } else {
        reject(error);
      }
    });
  });
});

beforeEach(() => {
  globalThis.fetch = realFetch;
  recorded.length = 0;
});

const file = (): Blob => new Blob(['hello'], { type: 'text/plain' });

const requestPaths: [string, RegExp, (volcano: VolcanoAuth) => Promise<unknown>][] = [
  ['auth sign-in', /^\/auth\/signin/u, (v) => v.auth.signIn({ email: 'user@example.com', password: 'secret' })],
  ['auth user', /^\/auth\/user/u, (v) => v.auth.getUser()],
  ['database select', /select/u, (v) => v.database('app').from('notes').select('*').execute()],
  ['database insert', /insert/u, (v) => v.database('app').insert('notes', { title: 'a' }).execute()],
  ['storage upload', /^\/storage\//u, (v) => v.storage.from('files').upload('a.txt', file())],
  ['storage download', /^\/storage\//u, (v) => v.storage.from('files').download('a.txt')],
  ['storage list', /^\/storage\//u, (v) => v.storage.from('files').list()],
  [
    'storage upload session',
    /^\/storage\//u,
    (v) => v.storage.from('files').createUploadSession('a.txt', { totalSize: 5 }),
  ],
  ['function resolution', /^\/functions\/resolve/u, (v) => v.functions.invoke('greet', {})],
  ['function invoke URL', /^\/direct\//u, (v) => v.functions.invoke('greet', {})],
  ['durable start', /durable/u, (v) => v.durable.start('order-pipeline', {})],
  ['durable execution', /durable/u, (v) => v.durable.getFromApplication('order-pipeline', 'exec-1')],
  ['durable approvals', /durable-approvals/u, (v) => v.durable.approvals.list(PROJECT_ID)],
  ['locks', /locks/u, (v) => v.locks.get('job')],
  ['logs', /logs/u, (v) => v.logs.search(PROJECT_ID, { resource: { type: 'function' } })],
  ['sandboxes', /sandbox/u, (v) => v.sandboxes.get(PROJECT_ID)],
];

describe('requests from Node.js identify the SDK', () => {
  it('sends the SDK, its version, and the runtime', () => {
    expect(NODE_USER_AGENT).toMatch(
      /^volcano-sdk-js\/\d+\.\d+\.\d+\S* \(node\/\d+\.\d+\.\d+; [a-z0-9]+\/[a-z0-9_]+\)$/u,
    );
  });

  it.each(requestPaths)('%s', async (_name, path, send) => {
    await send(client());

    const matching = recorded.filter((request) => path.test(request.path));
    expect(matching).not.toHaveLength(0);
    expect(recorded.map(({ userAgent }) => userAgent)).toEqual(recorded.map(() => NODE_USER_AGENT));
  });

  it('durable runtime requests', async () => {
    await postToPlatform(apiUrl, { path: '/durable-callbacks', body: {}, action: 'register', subject: 'it' });

    expect(recorded).toEqual([{ method: 'POST', path: '/durable-callbacks', userAgent: NODE_USER_AGENT }]);
  });

  it('Next.js middleware requests', async () => {
    const middleware = createServerClient({ apiUrl, anonKey: 'ak-test-anon-key' });
    await middleware.getUser(ACCESS_TOKEN);
    await middleware.refreshToken('refresh');

    expect(recorded).toEqual([
      { method: 'GET', path: '/auth/user', userAgent: NODE_USER_AGENT },
      { method: 'POST', path: '/auth/refresh', userAgent: NODE_USER_AGENT },
    ]);
  });
});

function portOf(sockets: WebSocketServer): number {
  const address = sockets.address();
  if (address === null || typeof address === 'string') {
    throw new TypeError('Expected a bound TCP port');
  }
  return address.port;
}

function nodeSocket(value: unknown): NodeWebSocket {
  if (!(value instanceof NodeWebSocket)) {
    throw new TypeError('Expected a ws socket');
  }
  return value;
}

describe('realtime WebSocket handshakes from Node.js identify the SDK', () => {
  it('sends the User-Agent and keeps the requested subprotocol', async () => {
    const sockets = new WebSocketServer({ port: 0, host: '127.0.0.1' });
    try {
      await new Promise<void>((resolve) => {
        sockets.once('listening', resolve);
      });
      const handshake = new Promise<http.IncomingMessage>((resolve) => {
        sockets.once('connection', (_socket, request) => {
          resolve(request);
        });
      });
      const WebSocket = await loadWebSocket();
      const socket = nodeSocket(
        Reflect.construct(WebSocket, [
          `ws://127.0.0.1:${String(portOf(sockets))}/connection/websocket`,
          'centrifuge-json',
        ]),
      );
      const closed = new Promise<void>((resolve) => {
        socket.once('close', () => {
          resolve();
        });
      });
      const request = await handshake;
      for (const connected of sockets.clients) {
        connected.close();
      }
      await closed;
      expect(request.headers['user-agent']).toBe(NODE_USER_AGENT);
      expect(request.headers['sec-websocket-protocol']).toBe('centrifuge-json');
    } finally {
      await new Promise<void>((resolve) => {
        sockets.close(() => {
          resolve();
        });
      });
    }
  });
});
