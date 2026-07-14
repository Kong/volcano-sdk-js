import { isClientRuntime } from './version';

const SERVICE_KEY_PREFIX = 'sk-';

export const isClientServiceKey = (credential: string | null | undefined): boolean =>
  isClientRuntime() && Boolean(credential?.startsWith(SERVICE_KEY_PREFIX));

export const assertBrowserSafeCredentials = (
  ...credentials: (string | null | undefined)[]
): void => {
  if (!credentials.some((credential) => isClientServiceKey(credential))) {
    return;
  }

  throw new Error(
    '[VOLCANO SECURITY ERROR] Service keys (sk-*) cannot be used in client-side code. ' +
      'Service keys bypass Row Level Security and expose your database to unauthorized access. ' +
      'Use an anon key (ak-*) for browser/client-side applications. ' +
      'Service keys should only be used in secure server-side environments. ' +
      'See: https://docs.volcano.hosting/security/keys',
  );
};
