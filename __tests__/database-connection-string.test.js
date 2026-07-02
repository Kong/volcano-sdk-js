const { databaseConnectionString } = require('../src/index.js');

// A Volcano-advertised DATABASE_URL. pgproxy routes by the globally-unique
// username (volcano_client_{id}) that is baked into the userinfo; application_name
// only selects the access mode.
const DB_ID = '11111111-1111-1111-1111-111111111111';
const USERNAME = `volcano_client_${DB_ID}`;
const BASE_URL = `postgres://${USERNAME}:vpg_secret@databases.volcano.dev:5432/my_app?sslmode=require&application_name=volcano_full_access`;

function appNameOf(connectionString) {
  return new URL(connectionString).searchParams.get('application_name');
}

describe('databaseConnectionString', () => {
  it('returns a full_access connection string when no userId is given', () => {
    const result = databaseConnectionString(BASE_URL);
    expect(appNameOf(result)).toBe('volcano_full_access');
  });

  it('returns a user_access connection string that impersonates the given userId', () => {
    const result = databaseConnectionString(BASE_URL, { userId: 'user-42' });
    expect(appNameOf(result)).toBe('volcano_user_access:user-42');
  });

  it('leaves the routing username, host, database and sslmode untouched', () => {
    const result = databaseConnectionString(BASE_URL, { userId: 'user-42' });
    const url = new URL(result);
    expect(url.username).toBe(USERNAME); // routing key is the username, unchanged
    expect(url.host).toBe('databases.volcano.dev:5432');
    expect(url.pathname).toBe('/my_app');
    expect(url.searchParams.get('sslmode')).toBe('require');
    // Password is preserved.
    expect(url.password).toBe('vpg_secret');
  });

  it('re-derives the mode from a base that is already user_access', () => {
    const userBase = `postgres://${USERNAME}:p@host:5432/db?application_name=volcano_user_access%3Aold-user`;
    // Switching to admin drops the user id.
    expect(appNameOf(databaseConnectionString(userBase))).toBe('volcano_full_access');
    // Switching to a different user replaces it.
    expect(appNameOf(databaseConnectionString(userBase, { userId: 'new-user' }))).toBe(
      'volcano_user_access:new-user',
    );
  });

  it('treats null/undefined/empty userId as full access', () => {
    expect(appNameOf(databaseConnectionString(BASE_URL, null))).toBe('volcano_full_access');
    expect(appNameOf(databaseConnectionString(BASE_URL, { userId: null }))).toBe(
      'volcano_full_access',
    );
    expect(appNameOf(databaseConnectionString(BASE_URL, { userId: undefined }))).toBe(
      'volcano_full_access',
    );
    expect(appNameOf(databaseConnectionString(BASE_URL, { userId: '' }))).toBe(
      'volcano_full_access',
    );
  });

  it('coerces a non-string userId to string', () => {
    expect(appNameOf(databaseConnectionString(BASE_URL, { userId: 12345 }))).toBe(
      'volcano_user_access:12345',
    );
  });

  it('adds application_name when the base connection string has none', () => {
    const noAppName = `postgres://${USERNAME}:p@host:5432/db?sslmode=require`;
    expect(appNameOf(databaseConnectionString(noAppName))).toBe('volcano_full_access');
  });

  it('throws when the base connection string is missing or invalid', () => {
    expect(() => databaseConnectionString('')).toThrow(/required/);
    expect(() => databaseConnectionString(null)).toThrow(/required/);
    expect(() => databaseConnectionString('not a url')).toThrow(/not a valid connection URL/);
  });

  it('preserves unrelated query parameters (e.g. connect_timeout, channel_binding)', () => {
    const withExtras = `postgres://${USERNAME}:p@host:5432/db?sslmode=require&connect_timeout=10&channel_binding=disable`;
    const result = databaseConnectionString(withExtras, { userId: 'u1' });
    const url = new URL(result);
    expect(url.searchParams.get('application_name')).toBe('volcano_user_access:u1');
    expect(url.searchParams.get('connect_timeout')).toBe('10');
    expect(url.searchParams.get('channel_binding')).toBe('disable');
    expect(url.searchParams.get('sslmode')).toBe('require');
  });

  it('round-trips a userId containing characters that must be URL-encoded', () => {
    // Impersonation ids are usually UUIDs, but the proxy takes everything after
    // the first colon verbatim, so a value with reserved chars must survive.
    const weirdUser = 'tenant:1/2 3&x';
    const result = databaseConnectionString(BASE_URL, { userId: weirdUser });
    // Reading it back through URL decoding must yield the original mode string.
    expect(appNameOf(result)).toBe(`volcano_user_access:${weirdUser}`);
  });

  it('is idempotent — re-applying the same mode does not stack application_name', () => {
    const once = databaseConnectionString(BASE_URL, { userId: 'u1' });
    const twice = databaseConnectionString(once, { userId: 'u1' });
    expect(twice).toBe(once);
    // And exactly one application_name is present.
    const raw = new URL(twice).search.match(/application_name=/g) || [];
    expect(raw).toHaveLength(1);
  });

  it('does not mutate credentials or database when only switching mode', () => {
    const admin = databaseConnectionString(BASE_URL);
    const asUser = databaseConnectionString(admin, { userId: 'u9' });
    const a = new URL(admin);
    const b = new URL(asUser);
    expect(b.username).toBe(a.username);
    expect(b.password).toBe(a.password);
    expect(b.host).toBe(a.host);
    expect(b.pathname).toBe(a.pathname);
  });
});
