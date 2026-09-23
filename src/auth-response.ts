export function requiredField(value: unknown, name: string): unknown {
  if (typeof value !== 'object' || value === null) {
    throw new TypeError('Auth response must be an object');
  }
  return Reflect.get(value, name);
}

export function optionalField(value: unknown, name: string): unknown {
  return typeof value === 'object' && value !== null ? Reflect.get(value, name) : undefined;
}
