import type { VolcanoAuth } from '../../src/index.ts';

export const name = 'orders';
export const anonToken = 'ak-test';

export function resolveWith(
  sdk: VolcanoAuth,
  token: string,
  useAnonKey: boolean,
): ReturnType<VolcanoAuth['_resolveFunctionIdByName']> {
  return sdk._resolveFunctionIdByName(name, {
    authContext: sdk._captureAuthContext(),
    token,
    useAnonKey,
  });
}
