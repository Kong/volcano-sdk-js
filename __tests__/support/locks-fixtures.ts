import { jest } from '@jest/globals';

export function response(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return status === 204 ? new Response(null, { status, headers }) : Response.json(body, { status, headers });
}

export function fetchCall(index: number): { input: RequestInfo | URL; init: RequestInit } {
  const call = jest.mocked(globalThis.fetch).mock.calls[index];
  if (call?.[1] === undefined) {
    throw new TypeError(`Expected fetch call ${String(index)}`);
  }
  return { input: call[0], init: call[1] };
}

export function headerAt(index: number, name: string): string | null {
  return new Headers(fetchCall(index).init.headers).get(name);
}

export function methodAt(index: number): string | undefined {
  return fetchCall(index).init.method;
}

export function textBodyAt(index: number): string {
  const body = fetchCall(index).init.body;
  if (typeof body !== 'string') {
    throw new TypeError(`Expected text body in fetch call ${String(index)}`);
  }
  return body;
}

export function signalAt(index: number): AbortSignal {
  const signal = fetchCall(index).init.signal;
  if (!(signal instanceof AbortSignal)) {
    throw new TypeError(`Expected AbortSignal in fetch call ${String(index)}`);
  }
  return signal;
}

export function methodsSeen(): (string | undefined)[] {
  return jest.mocked(globalThis.fetch).mock.calls.map((_call, index) => methodAt(index));
}

export function countMethod(method: string): number {
  return methodsSeen().filter((seen) => seen === method).length;
}

export function complete<T>(resolve: ((value: T) => void) | undefined, value: T): void {
  if (resolve === undefined) {
    throw new Error('Expected a pending operation');
  }
  resolve(value);
}

export function abortReason(signal: AbortSignal): Error {
  const reason: unknown = signal.reason;
  return reason instanceof Error ? reason : new Error('Request aborted', { cause: reason });
}

export function pinRandomValues(): void {
  jest.spyOn(global.crypto, 'getRandomValues').mockImplementation((values) => {
    new DataView(values.buffer, values.byteOffset, values.byteLength).setUint32(0, 0x8000_0000);
    return values;
  });
}
