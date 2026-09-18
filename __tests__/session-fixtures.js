function sessionToken(sessionId = 'fixture-session', renewed = false) {
  const payload = Buffer.from(JSON.stringify({ session_id: sessionId, renewed })).toString(
    'base64url',
  );
  return `header.${payload}.signature`;
}

module.exports = { sessionToken };
