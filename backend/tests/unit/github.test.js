import { parseGitHubUrl } from '../../src/utils/git.utils.js';

test('parses valid github url', () => {
  const result = parseGitHubUrl('https://github.com/expressjs/express');
  expect(result).toEqual({ owner: 'expressjs', repo: 'express', url: 'https://github.com/expressjs/express' });
});

test('rejects invalid url', () => {
  expect(parseGitHubUrl('https://example.com/foo/bar')).toBeNull();
  expect(parseGitHubUrl('not-a-url')).toBeNull();
});