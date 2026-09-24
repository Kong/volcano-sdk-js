export function requiredField(value: unknown, name: string): unknown {
  if (typeof value !== 'object' || value === null) {
    throw new TypeError('Auth response must be an object');
  }
  return Reflect.get(value, name);
}

export function optionalField(value: unknown, name: string): unknown {
  return typeof value === 'object' && value !== null ? Reflect.get(value, name) : undefined;
}

export function optionalStringField(value: unknown, name: string): string | null {
  const field = optionalField(value, name);
  if (field === undefined || field === null) {
    return null;
  }
  if (typeof field !== 'string') {
    throw new TypeError(`Auth response ${name} must be a string`);
  }
  return field;
}

export function optionalTokenField(value: unknown, name: string): string | undefined {
  const field = optionalField(value, name);
  if (field === undefined) {
    return undefined;
  }
  if (typeof field !== 'string') {
    throw new TypeError(`Auth response ${name} must be a string`);
  }
  return field;
}
