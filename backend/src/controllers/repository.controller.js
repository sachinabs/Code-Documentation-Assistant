import { prisma } from '../config/database.js';
import path from 'path';
import * as repositoryService from '../services/repository.service.js';
import { scanRepository, listFiles } from '../services/file-scanner.service.js';
import fs from 'fs/promises';

export async function createRepository(req, res, next) {
  try {
    const { url } = req.body || {};
    if (!url) return res.status(400).json({ message: 'URL is required' });
    const repo = await repositoryService.createRepository(url);
    res.status(201).json(repo);
  } catch (err) {
    next(err);
  }
}

export async function listRepositories(req, res, next) {
  try {
    const repos = await repositoryService.listRepositories();
    res.json(repos);
  } catch (err) {
    next(err);
  }
}

export async function getRepository(req, res, next) {
  try {
    const repo = await repositoryService.getRepository(req.params.id);
    if (!repo) return res.status(404).json({ message: 'Repository not found' });
    if ((!repo.languages || !repo.techStack) && repo.localPath) {
      const { computeLanguageStats, detectTechStack } = await import('../services/file-scanner.service.js');
      const languages = repo.languages || await computeLanguageStats(repo.localPath);
      const techStack = repo.techStack || await detectTechStack(repo.localPath);
      await prisma.repository.update({ where: { id: repo.id }, data: { languages, techStack } });
      repo.languages = languages;
      repo.techStack = techStack;
    }
    res.json(repo);
  } catch (err) {
    next(err);
  }
}

export async function getStatus(req, res, next) {
  try {
    const repo = await repositoryService.getRepository(req.params.id);
    if (!repo) return res.status(404).json({ message: 'Repository not found' });
    res.json({
      id: repo.id,
      status: repo.status,
      currentStage: repo.currentStage,
      totalFiles: repo.totalFiles,
      indexedFiles: repo.indexedFiles,
      totalChunks: repo.totalChunks,
      errorMessage: repo.errorMessage,
    });
  } catch (err) {
    next(err);
  }
}

export async function getFiles(req, res, next) {
  try {
    const repo = await repositoryService.getRepository(req.params.id);
    if (!repo || !repo.localPath) return res.status(404).json({ message: 'Repository not found' });
    const files = await listFiles(repo.localPath);
    const tree = buildTree(files.map((f) => f.path));
    res.json({ files, tree });
  } catch (err) {
    next(err);
  }
}

export async function getFileContent(req, res, next) {
  try {
    const repo = await repositoryService.getRepository(req.params.id);
    if (!repo || !repo.localPath) return res.status(404).json({ message: 'Repository not found' });
    const requested = req.query.path;
    if (!requested) return res.status(400).json({ message: 'path query parameter is required' });
    const { safeJoin } = await import('../utils/git.utils.js');
    const filePath = safeJoin(repo.localPath, requested);
    const stat = await fs.stat(filePath);
    if (stat.isDirectory()) return res.status(400).json({ message: 'Cannot read a directory' });
    const content = await fs.readFile(filePath, 'utf8');
    const lines = content.split('\n');
    res.json({ path: requested, content, lineCount: lines.length });
  } catch (err) {
    next(err);
  }
}

export async function reindexRepository(req, res, next) {
  try {
    const repo = await repositoryService.getRepository(req.params.id);
    if (!repo) return res.status(404).json({ message: 'Repository not found' });
    // trigger indexing again (clone already exists)
    const { startIndexing } = await import('../services/indexing.service.js');
    await prisma.repository.update({ where: { id: repo.id }, data: { status: 'scanning', currentStage: 'scanning', errorMessage: null } });
    startIndexing(repo.id).catch(async (err) => {
      await prisma.repository.update({ where: { id: repo.id }, data: { status: 'failed', errorMessage: err.message, currentStage: 'failed' } });
    });
    res.json({ message: 'Re-indexing started', id: repo.id });
  } catch (err) {
    next(err);
  }
}

