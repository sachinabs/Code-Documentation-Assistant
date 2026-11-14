import axios from 'axios';

const api = axios.create({
  baseURL: 'http://localhost:5000/api',
  timeout: 300000,
});

export function getErrorMessage(err) {
  if (err?.response?.data?.message) return err.response.data.message;
  if (err?.response?.data?.error) return err.response.data.error;
  if (err?.code === 'ERR_NETWORK' || !err?.response) {
    return 'Backend is unavailable. Please ensure the backend service is running.';
  }
  if (err?.message) return err.message;
  return 'An unexpected error occurred.';
}

export const repositoriesApi = {
  create: (url) => api.post('/repositories', { url }),
  list: () => api.get('/repositories'),
  get: (id) => api.get(`/repositories/${id}`),
  files: (id) => api.get(`/repositories/${id}/files`),
  fileContent: (id, path) =>
    api.get(`/repositories/${id}/files/content`, { params: { path } }),
  status: (id) => api.get(`/repositories/${id}/status`),
  apis: (id) => api.get(`/repositories/${id}/apis`),
  delete: (id) => api.delete(`/repositories/${id}`),
  reindex: (id) => api.post(`/repositories/${id}/reindex`),
};

export const chatApi = {
  send: (repositoryId, question, conversationId) =>
    api.post('/chat', { repositoryId, question, conversationId }),
  conversations: (repositoryId) => api.get(`/repositories/${repositoryId}/conversations`),
};

export function toArray(res) {
  const d = res?.data?.data ?? res?.data ?? res;
  if (Array.isArray(d)) return d;
  for (const k of ['repositories', 'items', 'results', 'data', 'files', 'conversations', 'messages', 'tree']) {
    if (Array.isArray(d?.[k])) return d[k];
  }
  return [];
}

export default api;