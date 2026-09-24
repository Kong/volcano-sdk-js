import { Octokit } from '@octokit/rest';

export function sdkGitHub() {
  return new Octokit({ auth: process.env.GH_TOKEN });
}
