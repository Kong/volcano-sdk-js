import {
  AuthRefreshDiscardedError as EsmRefreshDiscardedError,
  AuthSessionChangedError as EsmSessionChangedError,
  VolcanoSystemError as EsmSystemError,
} from '../../dist/index.esm.mjs';
import {
  AuthRefreshDiscardedError,
  AuthSessionChangedError,
  VolcanoSystemError,
} from '../../dist/index.js';

// Browser consumers need no Node globals or ES2022 library to import these types.
export const errors: Error[] = [
  new AuthRefreshDiscardedError('ignored', { cause: new Error('ignored') }),
  new AuthSessionChangedError('ignored', { cause: new Error('ignored') }),
  new VolcanoSystemError('failed', { cause: new Error('network') }),
  new EsmRefreshDiscardedError('ignored', { cause: new Error('ignored') }),
  new EsmSessionChangedError('ignored', { cause: new Error('ignored') }),
  new EsmSystemError('failed', { cause: new Error('network') }),
];
