import fs from 'fs/promises';
import path from 'path';

export const IGNORED_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'coverage', 'vendor', '.cache',
  '.next', '.nuxt', 'target', 'bin', 'obj', '__pycache__',
]);

export const SUPPORTED_EXTENSIONS = new Set([
  '.js', '.jsx', '.ts', '.tsx', '.py', '.java', '.go', '.php', '.json',
  '.md', '.sql', '.yaml', '.yml', '.sh', '.bash',
]);

export async function walkDirectory(root, base = root, results = []) {
  let entries;
  try {
    entries = await fs.readdir(root, { withFileTypes: true });
  } catch {
    return results;
  }
  for (const entry of entries) {
    const fullPath = path.join(root, entry.name);
    const relative = path.relative(base, fullPath).replace(/\\/g, '/');
    if (entry.isDirectory()) {
      if (IGNORED_DIRS.has(entry.name)) continue;
      await walkDirectory(fullPath, base, results);
    } else if (entry.isFile()) {
      results.push({ fullPath, relative });
    }
  }
  return results;
}

export async function readFileSafe(filePath, maxSize) {
  const stat = await fs.stat(filePath);
  if (stat.size > maxSize) return null;
  const buffer = await fs.readFile(filePath);
  if (buffer.includes(0)) return null; // binary
  return buffer.toString('utf8');
}

export function detectLanguage(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const map = {
    '.js': 'javascript', '.jsx': 'javascript', '.ts': 'typescript', '.tsx': 'typescript',
    '.py': 'python', '.java': 'java', '.go': 'go', '.php': 'php',
    '.json': 'json', '.md': 'markdown', '.sql': 'sql', '.yaml': 'yaml', '.yml': 'yaml',
    '.sh': 'shell', '.bash': 'shell',
  };
  return map[ext] || 'unknown';
}