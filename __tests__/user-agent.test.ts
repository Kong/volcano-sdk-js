/** @jest-environment ./__tests__/node-environment.cjs */
import { describe, expect, it, test } from '@jest/globals';
import { identifiedWebSocket } from '../src/realtime-websocket.ts';
import { addUserAgent, buildUserAgent, sdkUserAgent, withUserAgent } from '../src/user-agent.ts';
import { SDK_VERSION } from '../src/version.ts';
import { NODE_USER_AGENT, PACKAGE_VERSION } from './support/user-agent.ts';

const prefix = `volcano-sdk-js/${SDK_VERSION}`;
const node = { process: { versions: { node: '22.11.0' }, platform: 'darwin', arch: 'arm64' } };

test('the SDK version matches the package version', () => {
  expect(SDK_VERSION).toBe(PACKAGE_VERSION);
});

test('Node.js requests carry the SDK, its version, the runtime, and the platform', () => {
  expect(sdkUserAgent()).toBe(NODE_USER_AGENT);
  expect(sdkUserAgent()).toMatch(/^volcano-sdk-js\/\d+\.\d+\.\d+\S* \(node\/\d+\.\d+\.\d+; [a-z0-9]+\/[a-z0-9_]+\)$/u);
  expect(buildUserAgent(globalThis)).toBe(NODE_USER_AGENT);
});

const runtimes: [string, object, string | null][] = [
  ['Node.js', node, `${prefix} (node/22.11.0; darwin/arm64)`],
  [
    'Bun, which also reports a Node.js version',
    { process: { versions: { node: '22.6.0', bun: '1.2.3' }, platform: 'linux', arch: 'x64' } },
    `${prefix} (bun/1.2.3; linux/x64)`,
  ],
  [
    'Deno, which also exposes process',
    { ...node, Deno: { version: { deno: '2.1.4' }, build: { os: 'linux', arch: 'aarch64' } } },
    `${prefix} (deno/2.1.4; linux/aarch64)`,
  ],
  [
    'Deno 1, whose window has no document',
    { window: {}, Deno: { version: { deno: '1.46.3' }, build: { os: 'darwin', arch: 'x86_64' } } },
    `${prefix} (deno/1.46.3; darwin/x86_64)`,
  ],
  ['Deno without version or build details', { Deno: {} }, `${prefix} (deno)`],
  ['Deno with blank details', { Deno: { version: { deno: '' }, build: { os: '', arch: '' } } }, `${prefix} (deno)`],
  ['an edge runtime', { ...node, EdgeRuntime: 'edge-runtime' }, `${prefix} (edge-runtime)`],
  ['an edge runtime flag that is blank', { ...node, EdgeRuntime: '' }, `${prefix} (node/22.11.0; darwin/arm64)`],
  ['Cloudflare Workers', { ...node, navigator: { userAgent: 'Cloudflare-Workers' } }, `${prefix} (workerd)`],
  [
    'Node.js with its own navigator',
    { ...node, navigator: { userAgent: 'Node.js/22' } },
    `${prefix} (node/22.11.0; darwin/arm64)`,
  ],
  [
    'Node.js without a platform',
    { process: { versions: { node: '22.11.0' }, arch: 'arm64' } },
    `${prefix} (node/22.11.0)`,
  ],
  [
    'Node.js without an architecture',
    { process: { versions: { node: '22.11.0' }, platform: 'darwin' } },
    `${prefix} (node/22.11.0)`,
  ],
  ['a blank Node.js version', { process: { versions: { node: '' } } }, null],
  ['a blank Bun version', { process: { versions: { node: '22.6.0', bun: '' } } }, `${prefix} (node/22.6.0)`],
  ['a process that is not an object', { process: 'node' }, null],
  ['a Node.js version that is not text', { process: { versions: { node: 22 } } }, null],
  ['a null process', { process: null }, null],
  ['an unrecognized runtime', {}, null],
  ['a browser', { ...node, window: { document: {} } }, null],
  ['a browser worker', { self: {}, navigator: { userAgent: 'Mozilla/5.0 (X11; Linux x86_64)' } }, null],
  ['an Electron worker with Node.js', { ...node, navigator: { userAgent: 'Mozilla/5.0 Electron/38.0.0' } }, null],
  ['a polyfilled process', { process: { env: {}, versions: {} } }, null],
  ['React Native', { window: {}, process: { env: {} } }, null],
];

describe('runtime detection', () => {
  it.each(runtimes)('%s', (_name, environment, expected) => {
    expect(buildUserAgent(environment)).toBe(expected);
  });
});

const agent = 'volcano-sdk-js/9.9.9 (node/1.2.3; os/arch)';

describe('request headers', () => {
  it('leaves requests alone where no User-Agent is sent', () => {
    const init = { headers: { 'x-trace': 'a' } };
    expect(addUserAgent(init, null)).toBe(init);
  });

  it('adds the runtime User-Agent by default', () => {
    expect(withUserAgent({ method: 'GET' })).toEqual({ method: 'GET', headers: { 'User-Agent': NODE_USER_AGENT } });
  });

  it('adds the User-Agent to plain headers without changing the caller options', () => {
    const init = { method: 'POST', headers: { 'x-trace': 'a' } };
    expect(addUserAgent(init, agent)).toEqual({ method: 'POST', headers: { 'x-trace': 'a', 'User-Agent': agent } });
    expect(init.headers).toEqual({ 'x-trace': 'a' });
  });

  it('adds the User-Agent to header tuples', () => {
    const headers: [string, string][] = [['x-trace', 'a']];
    const sent = addUserAgent({ headers }, agent).headers;
    expect(sent).toBeInstanceOf(Headers);
    expect(Object.fromEntries(new Headers(sent))).toEqual({ 'x-trace': 'a', 'user-agent': agent });
    expect(headers).toEqual([['x-trace', 'a']]);
  });

  it('adds the User-Agent to a Headers object', () => {
    const headers = new Headers({ 'x-trace': 'a' });
    const sent = addUserAgent({ headers }, agent).headers;
    expect(sent).toBeInstanceOf(Headers);
    expect(Object.fromEntries(new Headers(sent))).toEqual({ 'x-trace': 'a', 'user-agent': agent });
    expect(headers.has('user-agent')).toBe(false);
  });
});

describe('a User-Agent the caller set', () => {
  it.each<[string, HeadersInit]>([
    ['plain headers', { 'x-trace': 'a', 'user-agent': 'caller/1.0' }],
    [
      'header tuples',
      [
        ['x-trace', 'a'],
        ['USER-AGENT', 'caller/1.0'],
      ],
    ],
    ['a Headers object', new Headers({ 'User-Agent': 'caller/1.0' })],
  ])('keeps a User-Agent the caller set in %s', (_name, headers) => {
    const init = { headers };
    expect(addUserAgent(init, agent)).toBe(init);
  });
});

describe('realtime WebSocket constructor', () => {
  it('leaves the constructor alone where no User-Agent is sent', () => {
    expect(identifiedWebSocket(WebSocket, null)).toBe(WebSocket);
  });

  it('passes the address and subprotocol with the User-Agent header', () => {
    class Recorder {
      readonly args: unknown[];

      constructor(...args: unknown[]) {
        this.args = args;
      }
    }
    const socket: unknown = Reflect.construct(identifiedWebSocket(Recorder, 'agent/1'), ['ws://host', 'proto']);
    expect(socket).toBeInstanceOf(Recorder);
    expect(socket).toEqual({ args: ['ws://host', 'proto', { headers: { 'User-Agent': 'agent/1' } }] });
  });
});
