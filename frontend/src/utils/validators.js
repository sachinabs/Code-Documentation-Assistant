export function isValidGitHubUrl(url) {
  if (!url || typeof url !== 'string') return false;
  const trimmed = url.trim();
  const regex = /^https?:\/\/(www\.)?github\.com\/[\w.-]+\/[\w.-]+(\.git)?\/?$/i;
  return regex.test(trimmed);
}