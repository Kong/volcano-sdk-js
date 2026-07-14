export const SDK_VERSION = '2.0.0';

type RuntimeGlobals = typeof globalThis & {
  document?: unknown;
  navigator?: { product?: string };
  process?: { release?: { name?: string } };
};

export const runtime = (): 'node' | 'react-native' | 'web' => {
  const globals = globalThis as RuntimeGlobals;
  if (globals.navigator?.product === 'ReactNative') {
    return 'react-native';
  }
  if (globals.document !== undefined || globals.process?.release?.name !== 'node') {
    return 'web';
  }
  return 'node';
};

export const isClientRuntime = (): boolean => runtime() !== 'node';

export const CLIENT_INFO = `volcano-sdk-js/${SDK_VERSION}; runtime=${runtime()}`;
