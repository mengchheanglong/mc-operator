import { apiRequest } from '@/features/shared/api-client';

export const quests = {
  list: (filters?: Record<string, string>) => {
    const params = new URLSearchParams({
      ...(filters || {}),
      withMeta: '1',
    });
    return apiRequest(`quests?${params.toString()}`);
  },
  get: (id: string) => apiRequest(`quests/${id}`),
  create: (data: any) =>
    apiRequest('quests', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: any) =>
    apiRequest(`quests/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  complete: (id: string, data?: any) =>
    apiRequest(`quests/${id}/complete`, {
      method: 'PUT',
      body: JSON.stringify(data || {}),
    }),
  delete: (id: string) =>
    apiRequest(`quests/${id}`, { method: 'DELETE' }),
};
