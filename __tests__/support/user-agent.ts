import { readFileSync } from 'node:fs';
import { join } from 'node:path';

function packageVersion(): string {
  const manifest: unknown = JSON.parse(readFileSync(join(__dirname, '..', '..', 'package.json'), 'utf8'));
  const version: unknown = typeof manifest === 'object' && manifest !== null ? Reflect.get(manifest, 'version') : null;
  if (typeof version !== 'string') {
    throw new TypeError('package.json has no version');
  }
  return version;
}

export const PACKAGE_VERSION = packageVersion();

/** The User-Agent the SDK sends from the Node.js runtime running the tests. */
export const NODE_USER_AGENT = `volcano-sdk-js/${PACKAGE_VERSION} (node/${process.versions.node}; ${process.platform}/${process.arch})`;
