import { ChromaClient } from 'chromadb';
import { CHROMA_URL, CHROMA_COLLECTION } from '../config/chroma.js';

let client = null;
let collection = null;

async function getClient() {
  if (!client) client = new ChromaClient({ path: CHROMA_URL });
  return client;
}

async function getCollection() {
  if (!collection) {
    const c = await getClient();
    collection = await c.getOrCreateCollection({ name: CHROMA_COLLECTION });
  }
  return collection;
}

export async function addChunks(chunks, embeddings) {
  const col = await getCollection();
  const ids = chunks.map((c) => c.id);
  const documents = chunks.map((c) => c.content);
  const metadatas = chunks.map((c) => ({
    repositoryId: c.repositoryId,
    filePath: c.filePath,
    language: c.language,
    startLine: c.startLine,
    endLine: c.endLine,
  }));
  await col.add({ ids, documents, embeddings, metadatas });
}

export async function searchChunks(repositoryId, queryEmbedding, topK = 5) {
  const col = await getCollection();
  const result = await col.query({
    queryEmbeddings: [queryEmbedding],
    nResults: topK,
    where: { repositoryId },
  });
  const docs = result.documents?.[0] || [];
  const metas = result.metadatas?.[0] || [];
  const ids = result.ids?.[0] || [];
  return docs.map((doc, i) => ({
    id: ids[i],
    content: doc,
    filePath: metas[i]?.filePath,
    language: metas[i]?.language,
    startLine: metas[i]?.startLine,
    endLine: metas[i]?.endLine,
  }));
}

export async function deleteRepositoryChunks(repositoryId) {
  const col = await getCollection();
  await col.delete({ where: { repositoryId } });
}