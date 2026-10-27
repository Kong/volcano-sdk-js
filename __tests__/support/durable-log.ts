import { jest } from '@jest/globals';
import type { DurableLog } from '../../src/durable-types.ts';

/** A runtime logger whose methods are mocks that return nothing, as the real ones do. */
export const mockDurableLog = (): DurableLog => ({
  info: jest.fn<DurableLog['info']>(),
  warn: jest.fn<DurableLog['warn']>(),
  error: jest.fn<DurableLog['error']>(),
  debug: jest.fn<DurableLog['debug']>(),
});
