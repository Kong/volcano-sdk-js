/** Copy JSON-compatible session data without sharing nested mutable values. */
export function cloneJsonValue(value: unknown): unknown {
  if (typeof globalThis.structuredClone === 'function') {
    return globalThis.structuredClone(value);
  }

  const serialized = JSON.stringify(value);
  const copied: unknown = JSON.parse(serialized);
  return copied;
}
