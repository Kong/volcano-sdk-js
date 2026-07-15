import { authGetUser, authSignin, createApiClient, queryDatabaseSelect } from '../../src/api/index';

const client = createApiClient({
  accessToken: 'access-token',
  anonKey: 'anon-key',
  baseUrl: 'https://api.volcano.dev',
  serviceRoleKey: 'service-role-key',
  userToken: 'user-token',
});

client.setCredentials({ accessToken: 'rotated-access-token' });

void authSignin({
  body: { email: 'user@example.com', password: 'password' },
  client,
});
void authGetUser({ client });
void queryDatabaseSelect({
  body: {
    table: 'notes',
    filters: [{ column: 'archived', operator: 'eq', value: false }],
  },
  client,
  path: { databaseName: 'app' },
});
