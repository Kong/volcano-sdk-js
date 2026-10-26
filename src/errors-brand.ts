export interface AuthErrorOptions {
  cause?: unknown;
}

// Object boxes primitives and always returns an object; retain the original
// receiver when reading inherited getters to match JavaScript property access.
const BoxValue: new (value: unknown) => object = Object;

export function hasValue(value: unknown, key: string, expected: unknown): boolean {
  if (!value) {
    return false;
  }
  const property: unknown = Reflect.get(new BoxValue(value), key, value);
  return property === expected;
}
