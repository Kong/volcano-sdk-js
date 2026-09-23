import { clearSharedFunctionResolveStateForTests } from '../src/function-resolve-cache.ts';

// Mock fetch globally. Suites that drive the SDK against a real local server
// restore this reference instead.
Object.assign(globalThis, { __realFetch: globalThis.fetch });
globalThis.fetch = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>();

// Mock localStorage
interface MockStorage {
  store: Record<string, string>;
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  clear(): void;
}

const localStorageMock: MockStorage = {
  store: {},
  getItem: jest.fn((key: string): string | null => {
    const value = localStorageMock.store[key];
    return value === undefined || value === '' ? null : value;
  }),
  setItem: jest.fn((key: string, value: string): void => {
    localStorageMock.store[key] = value;
  }),
  removeItem: jest.fn((key: string): void => {
    Reflect.deleteProperty(localStorageMock.store, key);
  }),
  clear: jest.fn((): void => {
    localStorageMock.store = {};
  }),
};

Object.defineProperty(globalThis, 'localStorage', {
  value: localStorageMock,
});

// Reset mocks before each test
beforeEach(() => {
  jest.clearAllMocks();
  const currentFetch = globalThis.fetch;
  if (jest.isMockFunction(currentFetch)) {
    currentFetch.mockReset();
  }
  localStorageMock.store = {};
  clearSharedFunctionResolveStateForTests();
});
