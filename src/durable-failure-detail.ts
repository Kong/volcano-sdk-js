interface FailureDetail {
  name: string;
  message: string;
  type?: unknown;
  data?: unknown;
}

/**
 * Engine errors need their non-enumerable name and message copied into the
 * replay-safe batch result. The original error still flows through throwIfFailed.
 */
export function failureDetail(error: unknown): FailureDetail {
  if (!(error instanceof Error)) {
    return { name: 'Error', message: String(error) };
  }
  const detail: FailureDetail = { name: error.name, message: error.message };
  const errorType: unknown = Reflect.get(error, 'errorType');
  if (errorType !== undefined) {
    detail.type = errorType;
  }
  const errorData: unknown = Reflect.get(error, 'errorData');
  if (errorData !== undefined) {
    detail.data = errorData;
  }
  return detail;
}
