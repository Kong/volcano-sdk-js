type DurablePathResult<Segments> =
  | { segments: Segments; error?: never }
  | { error: Error; segments?: never };

// Empty identifiers would address a collection instead of its execution.
export function durablePathSegments(fields: {
  projectId: unknown;
  functionName: unknown;
  executionId: unknown;
}): DurablePathResult<{ projectId: string; functionName: string; executionId: string }>;
export function durablePathSegments(fields: {
  projectId: unknown;
  functionName: unknown;
}): DurablePathResult<{ projectId: string; functionName: string }>;
export function durablePathSegments(fields: {
  functionName: unknown;
}): DurablePathResult<{ functionName: string }>;
export function durablePathSegments(
  fields: Readonly<Record<string, unknown>>,
): DurablePathResult<Record<string, string>>;
export function durablePathSegments(
  fields: Readonly<Record<string, unknown>>,
): DurablePathResult<Record<string, string>> {
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
