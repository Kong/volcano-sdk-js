export async function safeJsonParse(response: Response, signal?: AbortSignal): Promise<unknown> {
  try {
    const value: unknown = await response.json();
    return value;
  } catch (error) {
    if (signal?.aborted === true) {
      throw cancellationReason(signal, error);
    }
    if (hasAbortName(error)) {
      throw error;
    }
    return {};
  }
}

function cancellationReason(signal: AbortSignal, fallback: unknown): unknown {
  const reason: unknown = signal.reason;
  return Boolean(reason) ? reason : fallback;
}

function hasAbortName(value: unknown): boolean {
  if ((typeof value !== 'object' && typeof value !== 'function') || value === null) {
    return false;
  }
  return 'name' in value && value.name === 'AbortError';
}
