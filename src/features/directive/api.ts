import { apiRequest } from '@/features/shared/api-client';

export const directive = {
  listCapabilities: () => apiRequest('directive-workspace/capabilities'),
  listRegistry: () => apiRequest('directive-workspace/registry'),
  workspaceOverview: () => apiRequest('directive-workspace/workspace/overview'),
  discoveryOverview: () => apiRequest('directive-workspace/discovery/overview'),
  architectureOverview: () => apiRequest('directive-workspace/architecture/overview'),
  createCapability: (data: any) =>
    apiRequest('directive-workspace/capabilities', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  getCapability: (id: string) =>
    apiRequest(`directive-workspace/capabilities/${id}`),
  getLifecycle: (id: string) =>
    apiRequest(`directive-workspace/capabilities/${id}/lifecycle`),
  addAnalysis: (id: string, data: any) =>
    apiRequest(`directive-workspace/capabilities/${id}/analysis`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  createExperiment: (id: string, data: any) =>
    apiRequest(`directive-workspace/capabilities/${id}/experiments`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  addEvaluation: (id: string, data: any) =>
    apiRequest(`directive-workspace/capabilities/${id}/evaluations`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  makeDecision: (id: string, data: any) =>
    apiRequest(`directive-workspace/capabilities/${id}/decision`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  addProof: (id: string, data: any) =>
    apiRequest(`directive-workspace/capabilities/${id}/proof`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  advanceLifecycle: (id: string, data: any) =>
    apiRequest(`directive-workspace/capabilities/${id}/lifecycle`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
};
