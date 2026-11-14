import { parseGitHubUrl } from '../utils/git.utils.js';

export function validateGitHubUrl(url) {
  const parsed = parseGitHubUrl(url);
  if (!parsed) throw new Error('Invalid GitHub repository URL');
  return parsed;
}