import {
  createApiClient,
  deleteGitConnection,
  gitConnectCallback,
  listGitConnections,
  startGitConnect,
  type GitConnection,
  type GitConnectStartResponse,
} from '../../src/api/index';

const client = createApiClient({
  accessToken: 'access-token',
  anonKey: 'anon-key',
  baseUrl: 'https://api.volcano.dev',
  serviceRoleKey: 'service-role-key',
  userToken: 'user-token',
});

client.setCredentials({ accessToken: 'rotated-access-token' });

void startGitConnect({
  client,
  query: {
    provider: 'github',
    redirect: 'https://app.example.com/settings/git',
  },
});
void listGitConnections({ client });
void deleteGitConnection({ client, path: { connectionId: 'connection-id' } });
void gitConnectCallback({ client, query: { state: 'signed-state' } });

const connection: GitConnection = {
  created_at: '2026-07-14T00:00:00Z',
  id: 'connection-id',
  last_authenticated_at: '2026-07-14T00:00:00Z',
  provider: 'github',
  provider_login: 'octocat',
  provider_user_id: '1',
  status: 'active',
  updated_at: '2026-07-14T00:00:00Z',
};
const response: GitConnectStartResponse = { authorization_url: 'https://github.com/login/oauth' };

void connection;
void response;
