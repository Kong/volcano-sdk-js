const defaultTimeoutMs = 60000;

type ResponseConsumer<Result> = (
  response: Response,
  signal: AbortSignal,
) => Result | Promise<Result>;

export function fetchWithTimeout(
  url: string,
  options?: RequestInit,
  timeoutMs?: number,
): Promise<Response>;
export function fetchWithTimeout<Result>(
  url: string,
  options: RequestInit,
  timeoutMs: number,
  consume: ResponseConsumer<Result>,
): Promise<Result>;
export function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs = defaultTimeoutMs,
  consume: ResponseConsumer<unknown> = (response) => response,
): Promise<unknown> {
  return performFetch(url, options, timeoutMs, consume);
}

async function performFetch(
  url: string,
  options: RequestInit,
  timeoutMs: number,
  consume: ResponseConsumer<unknown>,
): Promise<unknown> {
  const controller = new AbortController();
  const caller = options.signal;
  const unfollow = followCaller(caller, controller);
  let timedOut = false;
  const timeoutId = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    return await consume(response, controller.signal);
  } catch (error) {
    if (isRequestTimeout(error, timedOut, caller)) {
      throw new Error(`Request timeout after ${String(timeoutMs)}ms`, { cause: error });
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
    unfollow?.();
  }
}

function followCaller(
  signal: AbortSignal | null | undefined,
  controller: AbortController,
): (() => void) | undefined {
  if (signal == null) {
    return undefined;
  }
  const abort = (): void => {
    const reason: unknown = signal.reason;
    controller.abort(reason);
  };
  if (signal.aborted) {
    abort();
  } else {
    signal.addEventListener('abort', abort);
  }
  return (): void => {
    signal.removeEventListener('abort', abort);
  };
}

function isRequestTimeout(
  error: unknown,
  timedOut: boolean,
  caller: AbortSignal | null | undefined,
): boolean {
  return hasAbortName(error) && timedOut && caller?.aborted !== true;
}

function hasAbortName(value: unknown): boolean {
  if ((typeof value !== 'object' && typeof value !== 'function') || value === null) {
    return false;
  }
  return 'name' in value && value.name === 'AbortError';
}
