import { apiRequest } from '@/features/shared/api-client';

export const context = {
  export: () => apiRequest('context/export'),
};

