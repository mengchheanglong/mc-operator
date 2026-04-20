import { apiRequest } from '@/features/shared/api-client';

export const notes = {
  list: () => apiRequest('notes'),
  create: (data: any) =>
    apiRequest('notes', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: any) =>
    apiRequest(`notes/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: string) =>
    apiRequest(`notes/${id}`, { method: 'DELETE' }),
};

