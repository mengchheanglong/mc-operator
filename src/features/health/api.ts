import { apiRequest } from '@/features/shared/api-client';

export const health = {
  check: () => apiRequest('health'),
};

