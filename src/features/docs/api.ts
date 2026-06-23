import { apiRequest } from '@/features/shared/api-client';

export type DocScope = 'project' | 'shared';

export interface DocRecord {
  id: string;
  userId: string;
  projectId: string;
  title: string;
  titleNormalized: string;
  content: string;
  fileType: string;
  createdAt: string;
  updatedAt: string;
  tags: string[];
  scope: DocScope;
}

export interface CreateDocPayload {
  title: string;
  content: string;
  fileType?: string;
  scope?: DocScope;
  tags?: string[];
}

export type UpdateDocPayload = Partial<CreateDocPayload>;

export interface DocListResponse {
  docs: DocRecord[];
}

export interface DocMutationResponse {
  msg: string;
  doc: DocRecord;
}

export interface MessageResponse {
  msg: string;
}

export const docs = {
  list: (filters?: Record<string, string>) => {
    const params = new URLSearchParams(filters);
    return apiRequest<DocListResponse>(`docs${params.toString() ? `?${params.toString()}` : ''}`);
  },
  create: (data: CreateDocPayload) =>
    apiRequest<DocMutationResponse>('docs', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: UpdateDocPayload) =>
    apiRequest<DocMutationResponse>(`docs/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: string) =>
    apiRequest<MessageResponse>(`docs/${id}`, { method: 'DELETE' }),
};
