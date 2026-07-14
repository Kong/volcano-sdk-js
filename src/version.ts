export const SDK_VERSION = '2.0.0';

const runtime = (): string => {
  if (typeof navigator !== 'undefined' && navigator.product === 'ReactNative') {
    return 'react-native';
  }
  if (typeof document !== 'undefined') {
    return 'web';
  }
  return 'node';
};

export const CLIENT_INFO = `volcano-sdk-js/${SDK_VERSION}; runtime=${runtime()}`;
