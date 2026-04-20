import { apiRequest } from '@/features/shared/api-client';

export const automation = {
  listRuns: () => apiRequest('automation/runs'),
  getRunSummary: (id: string) => apiRequest(`automation/runs/${id}/summary`),
  createRun: (data: any) =>
    apiRequest('automation/runs', { method: 'POST', body: JSON.stringify(data) }),
  closeRun: (id: string, reason?: string) =>
    apiRequest(`automation/runs/${id}/close`, {
      method: 'POST',
      body: JSON.stringify({ reason: reason || 'manual' }),
    }),
  listTemplates: () => apiRequest('automation/templates'),
  createTemplate: (data: any) =>
    apiRequest('automation/templates', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  updateTemplate: (id: string, data: any) =>
    apiRequest(`automation/templates/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  deleteTemplate: (id: string) =>
    apiRequest(`automation/templates/${id}`, {
      method: 'DELETE',
    }),
  listTemplateRuns: (id: string) => apiRequest(`automation/templates/${id}/runs`),
  executeTemplate: (id: string, data?: any) =>
    apiRequest(`automation/templates/${id}/execute`, {
      method: 'POST',
      body: JSON.stringify(data || {}),
    }),
  runTemplate: (id: string) =>
    apiRequest(`automation/templates/${id}/run`, {
      method: 'POST',
      body: JSON.stringify({}),
    }),
  checkTemplate: (id: string) =>
    apiRequest(`automation/templates/${id}/check`, {
      method: 'POST',
      body: JSON.stringify({}),
    }),
  health: () => apiRequest('automation/openclaw/health'),
  n8nStatus: (params?: Record<string, string>) => {
    const search = new URLSearchParams(params).toString();
    return apiRequest(`automation/n8n/status${search ? `?${search}` : ''}`);
  },
};
