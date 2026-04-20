import { apiRequest } from '@/features/shared/api-client';

export const ops = {
  health: () => apiRequest('ops/health'),
  listNightly: (params?: Record<string, string>) => {
    const search = new URLSearchParams(params).toString();
    return apiRequest(`ops/nightly${search ? `?${search}` : ''}`);
  },
  workflowGuards: (params?: Record<string, string>) => {
    const search = new URLSearchParams(params).toString();
    return apiRequest(`workflow/guards${search ? `?${search}` : ''}`);
  },
};
