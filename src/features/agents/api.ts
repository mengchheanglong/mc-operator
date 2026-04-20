import { apiRequest } from '@/features/shared/api-client';

export const agents = {
  list: () => apiRequest('agents'),
  create: (data: any) =>
    apiRequest('agents', { method: 'POST', body: JSON.stringify(data) }),
  status: (id: string) => apiRequest(`agents/${id}/status`),
  start: (id: string) =>
    apiRequest(`agents/${id}/restore`, { method: 'POST', body: JSON.stringify({}) }),
  stop: (id: string) =>
    apiRequest(`agents/${id}/kill`, { method: 'POST', body: JSON.stringify({}) }),
  dispatch: (id: string, data?: any) =>
    apiRequest(`agents/${id}/dispatch`, {
      method: 'POST',
      body: JSON.stringify(data || {}),
    }),
  importPack: (data: any) =>
    apiRequest('agents/import-packs', { method: 'POST', body: JSON.stringify(data) }),
  kill: (id: string) =>
    apiRequest(`agents/${id}/kill`, { method: 'POST', body: JSON.stringify({}) }),
  restore: (id: string) =>
    apiRequest(`agents/${id}/restore`, { method: 'POST', body: JSON.stringify({}) }),
};

