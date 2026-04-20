import { apiRequest } from '@/features/shared/api-client';

export const reports = {
  list: (filters?: Record<string, string>) => {
    const params = new URLSearchParams({
      ...(filters || {}),
      withMeta: '1',
    });
    return apiRequest(`reports?${params.toString()}`);
  },
  create: (data: any) =>
    apiRequest('reports', { method: 'POST', body: JSON.stringify(data) }),
  delete: (id: string) =>
    apiRequest(`reports/${id}`, { method: 'DELETE' }),
};
