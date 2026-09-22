// Keep a name when supplied; the unnamed form uses its first argument as the operand.
export function namedArgs(
  name: unknown,
  operand: unknown,
  options?: unknown,
): [unknown, unknown, unknown] {
  if (typeof name === 'string' || name === undefined) {
    return [name, operand, options ?? {}];
  }
  return [undefined, name, operand ?? {}];
}

export function mapArgs(
  name: unknown,
  items: unknown,
  fn?: unknown,
  options?: unknown,
): [unknown, unknown, unknown, unknown] {
  if (Array.isArray(name)) {
    return [undefined, name, items, fn ?? {}];
  }
  return [name, items, fn, options ?? {}];
}

export function requireFunction(fn: unknown, operation: string): void {
  if (typeof fn !== 'function') {
    throw new TypeError(`ctx.${operation}() requires a function to run`);
  }
}

// The engine spreads config over defaults, so undefined values must be absent.
export function engineConfig(entries: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(entries).filter(([, value]) => value !== undefined));
}
