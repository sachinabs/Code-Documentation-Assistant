import { walkDirectory, readFileSafe, detectLanguage, SUPPORTED_EXTENSIONS } from '../utils/file.utils.js';
import path from 'path';
import fs from 'fs/promises';

const MAX_FILE_SIZE = parseInt(process.env.MAX_FILE_SIZE_BYTES || '200000', 10);

export async function scanRepository(localPath) {
  const files = await walkDirectory(localPath);
  const result = [];
  for (const f of files) {
    const ext = path.extname(f.relative).toLowerCase();
    if (!SUPPORTED_EXTENSIONS.has(ext)) continue;
    const content = await readFileSafe(f.fullPath, MAX_FILE_SIZE);
    if (content === null) continue;
    result.push({
      path: f.relative,
      fullPath: f.fullPath,
      language: detectLanguage(f.relative),
      content,
    });
  }
  return result;
}

export async function listFiles(localPath) {
  const files = await walkDirectory(localPath);
  return files.map((f) => ({
    path: f.relative,
    language: detectLanguage(f.relative),
  }));
}

export async function computeLanguageStats(localPath) {
  const files = await walkDirectory(localPath);
  const stats = {};
  let totalFiles = 0;
  for (const f of files) {
    const ext = path.extname(f.relative).toLowerCase();
    if (!SUPPORTED_EXTENSIONS.has(ext)) continue;
    const language = detectLanguage(f.relative);
    if (language === 'unknown') continue;
    const content = await readFileSafe(f.fullPath, MAX_FILE_SIZE);
    if (content === null) continue;
    if (!stats[language]) stats[language] = { name: languageName(language), files: 0, lines: 0 };
    stats[language].files += 1;
    stats[language].lines += content.split('\n').length;
    totalFiles += 1;
  }
  const result = Object.values(stats).map((s) => ({
    name: s.name,
    files: s.files,
    lines: s.lines,
    percentage: totalFiles > 0 ? Math.round((s.files / totalFiles) * 100) : 0,
  }));
  result.sort((a, b) => b.files - a.files);
  return result;
}

function languageName(lang) {
  const map = {
    javascript: 'JavaScript',
    typescript: 'TypeScript',
    python: 'Python',
    java: 'Java',
    go: 'Go',
    php: 'PHP',
    json: 'JSON',
    markdown: 'Markdown',
    sql: 'SQL',
    yaml: 'YAML',
    shell: 'Shell',
  };
  return map[lang] || lang;
}

export async function detectTechStack(localPath) {
  const stack = {
    languages: [],
    frameworks: [],
    libraries: [],
    databases: [],
    entryPoints: [],
  };

  // Entry points
  const entryCandidates = [
    'run.py', 'main.py', 'app.py', 'app/main.py', 'server.py',
    'index.js', 'server.js', 'app.js', 'main.js', 'src/index.js', 'src/server.js', 'src/app.js',
    'main.go', 'main.java', 'Application.java',
  ];
  for (const c of entryCandidates) {
    try {
      await fs.access(path.join(localPath, c));
      stack.entryPoints.push(c);
    } catch {}
  }

  // package.json
  try {
    const raw = await fs.readFile(path.join(localPath, 'package.json'), 'utf8');
    const pkg = JSON.parse(raw);
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    const names = Object.keys(deps);
    if (names.includes('express')) stack.frameworks.push('Express.js');
    if (names.includes('fastify')) stack.frameworks.push('Fastify');
    if (names.includes('nestjs') || names.includes('@nestjs/core')) stack.frameworks.push('NestJS');
    if (names.includes('react')) stack.frameworks.push('React');
    if (names.includes('vue')) stack.frameworks.push('Vue.js');
    if (names.includes('next')) stack.frameworks.push('Next.js');
    if (names.includes('mongoose')) stack.databases.push('MongoDB');
    if (names.includes('pg') || names.includes('postgres')) stack.databases.push('PostgreSQL');
    if (names.includes('mysql') || names.includes('mysql2')) stack.databases.push('MySQL');
    if (names.includes('redis')) stack.databases.push('Redis');
    stack.libraries.push(...names.slice(0, 20));
  } catch {}

  // requirements.txt
  try {
    const raw = await fs.readFile(path.join(localPath, 'requirements.txt'), 'utf8');
    const lines = raw.split('\n').map((l) => l.trim().toLowerCase()).filter(Boolean);
    const names = lines.map((l) => l.split('==')[0].split('>=')[0].split('<=')[0].trim());
    if (names.some((n) => n.includes('fastapi'))) stack.frameworks.push('FastAPI');
    if (names.some((n) => n.includes('flask'))) stack.frameworks.push('Flask');
    if (names.some((n) => n.includes('django'))) stack.frameworks.push('Django');
    if (names.some((n) => n.includes('starlette'))) stack.frameworks.push('Starlette');
    if (names.some((n) => n.includes('uvicorn'))) stack.libraries.push('Uvicorn');
    if (names.some((n) => n.includes('sqlalchemy'))) stack.databases.push('SQLAlchemy');
    if (names.some((n) => n.includes('psycopg') || n.includes('asyncpg'))) stack.databases.push('PostgreSQL');
    if (names.some((n) => n.includes('pymongo') || n.includes('motor'))) stack.databases.push('MongoDB');
    if (names.some((n) => n.includes('redis'))) stack.databases.push('Redis');
    stack.libraries.push(...names.slice(0, 20));
  } catch {}

  // pyproject.toml
  try {
    const raw = await fs.readFile(path.join(localPath, 'pyproject.toml'), 'utf8');
    if (/fastapi/i.test(raw)) stack.frameworks.push('FastAPI');
    if (/flask/i.test(raw)) stack.frameworks.push('Flask');
    if (/django/i.test(raw)) stack.frameworks.push('Django');
  } catch {}

  // go.mod
  try {
    const raw = await fs.readFile(path.join(localPath, 'go.mod'), 'utf8');
    if (/gin-gonic/i.test(raw)) stack.frameworks.push('Gin');
    if (/gofiber/i.test(raw)) stack.frameworks.push('Fiber');
    if (/echo/i.test(raw)) stack.frameworks.push('Echo');
    if (/gorm/i.test(raw)) stack.databases.push('GORM');
  } catch {}

  // pom.xml / build.gradle
  try {
    const raw = await fs.readFile(path.join(localPath, 'pom.xml'), 'utf8');
    if (/spring-boot/i.test(raw)) stack.frameworks.push('Spring Boot');
    if (/spring-web/i.test(raw)) stack.frameworks.push('Spring MVC');
  } catch {}
  try {
    const raw = await fs.readFile(path.join(localPath, 'build.gradle'), 'utf8');
    if (/spring-boot/i.test(raw)) stack.frameworks.push('Spring Boot');
  } catch {}

  // Deduplicate
  stack.frameworks = [...new Set(stack.frameworks)];
  stack.databases = [...new Set(stack.databases)];
  stack.libraries = [...new Set(stack.libraries)].slice(0, 20);

  // Languages from computeLanguageStats? caller can merge.
  return stack;
}