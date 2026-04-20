import { apiRequest } from '@/features/shared/api-client';

export const workspace = {
  bootstrap: () =>
    apiRequest('workspace/bootstrap', { method: 'POST', body: JSON.stringify({}) }),
};

