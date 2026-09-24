import { createAppAuth } from '@octokit/auth-app';
import { Octokit } from '@octokit/rest';

export function sdkGitHub() {
  return new Octokit({ auth: process.env.GH_TOKEN });
}

export async function hostingGitHub(actions = 'read') {
  const auth = {
    appId: process.env.HOSTING_APP_ID,
    privateKey: process.env.HOSTING_APP_PRIVATE_KEY,
  };
  const app = new Octokit({ authStrategy: createAppAuth, auth });
  const { data } = await app.rest.apps.getRepoInstallation({
    owner: 'Kong',
    repo: 'volcano-hosting',
  });
  const scoped = new Octokit();
  // Ask auth-app for a scoped token on every request; its cache renews expired tokens.
  scoped.hook.wrap('request', async (request, options) => {
    const { token } = await app.auth({
      type: 'installation',
      installationId: data.id,
      repositoryNames: ['volcano-hosting'],
      permissions: { actions, contents: 'read' },
    });
    return request({
      ...options,
      headers: { ...options.headers, authorization: `token ${token}` },
    });
  });
  return scoped;
}
