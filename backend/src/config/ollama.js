export const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
export const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'qwen2.5:3b';
export const OLLAMA_EMBEDDING_MODEL = process.env.OLLAMA_EMBEDDING_MODEL || 'nomic-embed-text';
export const OLLAMA_NUM_GPU = parseInt(process.env.OLLAMA_NUM_GPU || '99', 10);
export const EMBEDDING_TIMEOUT = parseInt(process.env.EMBEDDING_TIMEOUT || '180000', 10);
export const CHAT_TIMEOUT = parseInt(process.env.CHAT_TIMEOUT || '300000', 10);