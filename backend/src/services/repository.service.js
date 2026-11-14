import fs from 'fs/promises';
import path from 'path';
import { prisma } from '../config/database.js';
import { validateGitHubUrl } from './github.service.js';
import { runGit, safeJoin } from '../utils/git.utils.js';

const STORAGE_PATH = process.env.REPOSITORY_STORAGE_PATH || './storage/repositories';

export async function findRepositoryByUrl(url) {
  return prisma.repository.findFirst({ where: { githubUrl: url } });
}

export async function getRepository(id) {
  return prisma.repository.findUnique({ where: { id } });
}

export async function listRepositories() {
  return prisma.repository.findMany({ orderBy: { createdAt: 'desc' } });
}

export async function createRepository(url) {
  const { owner, repo, url: cleanUrl } = validateGitHubUrl(url);
  const existing = await findRepositoryByUrl(cleanUrl);
  if (existing) return existing;

  const repository = await prisma.repository.create({
    data: {
      name: repo,
      owner,
      githubUrl: cleanUrl,
      status: 'pending',
    },
  });

  const localPath = safeJoin(STORAGE_PATH, `${owner}__${repo}__${repository.id}`);
  await fs.mkdir(path.dirname(localPath), { recursive: true });

  await prisma.repository.update({
    where: { id: repository.id },
    data: { localPath, status: 'cloning', currentStage: 'cloning' },
  });

  // clone asynchronously
  cloneRepository(repository.id, cleanUrl, localPath).catch(async (err) => {
    await prisma.repository.update({
      where: { id: repository.id },
      data: { status: 'failed', errorMessage: err.message, currentStage: 'failed' },
    });
  });

  return prisma.repository.findUnique({ where: { id: repository.id } });
}

async function cloneRepository(id, url, localPath) {
  await runGit(['clone', '--depth', '1', url, localPath], { timeout: 300000 });
  // detect default branch
  let branch = 'main';
  try {
    const { stdout } = await runGit(['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: localPath });
    branch = stdout.trim() || branch;
  } catch {}
  await prisma.repository.update({
    where: { id },
    data: { defaultBranch: branch, status: 'scanning', currentStage: 'scanning' },
  });
  const { startIndexing } = await import('./indexing.service.js');
  startIndexing(id).catch(async (err) => {
    await prisma.repository.update({
      where: { id },
      data: { status: 'failed', errorMessage: err.message, currentStage: 'failed' },
    });
  });
}

export async function deleteRepository(id) {
  const repo = await getRepository(id);
  if (!repo) throw new Error('Repository not found');

  // Verify localPath is inside configured storage directory.
  const storageRoot = path.resolve(process.env.REPOSITORY_STORAGE_PATH || './storage/repositories');
  if (repo.localPath) {
    const resolved = path.resolve(repo.localPath);
    if (!resolved.startsWith(storageRoot)) {
      throw new Error('Invalid repository storage path');
    }
  }

  // Delete vector records.
  try {
    const { deleteRepositoryChunks } = await import('./vector.service.js');
    await deleteRepositoryChunks(id);
  } catch (err) {
    console.error('Vector deletion error:', err?.message);
  }

  // Database transaction for cascade deletion.
  await prisma.$transaction(async (tx) => {
    await tx.message.deleteMany({ where: { conversation: { repositoryId: id } } });
    await tx.conversation.deleteMany({ where: { repositoryId: id } });
    await tx.milestone.deleteMany({ where: { repositoryId: id } });
    await tx.repository.delete({ where: { id } });
  });

  // Remove cloned directory.
  if (repo.localPath) {
    try {
      await fs.rm(repo.localPath, { recursive: true, force: true });
    } catch (err) {
      console.error('Filesystem deletion error:', err?.message);
      throw new Error('Failed to delete repository files');
    }
  }

  return { success: true, message: 'Repository and associated data deleted successfully' };
}