import { apiRequest } from '@/features/shared/api-client';

export const projects = {
  list: () => apiRequest('projects', { projectScope: 'none' }),
  active: () => apiRequest('projects/active', { projectScope: 'none' }),
  activate: (id: string) =>
    apiRequest('projects/active', {
      method: 'PUT',
      projectScope: 'none',
      body: JSON.stringify({ projectId: id }),
    }),
};

