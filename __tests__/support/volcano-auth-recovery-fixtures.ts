import type { VolcanoAuth } from '../../src/index.ts';

export function legacyAuthCall(
  volcano: VolcanoAuth,
  name: 'signUpAnonymous' | 'forgotPassword',
  ...args: unknown[]
): Promise<unknown> {
  const method: unknown = Reflect.get(volcano.auth, name);
  if (typeof method !== 'function') {
    throw new TypeError(`Missing legacy auth method ${name}`);
  }
  const result: unknown = Reflect.apply(method, volcano.auth, args);
  return Promise.resolve(result);
}
