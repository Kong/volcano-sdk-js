type CentrifugeConstructor = new (...args: never[]) => unknown;

let centrifugeConstructor: CentrifugeConstructor | undefined;

function isConstructor(value: unknown): value is CentrifugeConstructor {
  return typeof value === 'function' && Object.hasOwn(value, 'prototype');
}

/** Resolve the named ESM export or the CommonJS default constructor. */
export function centrifugeFrom(loaded: unknown): CentrifugeConstructor {
  if (typeof loaded !== 'object' || loaded === null) {
    throw new TypeError('Centrifuge does not export a client constructor');
  }
  const named: unknown = Reflect.get(loaded, 'Centrifuge');
  const candidate: unknown = Boolean(named) ? named : Reflect.get(loaded, 'default');
  if (!isConstructor(candidate)) {
    throw new TypeError('Centrifuge does not export a client constructor');
  }
  return candidate;
}

/** Load the required realtime dependency only when a connection is opened. */
export async function loadCentrifuge(): Promise<CentrifugeConstructor> {
  if (centrifugeConstructor !== undefined) {
    return centrifugeConstructor;
  }
  try {
    const loaded: unknown = await import('centrifuge');
    centrifugeConstructor = centrifugeFrom(loaded);
    return centrifugeConstructor;
  } catch {
    throw new Error(
      'Unable to load the SDK realtime dependency. Reinstall @volcano.dev/sdk or check that package dependencies were installed.',
    );
  }
}
