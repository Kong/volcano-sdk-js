import type { AuthContext } from './auth-session-lifecycle.ts';

export interface RequestSuccess {
  ok: true;
  status: number;
  data: unknown;
  error: null;
}

export interface RequestFailure {
  ok?: false;
  status: number | null;
  data: unknown;
  error: Error;
}

export type RequestResult = RequestSuccess | RequestFailure;

export interface ContextRequest {
  result: RequestResult;
  context: AuthContext;
}
