export const projectId = '11111111-1111-4111-8111-111111111111';
export const sessionId = '22222222-2222-4222-8222-222222222222';
export const templateId = '22222222-2222-4222-8222-222222222222';
export const requestId = '33333333-3333-4333-8333-333333333333';
export const snapshot = {
  id: sessionId,
  project_id: projectId,
  sandbox_id: requestId,
  state: 'running',
  desired_state: 'running',
  region: 'aws-us-east-1',
  memory_mb: 1024,
  created_at: '2026-09-24T00:00:00Z',
  expires_at: '2026-09-24T01:00:00Z',
};
export const deployment = {
  id: requestId,
  status: 'building',
  created_at: '2026-10-07T00:00:00Z',
  updated_at: '2026-10-07T00:00:00Z',
};
export function bodyJson(call: Parameters<typeof fetch> | undefined): unknown {
  const body = call?.[1]?.body;
  if (typeof body !== 'string') {
    throw new TypeError('Expected JSON request body');
  }
  return JSON.parse(body);
}
export function requestCall(calls: Parameters<typeof fetch>[], index: number): Parameters<typeof fetch> {
  const call = calls[index];
  if (call === undefined) {
    throw new Error('Missing request');
  }
  return call;
}
export function firstCall(calls: Parameters<typeof fetch>[]): Parameters<typeof fetch> {
  const call = calls[0];
  if (call === undefined) {
    throw new Error('Missing request');
  }
  return call;
}
