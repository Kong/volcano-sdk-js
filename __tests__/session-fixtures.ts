export function sessionToken(
  sessionId = '00000000-0000-4000-8000-000000000010',
  renewed = false,
): string {
  const payload = Buffer.from(JSON.stringify({ session_id: sessionId, renewed })).toString(
    'base64url',
  );
  return `header.${payload}.signature`;
}
