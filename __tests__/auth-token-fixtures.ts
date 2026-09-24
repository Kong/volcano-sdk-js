export function testAccessToken(
  projectId = '00000000-0000-0000-0000-000000000001',
  extraClaims: Record<string, unknown> = {},
): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ project_id: projectId, ...extraClaims })).toString(
    'base64url',
  );
  return `${header}.${payload}.test-signature`;
}
