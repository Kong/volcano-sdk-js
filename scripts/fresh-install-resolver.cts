import { appendFileSync } from 'node:fs';

// Jest resolver for `pnpm test:fresh-install`. Every import of a runtime
// package, from the SDK, its tests or the durable runner, resolves inside the
// consumer install, so the durable runner and the SDK share one runtime
// instance. Their dependencies then resolve within that tree. Everything else
// resolves from the workspace at pnpm-lock.yaml.
interface ResolverOptions {
  basedir: string;
  defaultResolver(path: string, options: ResolverOptions): string;
}

function setting(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === '') {
    throw new Error(`${name} is required; run pnpm test:fresh-install`);
  }
  return value;
}

const directory = setting('VOLCANO_FRESH_INSTALL_DIRECTORY');
const log = setting('VOLCANO_FRESH_INSTALL_LOG');
const parsed: unknown = JSON.parse(setting('VOLCANO_FRESH_INSTALL_PACKAGES'));
const entries: readonly unknown[] = Array.isArray(parsed) ? parsed : [];
const packages = entries.filter((name): name is string => typeof name === 'string');

function resolveFromFreshInstall(request: string, options: ResolverOptions): string {
  if (!packages.some((name) => request === name || request.startsWith(`${name}/`))) {
    return options.defaultResolver(request, options);
  }
  const path = options.defaultResolver(request, { ...options, basedir: directory });
  appendFileSync(log, `${path}\n`);
  return path;
}

export = resolveFromFreshInstall;
