import { apiRequest } from '@/features/shared/api-client';

export const projects = {
  list: () => apiRequest('projects'),
  activate: async (id: string) => ({ activeProjectId: id }),
};

