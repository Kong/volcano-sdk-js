type DurablePathResult =
  | { segments: Record<string, string>; error?: never }
  | { error: Error; segments?: never };

// Empty identifiers would address a collection instead of its execution.
export function durablePathSegments(fields: Readonly<Record<string, unknown>>): DurablePathResult {
  const segments = new Map<string, string>();
  for (const [field, value] of Object.entries(fields)) {
    const identifier = typeof value === 'string' ? value.trim() : '';
    if (identifier.length === 0) {
      return { error: new Error(`${field} must be a non-empty string`) };
    }
    segments.set(field, encodeURIComponent(identifier));
  }
  return { segments: Object.fromEntries(segments) };
}
