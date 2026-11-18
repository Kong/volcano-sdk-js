import { SDK_VERSION } from './version.ts';

interface Runtime {
  name: string;
  version?: string | undefined;
  os?: string | undefined;
  arch?: string | undefined;
}

// `new Object` reads primitives, null, and undefined without throwing.
function property(source: unknown, key: string): unknown {
  return Reflect.get(new Object(source), key);
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined;
}

// Bun and Deno also expose Node's `process`, and Cloudflare Workers can, so
// they are recognized before Node.
function detectRuntime(environment: object): Runtime | undefined {
  const deno = property(environment, 'Deno');
  if (deno !== undefined) {
    const build = property(deno, 'build');
    return {
      name: 'deno',
      version: text(property(property(deno, 'version'), 'deno')),
      os: text(property(build, 'os')),
      arch: text(property(build, 'arch')),
    };
  }
  const process = property(environment, 'process');
  const versions = property(process, 'versions');
  const platform = { os: text(property(process, 'platform')), arch: text(property(process, 'arch')) };
  const bun = text(property(versions, 'bun'));
  if (bun !== undefined) {
    return { name: 'bun', version: bun, ...platform };
  }
  if (text(property(environment, 'EdgeRuntime')) !== undefined) {
    return { name: 'edge-runtime' };
  }
  if (property(property(environment, 'navigator'), 'userAgent') === 'Cloudflare-Workers') {
    return { name: 'workerd' };
  }
  const node = text(property(versions, 'node'));
  return node === undefined ? undefined : { name: 'node', version: node, ...platform };
}

function describeRuntime(runtime: Runtime): string {
  const name = runtime.version === undefined ? runtime.name : `${runtime.name}/${runtime.version}`;
  if (runtime.os === undefined || runtime.arch === undefined) {
    return name;
  }
  return `${name}; ${runtime.os}/${runtime.arch}`;
}

/**
 * The User-Agent that identifies this SDK, its version, and its runtime, or
 * null in a browser or an unrecognized runtime. Browsers set their own
 * User-Agent, and some would send a preflight for one the page sets.
 */
export function buildUserAgent(environment: object): string | null {
  if (property(property(environment, 'window'), 'document') !== undefined) {
    return null;
  }
  // Browser workers, including Electron workers that also expose Node's
  // `process`, report a browser User-Agent and have no `window`.
  const navigatorAgent = text(property(property(environment, 'navigator'), 'userAgent'));
  if (navigatorAgent?.startsWith('Mozilla/') === true) {
    return null;
  }
  const runtime = detectRuntime(environment);
  return runtime === undefined ? null : `volcano-sdk-js/${SDK_VERSION} (${describeRuntime(runtime)})`;
}

const USER_AGENT = buildUserAgent(globalThis);

/** Adds `userAgent`, when there is one, unless the caller set a User-Agent. */
export function addUserAgent(init: RequestInit, userAgent: string | null): RequestInit {
  if (userAgent === null) {
    return init;
  }
  const { headers } = init;
  if ([...new Headers(headers).keys()].includes('user-agent')) {
    return init;
  }
  if (headers instanceof Headers || Array.isArray(headers)) {
    const merged = new Headers(headers);
    merged.set('User-Agent', userAgent);
    return { ...init, headers: merged };
  }
  return { ...init, headers: { ...headers, 'User-Agent': userAgent } };
}

/** Adds the SDK's User-Agent outside browsers, keeping one the caller set. */
export function withUserAgent(init: RequestInit): RequestInit {
  return addUserAgent(init, USER_AGENT);
}

/** The SDK's User-Agent in this runtime, or null where none is sent. */
export function sdkUserAgent(): string | null {
  return USER_AGENT;
}
