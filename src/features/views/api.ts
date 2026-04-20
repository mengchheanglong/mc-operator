import { apiRequest } from '@/features/shared/api-client';

export const views = {
  list: (surface?: string) => {
    const params = surface ? `?surface=${surface}` : '';
    return apiRequest(`views${params}`);
  },
  create: (data: any) =>
    apiRequest('views', { method: 'POST', body: JSON.stringify(data) }),
  delete: (id: string) =>
    apiRequest(`views/${id}`, { method: 'DELETE' }),
};

