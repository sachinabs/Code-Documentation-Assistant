import { embedText } from './embedding.service.js';
import { searchChunks } from './vector.service.js';
import { scanRepository, listFiles } from './file-scanner.service.js';
import path from 'path';

const TOP_K = 5;

function isBroadQuestion(question) {
  const q = (question || '').toLowerCase();
  return /architect|api|endpoint|route|entry point|how does .* work|structure|flow|improve|missing|feature|recommend|analysis/.test(q);
}

function scoreFile(filePath) {
  const lower = filePath.toLowerCase();
  let score = 0;
  if (/readme/i.test(lower)) score += 5;
  if (/package\.json|requirements\.txt|pyproject\.toml|go\.mod|pom\.xml|build\.gradle|composer\.json|cargo\.toml/i.test(lower)) score += 5;
  if (/main\.|app\.|server\.|index\./i.test(lower)) score += 4;
  if (/route|controller|service|config|database|db/i.test(lower)) score += 3;
  return score;
}

export async function retrieveContext(repositoryId, question, repo) {
  const broad = isBroadQuestion(question);
  const chunks = await searchChunks(repositoryId, await embedText(question), broad ? 10 : TOP_K);

  if (!broad) {
    // Add tech stack metadata if available.
    if (repo?.techStack || repo?.languages) {
      const metaChunk = {
        filePath: 'repository metadata',
        language: 'json',
        startLine: 1,
        endLine: 1,
        content: JSON.stringify({ techStack: repo.techStack, languages: repo.languages }, null, 2),
      };
      chunks.unshift(metaChunk);
    }
    return chunks;
  }

  // Broad question: include relevant files across the repository.
  const extra = [];
  if (repo?.localPath) {
    try {
      const files = await scanRepository(repo.localPath);
      // For broad analysis questions, include all repository files (truncated) to avoid missing features.
      const selected = files.slice(0, 40);
      for (const f of selected) {
        const content = f.content.length > 1500 ? f.content.slice(0, 1500) + '\n...' : f.content;
        extra.push({
          filePath: f.path,
          language: f.language,
          startLine: 1,
          endLine: content.split('\n').length,
          content,
        });
      }
    } catch {}
  }

  // Merge, dedup by filePath.
  const seen = new Set(chunks.map((c) => c.filePath));
  for (const c of extra) {
    if (!seen.has(c.filePath)) {
      chunks.push(c);
      seen.add(c.filePath);
    }
  }

  if (repo?.techStack || repo?.languages) {
    chunks.unshift({
      filePath: 'repository metadata',
      language: 'json',
      startLine: 1,
      endLine: 1,
      content: JSON.stringify({ techStack: repo.techStack, languages: repo.languages }, null, 2),
    });
  }

  // Limit total context size.
  return chunks.slice(0, 15);
}