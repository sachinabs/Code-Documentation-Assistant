import { prisma } from '../config/database.js';
import { scanRepository, computeLanguageStats, detectTechStack } from './file-scanner.service.js';
import { chunkCode } from './chunking.service.js';
import { embedTexts } from './embedding.service.js';
import { addChunks } from './vector.service.js';

const BATCH_SIZE = 20;

export async function startIndexing(repositoryId) {
  const repo = await prisma.repository.findUnique({ where: { id: repositoryId } });
  if (!repo || !repo.localPath) throw new Error('Repository not found');

  await prisma.repository.update({
    where: { id: repositoryId },
    data: { status: 'scanning', currentStage: 'scanning' },
  });

  const files = await scanRepository(repo.localPath);
  const languages = await computeLanguageStats(repo.localPath);
  const techStack = await detectTechStack(repo.localPath);

  await prisma.repository.update({
    where: { id: repositoryId },
    data: { totalFiles: files.length, languages, techStack, status: 'chunking', currentStage: 'chunking' },
  });

  // chunk all files
  const allChunks = [];
  for (const file of files) {
    const chunks = chunkCode(file.content, file.path, file.language);
    for (const c of chunks) {
      allChunks.push({
        repositoryId,
        filePath: c.filePath,
        language: c.language,
        startLine: c.startLine,
        endLine: c.endLine,
        content: c.content,
      });
    }
  }

  await prisma.repository.update({
    where: { id: repositoryId },
    data: { status: 'embedding', currentStage: 'embedding' },
  });

  // assign ids and batch embed
  const prepared = allChunks.map((c, i) => ({
    ...c,
    id: `${repositoryId}:${i}`,
  }));

  let processedFiles = 0;
  const fileSet = new Set();
  for (let i = 0; i < prepared.length; i += BATCH_SIZE) {
    const batch = prepared.slice(i, i + BATCH_SIZE);
    const embeddings = await embedTexts(batch.map((c) => c.content));
    await addChunks(batch, embeddings);
    batch.forEach((c) => fileSet.add(c.filePath));
    processedFiles = fileSet.size;
    await prisma.repository.update({
      where: { id: repositoryId },
      data: { indexedFiles: processedFiles, totalChunks: i + batch.length },
    });
  }

  await prisma.repository.update({
    where: { id: repositoryId },
    data: {
      status: 'completed',
      currentStage: 'completed',
      indexedFiles: files.length,
      totalChunks: prepared.length,
    },
  });
}