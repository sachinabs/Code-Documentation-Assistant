import axios from 'axios';
import { OLLAMA_BASE_URL, OLLAMA_EMBEDDING_MODEL, OLLAMA_NUM_GPU, EMBEDDING_TIMEOUT } from '../config/ollama.js';

const NUM_GPU = OLLAMA_NUM_GPU;

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function embedTexts(texts) {
  if (!texts || texts.length === 0) return [];
  let lastError;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await axios.post(`${OLLAMA_BASE_URL}/api/embed`, {
        model: OLLAMA_EMBEDDING_MODEL,
        input: texts,
        options: { num_gpu: NUM_GPU },
      }, { timeout: EMBEDDING_TIMEOUT });
      return response.data.embeddings;
    } catch (err) {
      lastError = err;
      console.error('Embedding error (attempt ' + (attempt + 1) + '):', err?.response?.data || err.message);
      if (attempt < 1) await sleep(2000);
    }
  }
  throw new Error('Embedding service is temporarily unavailable. Please try again.');
}

export async function embedText(text) {
  const [emb] = await embedTexts([text]);
  return emb;
}