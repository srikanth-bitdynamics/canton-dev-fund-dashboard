import { Octokit } from '@octokit/rest';

let _client: Octokit | null = null;

export function getOctokit(): Octokit {
  if (_client) return _client;
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    throw new Error('GITHUB_TOKEN env var not set. Add to .env.local');
  }
  _client = new Octokit({ auth: token });
  return _client;
}

export const REPO_OWNER = 'canton-foundation';
export const REPO_NAME = 'canton-dev-fund';