export async function deleteRepository(req, res, next) {
  try {
    const result = await repositoryService.deleteRepository(req.params.id);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function getApis(req, res, next) {
  try {
    const repo = await repositoryService.getRepository(req.params.id);
    if (!repo || !repo.localPath) return res.status(404).json({ message: 'Repository not found' });
    const files = await listFiles(repo.localPath);
    const results = [];
    const seen = new Set();
    const addResult = (r) => {
      const key = `${r.method}|${r.path}|${r.file}|${r.line}`;
      if (seen.has(key)) return;
      seen.add(key);
      results.push(r);
    };

    for (const f of files) {
      const ext = path.extname(f.path).toLowerCase();
      let content;
      try {
        const { readFileSafe } = await import('../utils/file.utils.js');
        content = await readFileSafe(`${repo.localPath}/${f.path}`, 200000);
      } catch { continue; }
      if (!content) continue;

      const isPython = ext === '.py';
      const isJsTs = ext === '.js' || ext === '.jsx' || ext === '.ts' || ext === '.tsx';

      if (isPython) {
        // FastAPI
        const fastapiRegex = /@\w+\.(get|post|put|delete|patch)\s*\(\s*['"]([^'"]+)['"]/gi;
        let m;
        while ((m = fastapiRegex.exec(content)) !== null) {
          const idx = content.slice(0, m.index).split('\n').length;
          addResult({ method: m[1].toUpperCase(), path: m[2], file: f.path, line: idx, handler: null, framework: 'FastAPI' });
        }
        // Flask
        const flaskRegex = /@\w+\.route\s*\(\s*['"]([^'"]+)['"]\s*,\s*methods\s*=\s*\[\s*['"]([^'"]+)['"]/gi;
        while ((m = flaskRegex.exec(content)) !== null) {
          const idx = content.slice(0, m.index).split('\n').length;
          addResult({ method: m[2].toUpperCase(), path: m[1], file: f.path, line: idx, handler: null, framework: 'Flask' });
        }
        // Django REST Framework
        const djangoRegex = /@api_view\s*\(\s*\[\s*['"]([^'"]+)['"]/gi;
        while ((m = djangoRegex.exec(content)) !== null) {
          const idx = content.slice(0, m.index).split('\n').length;
          addResult({ method: m[1].toUpperCase(), path: '', file: f.path, line: idx, handler: null, framework: 'Django REST Framework' });
        }
      }

      if (isJsTs) {
        // Express / Fastify / Hono
        const expressRegex = /\b(app|router|fastify|server)\.(get|post|put|delete|patch)\s*\(\s*['"]([^'"]+)['"]/gi;
        let m;
        while ((m = expressRegex.exec(content)) !== null) {
          const idx = content.slice(0, m.index).split('\n').length;
          addResult({ method: m[2].toUpperCase(), path: m[3], file: f.path, line: idx, handler: null, framework: 'Express.js' });
        }
        // NestJS
        const nestRegex = /@(Get|Post|Put|Delete|Patch)\s*\(\s*['"]?([^'")\s]*)['"]?\s*\)/gi;
        while ((m = nestRegex.exec(content)) !== null) {
          const idx = content.slice(0, m.index).split('\n').length;
          addResult({ method: m[1].toUpperCase(), path: m[2] || '/', file: f.path, line: idx, handler: null, framework: 'NestJS' });
        }
      }
    }
    res.json({ apis: results, total: results.length });
  } catch (err) {
    next(err);
  }
}

function buildTree(paths) {
  const root = [];
  const map = {};
  for (const p of paths) {
    const segs = p.split('/').filter(Boolean);
    let current = root;
    let currentPath = '';
    segs.forEach((seg, idx) => {
      currentPath = currentPath ? `${currentPath}/${seg}` : seg;
      let node = map[currentPath];
      if (!node) {
        node = { title: seg, key: currentPath, isLeaf: idx === segs.length - 1, children: idx === segs.length - 1 ? undefined : [] };
        map[currentPath] = node;
        current.push(node);
      }
      if (idx < segs.length - 1) {
        if (!node.children) node.children = [];
        current = node.children;
      }
    });
  }
  return root;
}