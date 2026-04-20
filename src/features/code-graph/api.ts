import { apiRequest } from '@/features/shared/api-client';

export const codeGraph = {
  index: (data?: any) =>
    apiRequest('code-graph/index', {
      method: 'POST',
      body: JSON.stringify(data || {}),
    }),
};

