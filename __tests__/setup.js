const { VolcanoAuth } = require('../src/index.js');
const { deserialize, serialize } = require('node:v8');

global.structuredClone ||= (value) => deserialize(serialize(value));

// Mock fetch globally
global.fetch = jest.fn();

// Mock localStorage
const localStorageMock = {
  store: {},
  getItem: jest.fn((key) => localStorageMock.store[key] || null),
  setItem: jest.fn((key, value) => {
    localStorageMock.store[key] = value;
  }),
  removeItem: jest.fn((key) => {
    delete localStorageMock.store[key];
  }),
  clear: jest.fn(() => {
    localStorageMock.store = {};
  }),
};

Object.defineProperty(global, 'localStorage', {
  value: localStorageMock,
});

// Reset mocks before each test
beforeEach(() => {
  jest.clearAllMocks();
  localStorageMock.store = {};
  if (typeof VolcanoAuth.__resetFunctionResolveCacheForTests === 'function') {
    VolcanoAuth.__resetFunctionResolveCacheForTests();
  }
});
