import { jest } from '@jest/globals';
import type { VolcanoAuth } from '../../src/index.ts';

interface JsonResponseFixture {
  ok?: boolean;
  status?: number;
  json: () => Promise<unknown>;
}

export function responseFixture(input: JsonResponseFixture): Response {
  const status = input.status ?? (input.ok === false ? 400 : 200);
  const response = Response.json(null, { status });
  jest.spyOn(response, 'json').mockImplementation(input.json);
  return response;
}

interface Deferred<T> {
  promise: Promise<T>;
  resolve(value: T): void;
}

export function createDeferred<T>(): Deferred<T> {
  let settle: ((value: T) => void) | undefined;
  const promise = new Promise<T>((resolve) => {
    settle = resolve;
  });
  return {
    promise,
    resolve(value: T): void {
      if (settle === undefined) {
        throw new Error('Deferred promise has no resolver');
      }
      settle(value);
    },
  };
}

export function setSessionFixture(client: VolcanoAuth, session: object): void {
  const setter: unknown = Reflect.get(client, '_setSession');
  if (typeof setter !== 'function') {
    throw new TypeError('Expected the internal session setter');
  }
  Reflect.apply(setter, client, [session]);
}

export function filterOperators(builder: object): string[] {
  const filters: unknown = Reflect.get(builder, 'filters');
  if (!Array.isArray(filters)) {
    throw new TypeError('Expected filter entries');
  }
  return filters.map((filter: unknown) => {
    if (typeof filter !== 'object' || filter === null) {
      throw new TypeError('Expected a filter object');
    }
    const operator: unknown = Reflect.get(filter, 'operator');
    if (typeof operator !== 'string') {
      throw new TypeError('Expected a filter operator');
    }
    return operator;
  });
}
