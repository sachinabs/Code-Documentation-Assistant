import axios from 'axios';
import { OLLAMA_BASE_URL, OLLAMA_EMBEDDING_MODEL } from '../config/ollama.js';

export async function embedTexts(texts) {
  if (!texts || texts.length === 0) return [];
  try {
    const response = await axios.post(`${OLLAMA_BASE_URL}/api/embed`, {
      model: OLLAMA_EMBEDDING_MODEL,
      input: texts,
    }, { timeout: 300000 });
    return response.data.embeddings;
  } catch (err) {
    console.error('Embedding error:', err?.response?.data || err.message);
    throw new Error('Embedding service is temporarily unavailable. Please try again.');
  }
}

export async function embedText(text) {
  const [emb] = await embedTexts([text]);
  return emb;
}