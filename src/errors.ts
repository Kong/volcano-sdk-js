const asRecord = (value: unknown): Record<string, unknown> | undefined =>
  typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : undefined;

const errorMessage = (details: unknown, fallback: string): string => {
  if (typeof details === 'string' && details) {
    return details;
  }

  const record = asRecord(details);
  for (const key of ['error', 'message', 'detail']) {
    if (typeof record?.[key] === 'string' && record[key]) {
      return record[key];
    }
  }
  return fallback;
};

const errorCode = (details: unknown): string | undefined => {
  const record = asRecord(details);
  for (const key of ['code', 'error_code', 'reason_code']) {
    if (typeof record?.[key] === 'string' && record[key]) {
      return record[key];
    }
  }
  return undefined;
};

export interface VolcanoApiErrorOptions<T> {
  cause?: unknown;
  code?: string;
  details: T;
  request?: Request;
  response?: Response;
  status?: number;
}

export class VolcanoApiError<T = unknown> extends Error {
  readonly code?: string;
  readonly details: T;
  readonly request?: Request;
  readonly response?: Response;
  readonly status?: number;

  constructor(message: string, options: VolcanoApiErrorOptions<T>) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = 'VolcanoApiError';
    this.code = options.code;
    this.details = options.details;
    this.request = options.request;
    this.response = options.response;
    this.status = options.status ?? options.response?.status;
  }

  static from<T = unknown>(
    details: T,
    fallback = 'Request failed',
    request?: Request,
    response?: Response,
  ): VolcanoApiError<T> {
    if (details instanceof VolcanoApiError) {
      return details as VolcanoApiError<T>;
    }

    return new VolcanoApiError(errorMessage(details, fallback), {
      cause: details instanceof Error ? details : undefined,
      code: errorCode(details),
      details,
      request,
      response,
    });
  }

  toJSON(): {
    code?: string;
    details: T;
    message: string;
    name: string;
    status?: number;
  } {
    return {
      code: this.code,
      details: this.details,
      message: this.message,
      name: this.name,
      status: this.status,
    };
  }
}
