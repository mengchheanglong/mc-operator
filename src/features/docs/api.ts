import { apiRequest } from '@/features/shared/api-client';

export const docs = {
  list: (filters?: Record<string, string>) => {
    const params = new URLSearchParams(filters);
    return apiRequest(`docs${params.toString() ? `?${params.toString()}` : ''}`);
  },
  create: (data: any) =>
    apiRequest('docs', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: any) =>
    apiRequest(`docs/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: string) =>
    apiRequest(`docs/${id}`, { method: 'DELETE' }),
};
